import { beforeAll, afterAll, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { createPlatform } from './app';
import { HOLO_VARIANTS } from '@gacha-triad/shared';
let p: Awaited<ReturnType<typeof createPlatform>>,
  serial = 0;
beforeAll(async () => {
  p = await createPlatform(resolve('.'), { memory: true, timers: false });
  p.store.isOnline = () => true;
});
afterAll(async () => {
  await p.app.close();
});
async function user() {
  const n = ++serial,
    ip = `198.18.1.${n}`;
  const r = await p.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    remoteAddress: ip,
    payload: {
      name: `Patch ${n}`,
      email: `patch-${n}@test.invalid`,
      password: 'patch-test-password-123',
    },
  });
  expect(r.statusCode, r.body).toBe(200);
  const actor = { ...r.json().user, isAnonymous: false },
    token = String(r.headers['set-auth-token']);
  let profile = await p.store.profile(actor);
  for (const pack of await p.store.economy.list(profile.id))
    await p.store.economy.open(profile.id, pack.id);
  await p.store.completeTutorial(profile.id);
  await p.store.acknowledgeRanked(profile.id);
  profile = await p.store.profile(actor);
  return { actor, profile, token, ip };
}
type Client = Awaited<ReturnType<typeof user>>;
async function reserved(c: Client, card: string) {
  return (
    (
      await p.db.read((sql) =>
        sql<{ reserved: number }>(
          'SELECT reserved FROM inventory WHERE profile_id=$1 AND card_id=$2',
          [c.profile.id, card],
        ),
      )
    )[0]?.reserved ?? 0
  );
}
function request(
  c: Client,
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
) {
  return p.app.inject({
    method: method as 'GET' | 'POST' | 'DELETE',
    url: '/api' + path,
    remoteAddress: c.ip,
    headers: { authorization: `Bearer ${c.token}` },
    ...(body === undefined ? {} : { payload: body as object }),
  });
}
async function prisms(c: Client, amount: number) {
  await p.db.read((sql) =>
    sql('UPDATE profiles SET prisms=$1 WHERE id=$2', [amount, c.profile.id]),
  );
}
it('sells one reserved card once, conserves currency and prunes the seller deck under concurrent purchases', async () => {
  const seller = await user(),
    a = await user(),
    b = await user(),
    card = seller.profile.deck[0];
  await p.db.read((sql) =>
    sql('UPDATE inventory SET quantity=1 WHERE profile_id=$1 AND card_id=$2', [
      seller.profile.id,
      card,
    ]),
  );
  await prisms(seller, 100);
  await prisms(a, 1000);
  await prisms(b, 1000);
  const beforeA = (await p.store.profile(a.actor)).inventory[card]?.quantity ?? 0,
    beforeB = (await p.store.profile(b.actor)).inventory[card]?.quantity ?? 0;
  const posted = await request(seller, '/trades', { offered: card, price: 236 });
  expect(posted.statusCode, posted.body).toBe(200);
  const id = posted.json().id;
  expect((await request(a, '/trades')).json().some((o: { id: string }) => o.id === id)).toBe(false);
  expect(
    (await request(a, '/trades?includeSales=true')).json().some((o: { id: string }) => o.id === id),
  ).toBe(true);
  expect((await p.trades.list()).find((o) => o.id === id)).toMatchObject({
    price: 236,
    wanted: null,
  });
  expect(await reserved(seller, card)).toBe(1);
  const outcomes = await Promise.all([
    request(a, `/trades/${id}/accept`, {}),
    request(b, `/trades/${id}/accept`, {}),
  ]);
  expect(outcomes.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  const sa = await p.store.profile(seller.actor),
    pa = await p.store.profile(a.actor),
    pb = await p.store.profile(b.actor);
  expect(sa.prisms).toBe(336);
  expect(pa.prisms + pb.prisms).toBe(1764);
  expect((pa.inventory[card]?.quantity ?? 0) + (pb.inventory[card]?.quantity ?? 0)).toBe(
    beforeA + beforeB + 1,
  );
  expect(sa.deck).not.toContain(card);
  expect(sa.inventory[card]).toBeUndefined();
  expect((await request(a, `/trades/${id}/accept`, {})).statusCode).toBe(409);
  const ledger = await p.db.read((sql) =>
    sql<{ delta: number }>('SELECT delta FROM prism_ledger WHERE reference=$1', [`market:${id}`]),
  );
  expect(ledger.map((r) => r.delta).sort((x, y) => x - y)).toEqual([-236, 236]);
});
it('rejects invalid sale prices, self purchases and insufficient funds without partial changes', async () => {
  const seller = await user(),
    buyer = await user(),
    card = seller.profile.deck[0];
  for (const price of [0, -1, 1.5, 1000001, '236', null])
    expect((await request(seller, '/trades', { offered: card, price })).statusCode).toBe(400);
  expect(
    (await request(seller, '/trades', { offered: card, wanted: buyer.profile.deck[0], price: 236 }))
      .statusCode,
  ).toBe(400);
  const { id } = await p.trades.create(seller.profile, card, null, 236);
  expect((await request(seller, `/trades/${id}/accept`, {})).statusCode).toBe(400);
  await prisms(buyer, 235);
  expect((await request(buyer, `/trades/${id}/accept`, {})).statusCode).toBe(400);
  expect((await p.store.profile(buyer.actor)).prisms).toBe(235);
  expect(await reserved(seller, card)).toBe(1);
  await p.trades.cancel(seller.profile, id);
  expect(await reserved(seller, card)).toBe(0);
  expect((await request(buyer, `/trades/${id}/accept`, {})).statusCode).toBe(409);
});
it('moves the exact Holo copy and rolls back a payment if the seller cannot receive it', async () => {
  const seller = await user(),
    buyer = await user(),
    card = HOLO_VARIANTS[0];
  await p.db.read((sql) =>
    sql('INSERT INTO inventory(profile_id,card_id,quantity) VALUES($1,$2,1)', [
      seller.profile.id,
      card.id,
    ]),
  );
  await prisms(seller, 2147483647);
  await prisms(buyer, 1000);
  const { id } = await p.trades.create(seller.profile, card.id, null, 236);
  expect((await request(buyer, `/trades/${id}/accept`, {})).statusCode).toBe(409);
  expect((await p.store.profile(buyer.actor)).prisms).toBe(1000);
  await prisms(seller, 0);
  expect((await request(buyer, `/trades/${id}/accept`, {})).statusCode).toBe(200);
  expect((await p.store.profile(buyer.actor)).inventory[card.id].quantity).toBe(1);
});
it('does not overspend a buyer balance when two different sales are accepted concurrently', async () => {
  const a = await user(),
    b = await user(),
    buyer = await user();
  await prisms(a, 0);
  await prisms(b, 0);
  await prisms(buyer, 1000);
  const first = await p.trades.create(a.profile, a.profile.deck[0], null, 600),
    second = await p.trades.create(b.profile, b.profile.deck[0], null, 600);
  const results = await Promise.all([
    request(buyer, `/trades/${first.id}/accept`, {}),
    request(buyer, `/trades/${second.id}/accept`, {}),
  ]);
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400]);
  expect((await p.store.profile(buyer.actor)).prisms).toBe(400);
  expect((await p.store.profile(a.actor)).prisms + (await p.store.profile(b.actor)).prisms).toBe(
    600,
  );
  expect(
    (await p.trades.list()).filter((o) => o.id === first.id || o.id === second.id),
  ).toHaveLength(1);
});
it('keeps Season 0 Ranked and Draft records separate and exposes the exact stored rating delta', async () => {
  const a = await user(),
    b = await user();
  await p.store.createLobby(a.profile, { mode: 'ranked', allowBots: false });
  const { matchId } = await p.store.createLobby(b.profile, { mode: 'ranked', allowBots: false });
  await p.store.resign(b.profile.id, matchId!);
  const win = await p.store.view(a.profile.id, matchId!),
    loss = await p.store.view(b.profile.id, matchId!);
  expect(win.ratedResult).toMatchObject({
    season: 0,
    rating: 1016,
    delta: 16,
    wins: 1,
    losses: 0,
    draws: 0,
  });
  expect(loss.ratedResult).toMatchObject({
    season: 0,
    rating: 984,
    delta: -16,
    wins: 0,
    losses: 1,
    draws: 0,
  });
  expect((await p.store.view('', matchId!, true, true)).ratedResult).toBeNull();
  await p.store.claimCard(a.profile.id, matchId!, win.trade.choices[0].id);
  await p.store.createLobby(a.profile, { mode: 'draft', allowBots: false });
  const draft = await p.store.createLobby(b.profile, { mode: 'draft', allowBots: false });
  await p.store.resign(a.profile.id, draft.matchId!);
  expect((await p.store.view(a.profile.id, draft.matchId!)).ratedResult).toMatchObject({
    season: 0,
    wins: 0,
    losses: 1,
    delta: -16,
  });
  expect((await p.store.view(a.profile.id, matchId!)).ratedResult).toMatchObject({
    wins: 1,
    losses: 0,
  });
});
