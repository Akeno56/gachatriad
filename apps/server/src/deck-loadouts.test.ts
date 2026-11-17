import { beforeAll, afterAll, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { createPlatform } from './app';
import { CARDS } from '@gacha-triad/shared';
import type { DeckLoadout } from '@gacha-triad/shared/platform';
let p: Awaited<ReturnType<typeof createPlatform>>,
  serial = 0;
const cards = CARDS.filter((card) => card.enabled && card.rarity === 1)
  .slice(0, 7)
  .map((card) => card.id);
beforeAll(async () => {
  p = await createPlatform(resolve('.'), { memory: true, timers: false });
  await p.bots.set(false);
});
afterAll(async () => {
  await p.app.close();
});
async function player() {
  const n = ++serial,
    r = await p.app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      remoteAddress: `198.18.16.${n}`,
      headers: { origin: 'http://localhost:3000' },
      payload: {
        name: `Builder ${n}`,
        email: `builder-${n}@test.invalid`,
        password: 'isolated-builder-password',
      },
    });
  expect(r.statusCode, r.body).toBe(200);
  const actor = r.json().user,
    token = String(r.headers['set-auth-token']);
  let profile = await p.store.profile(actor);
  for (const pack of await p.store.economy.list(profile.id))
    await p.store.economy.open(profile.id, pack.id);
  await p.store.completeTutorial(profile.id);
  for (const id of cards)
    await p.db.read((sql) =>
      sql(
        'INSERT INTO inventory(profile_id,card_id,quantity) VALUES($1,$2,1) ON CONFLICT(profile_id,card_id) DO UPDATE SET quantity=greatest(inventory.quantity,1)',
        [profile.id, id],
      ),
    );
  await p.store.saveDeck(profile.id, cards.slice(0, 5));
  profile = await p.store.profile(actor);
  return { actor, token, profile };
}
type User = Awaited<ReturnType<typeof player>>;
async function request(
  u: User,
  path: string,
  body?: unknown,
  method: 'GET' | 'POST' | 'DELETE' = body === undefined ? 'GET' : 'POST',
) {
  return p.app.inject({
    method,
    url: '/api' + path,
    headers: {
      origin: 'http://localhost:3000',
      authorization: `Bearer ${u.token}`,
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}
async function create(u: User, name = 'Main hand', ids = cards.slice(0, 5)) {
  const r = await request(u, '/deck-loadouts', { name, cards: ids });
  expect(r.statusCode, r.body).toBe(200);
  return r.json<DeckLoadout>();
}
it('persists named alternatives without changing the active deck or inventory', async () => {
  const u = await player(),
    before = await p.store.profile(u.actor);
  const saved = await create(u, '  Alternate   hand  ', cards.slice(1, 6));
  expect(saved.name).toBe('Alternate hand');
  expect(saved.revision).toBe(1);
  const list = await request(u, '/deck-loadouts');
  expect(list.json()).toMatchObject({
    limit: 12,
    activeId: null,
    loadouts: [{ id: saved.id, cards: cards.slice(1, 6) }],
  });
  const after = await p.store.profile(u.actor);
  expect(after.deck).toEqual(before.deck);
  expect(after.inventory).toEqual(before.inventory);
  await p.store.migrate(resolve('.'));
  expect((await request(u, '/deck-loadouts')).json().loadouts[0].id).toBe(saved.id);
  expect((await p.store.profile(u.actor)).deck).toEqual(before.deck);
});
it('uses, renames, edits and deletes a loadout without deleting cards or silently changing the active hand', async () => {
  const u = await player(),
    saved = await create(u);
  expect(
    (await request(u, `/deck-loadouts/${saved.id}/activate`, { revision: 1 })).statusCode,
  ).toBe(200);
  expect((await p.store.profile(u.actor)).activeLoadoutId).toBe(saved.id);
  const rename = await request(u, `/deck-loadouts/${saved.id}`, { name: 'Renamed', revision: 1 });
  expect(rename.statusCode).toBe(200);
  expect((await p.store.profile(u.actor)).activeLoadoutId).toBe(saved.id);
  const edit = await request(u, `/deck-loadouts/${saved.id}`, {
    cards: cards.slice(1, 6),
    revision: 2,
  });
  expect(edit.statusCode).toBe(200);
  const after = await p.store.profile(u.actor);
  expect(after.activeLoadoutId).toBeNull();
  expect(after.deck).toEqual(cards.slice(0, 5));
  expect(
    (await request(u, `/deck-loadouts/${saved.id}`, { revision: 3 }, 'DELETE')).statusCode,
  ).toBe(200);
  expect((await p.store.profile(u.actor)).inventory).toEqual(after.inventory);
  expect((await p.store.profile(u.actor)).deck).toEqual(after.deck);
});
it('authorizes all loadout operations against the authenticated profile', async () => {
  const a = await player(),
    b = await player(),
    saved = await create(a);
  expect((await request(b, '/deck-loadouts')).json().loadouts).toEqual([]);
  for (const [path, body, method] of [
    [`/deck-loadouts/${saved.id}`, { name: 'Stolen', revision: 1 }, 'POST'],
    [`/deck-loadouts/${saved.id}/activate`, { revision: 1 }, 'POST'],
    [`/deck-loadouts/${saved.id}`, { revision: 1 }, 'DELETE'],
  ] as const) {
    expect((await request(b, path, body, method)).statusCode).toBe(404);
  }
  const forged = await p.app.inject({
    method: 'GET',
    url: '/api/deck-loadouts',
    headers: { authorization: `Bearer ${b.token}`, 'x-profile-id': a.profile.id },
  });
  expect(forged.statusCode).toBe(403);
  expect((await p.app.inject({ method: 'GET', url: '/api/deck-loadouts' })).statusCode).toBe(401);
});
it('rejects invalid names/cards and prevents stale or concurrent overwrites', async () => {
  const u = await player();
  for (const body of [
    { name: '', cards: [] },
    { name: 'x'.repeat(41), cards: [] },
    { name: 'Bad', cards: ['unknown'] },
    { name: 'Bad', cards: [cards[0], cards[0]] },
    { name: 'Bad', cards: cards.slice(0, 6) },
    { name: 'Bad', cards: {} },
  ])
    expect((await request(u, '/deck-loadouts', body)).statusCode).toBe(400);
  const saved = await create(u);
  expect((await request(u, '/deck-loadouts', { name: 'MAIN HAND', cards: [] })).statusCode).toBe(
    400,
  );
  const results = await Promise.all(
    ['First edit', 'Second edit'].map((name) =>
      request(u, `/deck-loadouts/${saved.id}`, { name, revision: 1 }),
    ),
  );
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  expect(
    (await request(u, `/deck-loadouts/${saved.id}/activate`, { revision: 1 })).statusCode,
  ).toBe(409);
  expect(
    (await request(u, `/deck-loadouts/${saved.id}`, { revision: 1 }, 'DELETE')).statusCode,
  ).toBe(409);
});
it('retains loadouts when cards become unavailable, blocks activation and supports repair', async () => {
  const u = await player(),
    saved = await create(u);
  await request(u, `/deck-loadouts/${saved.id}/activate`, { revision: 1 });
  await p.db.read((sql) =>
    sql('UPDATE inventory SET reserved=quantity WHERE profile_id=$1 AND card_id=$2', [
      u.profile.id,
      cards[0],
    ]),
  );
  expect(
    (await request(u, `/deck-loadouts/${saved.id}/activate`, { revision: 1 })).statusCode,
  ).toBe(400);
  await p.db.read((sql) =>
    sql('UPDATE inventory SET quantity=0,reserved=0 WHERE profile_id=$1 AND card_id=$2', [
      u.profile.id,
      cards[0],
    ]),
  );
  const profile = await p.store.profile(u.actor);
  expect(profile.activeLoadoutId).toBeNull();
  expect(profile.deck).not.toContain(cards[0]);
  expect((await request(u, '/deck-loadouts')).json().loadouts[0].cards).toContain(cards[0]);
  const rename = await request(u, `/deck-loadouts/${saved.id}`, {
    name: 'Needs repair',
    revision: 1,
  });
  expect(rename.statusCode).toBe(200);
  expect(
    (await request(u, `/deck-loadouts/${saved.id}`, { cards: cards.slice(1, 6), revision: 2 }))
      .statusCode,
  ).toBe(200);
  expect(
    (await request(u, `/deck-loadouts/${saved.id}/activate`, { revision: 3 })).statusCode,
  ).toBe(200);
});
it('saves incomplete drafts but requires a complete legal, owned hand to activate', async () => {
  const u = await player(),
    draft = await create(u, 'Work in progress', cards.slice(0, 3));
  expect(
    (await request(u, `/deck-loadouts/${draft.id}/activate`, { revision: 1 })).statusCode,
  ).toBe(400);
  const unowned = CARDS.find((card) => card.enabled && !u.profile.inventory[card.id]?.quantity)!;
  expect(
    (await request(u, '/deck-loadouts', { name: 'Unowned', cards: [unowned.id] })).statusCode,
  ).toBe(400);
  expect((await p.store.profile(u.actor)).deck).toEqual(cards.slice(0, 5));
});
it('limits concurrent loadout creation to twelve and blocks deck switching while queued', async () => {
  const u = await player();
  for (let i = 0; i < 11; i++) await create(u, `Hand ${i}`);
  const last = await Promise.all([
    request(u, '/deck-loadouts', { name: 'Last hand', cards: cards.slice(0, 5) }),
    request(u, '/deck-loadouts', { name: 'Overflow', cards: cards.slice(0, 5) }),
  ]);
  expect(last.map((result) => result.statusCode).sort()).toEqual([200, 400]);
  expect((await request(u, '/deck-loadouts')).json().loadouts).toHaveLength(12);
  const saved = last.find((result) => result.statusCode === 200)!.json<DeckLoadout>();
  await p.store.createLobby(u.profile, { mode: 'casual', allowBots: false });
  expect(
    (await request(u, `/deck-loadouts/${saved.id}/activate`, { revision: 1 })).statusCode,
  ).toBe(409);
  await p.store.cancelLobby(u.profile.id, (await p.store.profile(u.actor)).waitingLobbyId!);
  expect(
    (await request(u, `/deck-loadouts/${saved.id}/activate`, { revision: 1 })).statusCode,
  ).toBe(200);
});
