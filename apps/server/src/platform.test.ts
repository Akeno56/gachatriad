import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { createPlatform } from './app';
import type { MatchView, ProfileView, LobbyView } from '@gacha-triad/shared/platform';
import { CARDS } from '@gacha-triad/shared';
import { ECONOMY } from '@gacha-triad/shared/platform';
import {
  applyMove,
  legalMoves,
  randomDeck,
  seededRandom,
  type GameState,
  type Move,
} from '@gacha-triad/engine';
let platform: Awaited<ReturnType<typeof createPlatform>>;
type Client = { cookie: string; profile: ProfileView; ip?: string };
let ipCounter = 0;
const testIp = () => {
  const n = ++ipCounter;
  return `10.2.${Math.floor(n / 250)}.${(n % 250) + 1}`;
};
async function request(
  client: Client | null,
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
) {
  return platform.app.inject({
    remoteAddress: client?.ip ?? testIp(),
    url: `/api${path}`,
    method: method as 'GET' | 'POST' | 'DELETE',
    headers: {
      origin: 'http://127.0.0.1:3000',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(client ? { cookie: client.cookie } : {}),
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}
async function user(registered = false, openStarters = true) {
  const response = await request(null, '/auth/sign-in/anonymous', {});
  expect(response.statusCode, response.body).toBe(200);
  const client: Client = {
    ip: testIp(),
    cookie: response.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
    profile: null!,
  };
  client.profile = (await request(client, '/profile')).json();
  if (openStarters) {
    const packs = (await request(client, '/boosters')).json() as { id: string }[];
    for (const pack of packs) await request(client, `/boosters/${pack.id}/open`, {});
  }
  await request(client, '/tutorial/complete', {});
  client.profile = (await request(client, '/profile')).json();
  if (registered) {
    const oldId = client.profile.id;
    const r = await request(client, '/auth/sign-up/email', {
      name: `Tester ${oldId.slice(0, 4)}`,
      email: `${oldId}@test.invalid`,
      password: 'a-test-password-123',
    });
    expect(r.statusCode, r.body).toBe(200);
    client.cookie = r.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    client.profile = (await request(client, '/profile')).json();
    expect(client.profile.id).toBe(oldId);
    expect(client.profile.registered).toBe(true);
    await request(client, '/ranked/acknowledge', { acknowledged: true });
    client.profile = (await request(client, '/profile')).json();
  }
  return client;
}
async function ok<T>(c: Client, path: string, body?: unknown, method?: string): Promise<T> {
  const r = await request(c, path, body, method);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}
it('buys Standard cards at server prices atomically and deduplicates retries', async () => {
  const a = await user(),
    b = await user();
  await platform.db.tx((sql) =>
    sql('UPDATE profiles SET prisms=10000 WHERE id=$1', [a.profile.id]),
  );
  let spent = 0;
  for (let rank = 1; rank <= 5; rank++) {
    const card = CARDS.find((c) => c.rarity === rank)!;
    const before = await ok<ProfileView>(a, '/profile');
    const body = {
      cardId: card.id,
      requestId: `shop-rank-${rank}-request`,
      cost: 1,
      profileId: b.profile.id,
    };
    const responses = await Promise.all([
      request(a, '/cards/buy', body),
      request(a, '/cards/buy', body),
    ]);
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
    const after = await ok<ProfileView>(a, '/profile');
    spent += ECONOMY.cardPrices[rank - 1];
    expect(after.prisms).toBe(10000 - spent);
    expect(after.inventory[card.id].quantity).toBe((before.inventory[card.id]?.quantity ?? 0) + 1);
    expect(
      (await request(a, '/cards/buy', { ...body, cardId: CARDS.find((c) => c.id !== card.id)!.id }))
        .statusCode,
    ).toBe(409);
  }
  const card = CARDS[0];
  expect(
    (await request(a, '/cards/buy', { cardId: `${card.id}::holo`, requestId: 'no-buying-holo' }))
      .statusCode,
  ).toBe(400);
  expect(
    (await request(a, '/cards/buy', { cardId: 'unknown', requestId: 'unknown-card-buy' }))
      .statusCode,
  ).toBe(400);
  const before = await ok<ProfileView>(b, '/profile');
  expect(
    (await request(b, '/cards/buy', { cardId: card.id, requestId: 'not-enough-prisms' }))
      .statusCode,
  ).toBe(409);
  expect((await ok<ProfileView>(b, '/profile')).inventory).toEqual(before.inventory);
  await platform.guests.deleteAccount(a.profile.id, a.profile.name);
  expect(
    await platform.db.read((sql) =>
      sql('SELECT 1 FROM card_purchases WHERE profile_id=$1', [a.profile.id]),
    ),
  ).toEqual([]);
});
it('keeps both Ranked players blocked until Trade One settles and reports the pending result', async () => {
  const a = await user(true),
    b = await user(true);
  const lobby = await ok<{ lobbyId: string }>(a, '/lobbies', { mode: 'ranked', allowBots: false });
  const joined = await ok<{ matchId: string }>(b, '/lobbies', { mode: 'ranked' });
  const result = await ok<MatchView>(b, `/matches/${joined.matchId}/resign`, {});
  for (const [c, canClaim] of [
    [a, true],
    [b, false],
  ] as const) {
    expect((await ok<ProfileView>(c, '/profile')).pendingTrade).toEqual({
      matchId: result.id,
      canClaim,
    });
    expect((await request(c, '/solo', {})).statusCode).toBe(409);
    for (const mode of ['casual', 'draft', 'ranked'])
      expect((await request(c, '/lobbies', { mode })).statusCode).toBe(409);
    expect((await request(c, `/matches/${result.id}/rematch`, {})).statusCode).toBe(409);
  }
  await ok(a, `/matches/${result.id}/claim`, { cardId: result.trade.choices[0].id });
  for (const c of [a, b]) {
    expect((await ok<ProfileView>(c, '/profile')).pendingTrade).toBeNull();
    await ok(c, '/deck/auto', {});
    const solo = await ok<{ matchId: string }>(c, '/solo', {});
    await ok(c, `/matches/${solo.matchId}/resign`, {});
  }
});
it('requires both human players to accept a rematch, preserves rules and creates it once', async () => {
  const a = await user(),
    b = await user(),
    stranger = await user();
  const lobby = await ok<{ lobbyId: string }>(a, '/lobbies', {
    mode: 'custom',
    allowBots: false,
    rules: { allOpen: true, same: true, plus: true, combo: true },
  });
  const joined = await ok<{ matchId: string }>(b, `/lobbies/${lobby.lobbyId}/join`, {});
  const result = await ok<MatchView>(b, `/matches/${joined.matchId}/resign`, {});
  expect((await request(stranger, `/matches/${result.id}/rematch`, {})).statusCode).toBe(403);
  const first = await ok<MatchView>(a, `/matches/${result.id}/rematch`, {});
  expect(first.rematch.requestedBy).toBe(a.profile.id);
  expect(first.rematch.matchId).toBeNull();
  expect((await ok<ProfileView>(a, '/profile')).activeMatchId).toBeNull();
  expect((await request(b, `/matches/${result.id}/rematch`, { cancel: true })).statusCode).toBe(
    403,
  );
  await ok(a, `/matches/${result.id}/rematch`, { cancel: true });
  expect((await ok<MatchView>(b, `/matches/${result.id}`)).rematch.requestedBy).toBeNull();
  await ok(a, `/matches/${result.id}/rematch`, {});
  await platform.db.tx((sql) =>
    sql("UPDATE matches SET rematch_requested_at=now()-interval '6 minutes' WHERE id=$1", [
      result.id,
    ]),
  );
  const expired = await ok<MatchView>(b, `/matches/${result.id}/rematch`, {});
  expect(expired.rematch.requestedBy).toBe(b.profile.id);
  expect(expired.rematch.matchId).toBeNull();
  await ok(b, `/matches/${result.id}/rematch`, { cancel: true });
  await ok(a, `/matches/${result.id}/rematch`, {});
  const accepted = await ok<MatchView>(b, `/matches/${result.id}/rematch`, {});
  expect(accepted.rematch.matchId).toBeTruthy();
  const retry = await ok<MatchView>(b, `/matches/${result.id}/rematch`, {});
  expect(retry.rematch.matchId).toBe(accepted.rematch.matchId);
  const next = await ok<MatchView>(a, `/matches/${accepted.rematch.matchId}`);
  expect(next.rules).toEqual(result.rules);
  expect(next.mode).toBe(result.mode);
  expect(next.names).toEqual(result.names);
  expect(
    (await platform.store.lobbies()).some(
      (l) => l.matchId === next.id && l.players === 2 && l.status === 'playing',
    ),
  ).toBe(true);
  for (const c of [a, b])
    expect((await ok<ProfileView>(c, '/profile')).activeMatchId).toBe(next.id);
  await ok(a, `/matches/${next.id}/resign`, {});
});
it('rematches an idle bot and closes its spare waiting table without matchmaking another opponent', async () => {
  const a = await user();
  await platform.bots.set(true, 'medium');
  try {
    const bot = await platform.store.profile({
      id: 'local-bot-0',
      name: '[BOT] Nova',
      isAnonymous: false,
    });
    const lobby = await platform.store.createLobby(bot, { mode: 'custom', allowBots: true });
    const joined = await ok<{ matchId: string }>(a, `/lobbies/${lobby.lobbyId}/join`, {});
    const result = await ok<MatchView>(a, `/matches/${joined.matchId}/resign`, {});
    const spare = await platform.store.createLobby(
      await platform.store.profile({ id: 'local-bot-0', name: '[BOT] Nova', isAnonymous: false }),
      { mode: 'custom', allowBots: true },
    );
    const accepted = await ok<MatchView>(a, `/matches/${result.id}/rematch`, {});
    expect(accepted.rematch.matchId).toBeTruthy();
    const next = await ok<MatchView>(a, `/matches/${accepted.rematch.matchId}`);
    expect(next.names).toEqual(result.names);
    expect((await platform.store.lobbies()).some((l) => l.id === spare.lobbyId)).toBe(false);
    await ok(a, `/matches/${next.id}/resign`, {});
  } finally {
    await platform.bots.set(false);
  }
});
it('keeps friend messages private, retry-safe, read-tracked and tied to accepted friendships', async () => {
  const a = await user(true),
    b = await user(true),
    other = await user(true),
    guest = await user();
  const url = `/friends/${b.profile.id}/messages`;
  expect(
    (await request(a, url, { message: 'not friends', requestId: 'dm-not-friends' })).statusCode,
  ).toBe(403);
  await ok(a, '/friends/request', { playerId: b.profile.id });
  expect((await request(a, url)).statusCode).toBe(403);
  await ok(b, `/friends/${a.profile.id}/accept`, {});
  const sent = await ok<{ id: string }>(a, url, {
    message: 'Private <b>hello</b>',
    requestId: 'dm-first-message',
  });
  expect(
    await ok(a, url, { message: 'Private <b>hello</b>', requestId: 'dm-first-message' }),
  ).toEqual(sent);
  expect(
    (await request(a, url, { message: 'too fast', requestId: 'dm-too-fast-msg' })).statusCode,
  ).toBe(429);
  expect((await request(guest, url)).statusCode).toBe(403);
  expect((await request(other, url)).statusCode).toBe(403);
  expect(
    (await request(other, `/friends/${a.profile.id}/read`, { through: sent.id })).statusCode,
  ).toBe(403);
  const thread = await ok<import('@gacha-triad/shared/social').FriendMessage[]>(
    b,
    `/friends/${a.profile.id}/messages`,
  );
  expect(thread.map((m) => m.body)).toEqual(['Private <b>hello</b>']);
  const social = () => ok<import('@gacha-triad/shared/social').SocialView>(b, '/social');
  expect((await social()).conversations[0].unread).toBe(1);
  expect(
    (await ok<import('@gacha-triad/shared/social').SocialView>(a, '/social')).conversations[0]
      .unread,
  ).toBe(0);
  expect(
    (await ok<import('@gacha-triad/shared/social').SocialView>(other, '/social')).conversations,
  ).toEqual([]);
  expect((await social()).chat.some((m) => m.id === sent.id)).toBe(false);
  await ok(b, `/friends/${a.profile.id}/read`, { through: 'someone-elses-message' });
  expect((await social()).conversations[0].unread).toBe(1);
  await ok(b, `/friends/${a.profile.id}/read`, { through: sent.id });
  expect((await social()).conversations[0].unread).toBe(0);
  await ok(a, `/friends/${b.profile.id}`, undefined, 'DELETE');
  expect((await request(a, url)).statusCode).toBe(403);
  expect(
    (await request(a, url, { message: 'removed', requestId: 'dm-first-message' })).statusCode,
  ).toBe(403);
  expect((await social()).conversations).toEqual([]);
  await platform.guests.deleteAccount(b.profile.id, b.profile.name);
  expect(
    await platform.db.read((sql) => sql('SELECT id FROM friend_messages WHERE id=$1', [sent.id])),
  ).toEqual([]);
});
it('auto-builds only from available owned copies with the highest legal total rarity', async () => {
  const c = await user();
  const { CARDS, ALL_CARDS } = await import('@gacha-triad/shared');
  const { buildBestDeck } = await import('@gacha-triad/engine');
  const owned = [
    ...CARDS.filter((c) => c.rarity === 5).slice(0, 2),
    ...CARDS.filter((c) => c.rarity === 4).slice(0, 3),
    ...CARDS.filter((c) => c.rarity === 3).slice(0, 5),
    ...CARDS.filter((c) => c.rarity === 1).slice(0, 2),
  ];
  const holo = ALL_CARDS.find((c) => c.baseCardId === owned[0].id)!;
  owned.push(holo);
  await platform.db.tx(async (sql) => {
    await sql('DELETE FROM inventory WHERE profile_id=$1', [c.profile.id]);
    for (const card of owned)
      await sql('INSERT INTO inventory(profile_id,card_id,quantity,reserved) VALUES($1,$2,1,$3)', [
        c.profile.id,
        card.id,
        card.id === owned[1].id ? 1 : 0,
      ]);
  });
  const expected = buildBestDeck(owned.filter((card) => card.id !== owned[1].id)).map((c) => c.id);
  const decks = new Set<string>();
  for (let i = 0; i < 8; i++) {
    await ok(c, '/deck/auto', {});
    const deck = (await ok<ProfileView>(c, '/profile')).deck;
    expect(deck.every((id) => owned.some((c) => c.id === id) && id !== owned[1].id)).toBe(true);
    expect(deck.reduce((s, id) => s + ALL_CARDS.find((c) => c.id === id)!.rarity, 0)).toBe(
      expected.reduce((s, id) => s + ALL_CARDS.find((c) => c.id === id)!.rarity, 0),
    );
    decks.add([...deck].sort().join('|'));
  }
  expect(decks.size).toBeGreaterThan(1);
});
it('enables Same, Plus and Combo in new unranked and Draft games without Trade One', async () => {
  for (const mode of ['casual', 'draft']) {
    const a = await user(true),
      b = await user(true);
    const lobby = await ok<{ lobbyId: string }>(a, '/lobbies', { mode, allowBots: false });
    const joined = await ok<{ matchId: string }>(
      b,
      mode === 'draft' ? '/lobbies' : `/lobbies/${lobby.lobbyId}/join`,
      mode === 'draft' ? { mode } : {},
    );
    const match = await ok<MatchView>(a, `/matches/${joined.matchId}`);
    expect(match.rules).toMatchObject({ threeOpen: true, same: true, plus: true, combo: true });
    expect(match.trade.rule).toBe('none');
    await ok(a, `/matches/${joined.matchId}/resign`, {});
  }
});
it('awards permanent human Ranked top-10, top-3 and champion titles after five games', async () => {
  const a = await user(true),
    b = await user(true);
  expect((await request(a, '/profile/title', { titleId: 'ranked-champion' })).statusCode).toBe(400);
  const { awardRankTitles } = await import('./titles');
  await platform.db.tx(async (sql) => {
    await sql('UPDATE profiles SET rating=5000 WHERE id=$1', [a.profile.id]);
    await sql('UPDATE profiles SET rating=4900 WHERE id=$1', [b.profile.id]);
    for (let i = 0; i < 4; i++)
      await sql(
        "INSERT INTO matches(id,mode,player0,player1,decks,rules,status,is_draw,settlement_done) VALUES($1,'ranked',$2,$3,'[[],[]]','{}','complete',true,true)",
        [crypto.randomUUID(), a.profile.id, b.profile.id],
      );
    await awardRankTitles(sql);
  });
  expect(
    (await platform.store.playerProfile(a.profile.id)).titles.find((t) => t.id === 'ranked-top-ten')
      ?.unlocked,
  ).toBe(false);
  await platform.db.tx(async (sql) => {
    await sql(
      "INSERT INTO matches(id,mode,player0,player1,decks,rules,status,is_draw,settlement_done) VALUES($1,'ranked',$2,$3,'[[],[]]','{}','complete',true,true)",
      [crypto.randomUUID(), a.profile.id, b.profile.id],
    );
    await awardRankTitles(sql);
  });
  for (const id of ['ranked-top-ten', 'ranked-podium', 'ranked-champion'])
    expect(
      (await platform.store.playerProfile(a.profile.id)).titles.find((t) => t.id === id)?.unlocked,
    ).toBe(true);
  expect(
    (await platform.store.playerProfile(b.profile.id)).titles.find(
      (t) => t.id === 'ranked-champion',
    )?.unlocked,
  ).toBe(false);
  await ok(a, '/profile/title', { titleId: 'ranked-champion' });
  await platform.db.tx(async (sql) => {
    await sql('UPDATE profiles SET rating=1 WHERE id=$1', [a.profile.id]);
    await awardRankTitles(sql);
  });
  expect(
    (await platform.store.playerProfile(a.profile.id)).titles.find(
      (t) => t.id === 'ranked-champion',
    )?.unlocked,
  ).toBe(true);
});
it('purchases booster batches atomically, lists all unopened packs, and bulk opening is replay-safe', async () => {
  const c = await user(false, false);
  await platform.db.read((sql) =>
    sql('UPDATE profiles SET prisms=1500 WHERE id=$1', [c.profile.id]),
  );
  const purchase = { requestId: 'batch-buy-ten', quantity: 10 };
  const responses = await Promise.all([
    request(c, '/boosters/buy', purchase),
    request(c, '/boosters/buy', purchase),
  ]);
  for (const r of responses) expect(r.statusCode, r.body).toBe(200);
  const bought = responses[0].json() as {
    packs: import('@gacha-triad/shared/platform').BoosterView[];
    quantity: number;
    totalCost: number;
  };
  expect(bought.packs).toHaveLength(10);
  expect(bought.totalCost).toBe(1500);
  expect(responses[1].json().packs.map((p: { id: string }) => p.id)).toEqual(
    bought.packs.map((p) => p.id),
  );
  expect((await ok<ProfileView>(c, '/profile')).prisms).toBe(0);
  expect((await request(c, '/boosters/buy', { ...purchase, quantity: 5 })).statusCode).toBe(409);
  for (const quantity of [0, -1, 1.5, 101, '5', null])
    expect(
      (await request(c, '/boosters/buy', { requestId: 'bad-batch-quantity', quantity })).statusCode,
    ).toBe(400);
  expect(
    (await request(c, '/boosters/buy', { requestId: 'batch-insufficient', quantity: 5 }))
      .statusCode,
  ).toBe(409);
  const ids = bought.packs.map((p) => p.id);
  const opened = await ok<import('@gacha-triad/shared/platform').BoosterView[]>(
    c,
    '/boosters/open-batch',
    { packIds: ids },
  );
  expect(opened).toHaveLength(10);
  for (const p of opened) {
    expect(p.cards).toHaveLength(5);
    expect(p.cards.some((c) => c.rarity >= 3)).toBe(true);
  }
  const profile = await ok<ProfileView>(c, '/profile');
  expect(Object.values(profile.inventory).reduce((s, c) => s + c.quantity, 0)).toBe(50);
  expect(await ok(c, '/boosters/open-batch', { packIds: ids })).toEqual(opened);
  expect((await ok<ProfileView>(c, '/profile')).inventory).toEqual(profile.inventory);
  const starter = (await ok<{ id: string; openedAt: string | null }[]>(c, '/boosters')).find(
    (p) => !p.openedAt,
  )!;
  expect(
    (await request(c, '/boosters/open-batch', { packIds: [starter.id, 'unknown-pack'] }))
      .statusCode,
  ).toBe(404);
  expect(
    (await ok<{ id: string; openedAt: string | null }[]>(c, '/boosters')).find(
      (p) => p.id === starter.id,
    )?.openedAt,
  ).toBeNull();
  expect(
    (await request(c, '/boosters/open-batch', { packIds: [starter.id, starter.id] })).statusCode,
  ).toBe(400);
  await platform.store.economy.grant(
    c.profile.id,
    'boosters',
    100,
    'list-all-unopened',
    'host-test',
  );
  expect(
    (await ok<{ openedAt: string | null }[]>(c, '/boosters')).filter((p) => !p.openedAt),
  ).toHaveLength(103);
});
it('grants one free booster per registered account per UTC day, including concurrent retries', async () => {
  const c = await user(true),
    guest = await user();
  expect((await request(guest, '/boosters/daily', {})).statusCode).toBe(403);
  expect(
    (await ok<import('@gacha-triad/shared/platform').DailyBooster>(guest, '/boosters/daily'))
      .available,
  ).toBe(false);
  expect(
    (await ok<import('@gacha-triad/shared/platform').DailyBooster>(c, '/boosters/daily')).available,
  ).toBe(true);
  const results = await Promise.all([
    ok<{ id: string; source: string }>(c, '/boosters/daily', {}),
    ok<{ id: string; source: string }>(c, '/boosters/daily', {}),
  ]);
  expect(results[0].id).toBe(results[1].id);
  expect(results[0].source).toBe('daily');
  expect((await ok<ProfileView>(c, '/profile')).unopenedBoosters).toBe(1);
  expect((await ok<ProfileView>(c, '/profile')).prisms).toBe(c.profile.prisms);
  expect(
    (await ok<import('@gacha-triad/shared/platform').DailyBooster>(c, '/boosters/daily')).available,
  ).toBe(false);
  const nextDay = (Math.floor(Date.now() / 86400000) + 1) * 86400000;
  const now = vi.spyOn(Date, 'now').mockReturnValue(nextDay);
  try {
    expect((await platform.store.economy.daily(c.profile.id, true)).available).toBe(true);
    const next = await platform.store.economy.claimDaily(c.profile.id, true);
    expect(next.id).not.toBe(results[0].id);
    expect((await platform.store.economy.daily(c.profile.id, true)).available).toBe(false);
    await platform.store.migrate(resolve('.'));
    expect((await platform.store.economy.claimDaily(c.profile.id, true)).id).toBe(next.id);
  } finally {
    now.mockRestore();
  }
});
it('recycles and trades up spare copies without consuming kept or reserved cards, with durable receipts', async () => {
  const c = await user(),
    other = await user();
  const { CARDS, ALL_CARDS } = await import('@gacha-triad/shared');
  const [a, b] = CARDS.filter((c) => c.rarity === 1),
    five = CARDS.find((c) => c.rarity === 5)!,
    holo = ALL_CARDS.find((c) => c.baseCardId === a.id)!;
  await platform.db.tx(async (sql) => {
    for (const [id, quantity, reserved] of [
      [a.id, 7, 1],
      [b.id, 3, 0],
      [five.id, 2, 0],
      [holo.id, 2, 0],
    ])
      await sql(
        'INSERT INTO inventory(profile_id,card_id,quantity,reserved) VALUES($1,$2,$3,$4) ON CONFLICT(profile_id,card_id) DO UPDATE SET quantity=excluded.quantity,reserved=excluded.reserved',
        [c.profile.id, id, quantity, reserved],
      );
  });
  const recycle = {
    kind: 'recycle',
    cards: [{ cardId: a.id, count: 2 }],
    requestId: 'recycle-two-copies',
  };
  const receipt = await ok<import('@gacha-triad/shared/platform').DuplicateResult>(
    c,
    '/collection/duplicates',
    recycle,
  );
  expect(receipt.prisms).toBe(10);
  expect(await ok(c, '/collection/duplicates', recycle)).toEqual(receipt);
  expect(
    (
      await request(c, '/collection/duplicates', {
        ...recycle,
        cards: [{ cardId: a.id, count: 3 }],
      })
    ).statusCode,
  ).toBe(409);
  expect((await request(other, '/collection/duplicates', recycle)).statusCode).toBe(409);
  const trade = {
    kind: 'trade-up',
    cards: [
      { cardId: a.id, count: 3 },
      { cardId: b.id, count: 2 },
    ],
    requestId: 'trade-up-five-copies',
  };
  const upgraded = await ok<import('@gacha-triad/shared/platform').DuplicateResult>(
    c,
    '/collection/duplicates',
    trade,
  );
  expect(upgraded.card?.rarity).toBe(2);
  expect(upgraded.prisms).toBe(0);
  expect(
    await ok(c, '/collection/duplicates', { ...trade, cards: [...trade.cards].reverse() }),
  ).toEqual(upgraded);
  const profile = await ok<ProfileView>(c, '/profile');
  expect(profile.inventory[a.id].quantity).toBe(2);
  expect(profile.inventory[b.id].quantity).toBe(1);
  expect(profile.inventory[holo.id].quantity).toBe(2);
  expect(profile.inventory[upgraded.card!.id].quantity).toBeGreaterThanOrEqual(1);
  expect(profile.prisms).toBe(c.profile.prisms + 10);
  expect(
    (
      await request(c, '/collection/duplicates', {
        ...recycle,
        requestId: 'last-copy-reject',
        cards: [{ cardId: b.id, count: 1 }],
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await request(c, '/collection/duplicates', {
        ...trade,
        requestId: 'wrong-rank-count',
        cards: [{ cardId: five.id, count: 5 }],
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await request(c, '/collection/duplicates', {
        ...trade,
        requestId: 'mixed-rank-count',
        cards: [
          { cardId: a.id, count: 4 },
          { cardId: five.id, count: 1 },
        ],
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await request(c, '/collection/duplicates', {
        ...recycle,
        requestId: 'rollback-duplicates',
        cards: [
          { cardId: a.id, count: 1 },
          { cardId: b.id, count: 1 },
        ],
      })
    ).statusCode,
  ).toBe(409);
  expect((await ok<ProfileView>(c, '/profile')).inventory).toEqual(profile.inventory);
  const fiveReceipt = await ok<import('@gacha-triad/shared/platform').DuplicateResult>(
    c,
    '/collection/duplicates',
    { ...recycle, requestId: 'recycle-five-star', cards: [{ cardId: five.id, count: 1 }] },
  );
  expect(fiveReceipt.prisms).toBe(75);
  const four = CARDS.find((c) => c.rarity === 4)!;
  await platform.db.read((sql) =>
    sql(
      'INSERT INTO inventory(profile_id,card_id,quantity) VALUES($1,$2,6) ON CONFLICT(profile_id,card_id) DO UPDATE SET quantity=6',
      [c.profile.id, four.id],
    ),
  );
  const highest = await ok<import('@gacha-triad/shared/platform').DuplicateResult>(
    c,
    '/collection/duplicates',
    { kind: 'trade-up', cards: [{ cardId: four.id, count: 5 }], requestId: 'four-to-five-stars' },
  );
  expect(highest.card?.rarity).toBe(5);
  await platform.db.read((sql) =>
    sql('UPDATE inventory SET reserved=quantity WHERE profile_id=$1 AND card_id=$2', [
      c.profile.id,
      a.id,
    ]),
  );
  expect(
    (
      await request(c, '/collection/duplicates', {
        ...recycle,
        requestId: 'reserved-copy-reject',
        cards: [{ cardId: a.id, count: 1 }],
      })
    ).statusCode,
  ).toBe(409);
  const foil = await ok<import('@gacha-triad/shared/platform').DuplicateResult>(
    c,
    '/collection/duplicates',
    { ...recycle, requestId: 'holo-duplicate-recycle', cards: [{ cardId: holo.id, count: 1 }] },
  );
  expect(foil.prisms).toBe(5);
  expect((await ok<ProfileView>(c, '/profile')).inventory[holo.id].quantity).toBe(1);
});
it('separates public chat channels, keeps retries in their original channel and shares the send cooldown', async () => {
  const a = await user(true);
  const first = await ok<{ id: string }>(a, '/chat', {
    message: 'General message',
    requestId: 'channel-general-message',
    channel: 'general',
  });
  expect(
    (
      await request(a, '/chat', {
        message: 'Trade message',
        requestId: 'channel-trade-message',
        channel: 'trade',
      })
    ).statusCode,
  ).toBe(429);
  expect(
    (
      await request(a, '/chat', {
        message: 'General message',
        requestId: 'channel-general-message',
        channel: 'trade',
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await request(a, '/chat', {
        message: 'Wrong channel',
        requestId: 'channel-unknown-message',
        channel: 'admin',
      })
    ).statusCode,
  ).toBe(400);
  for (const channel of ['trade', 'lobbies']) {
    await platform.db.read((sql) =>
      sql("UPDATE chat_messages SET created_at=now()-interval '4 seconds' WHERE profile_id=$1", [
        a.profile.id,
      ]),
    );
    await ok(a, '/chat', {
      message: `${channel} message`,
      requestId: `channel-${channel}-valid`,
      channel,
    });
  }
  const data = await ok<import('@gacha-triad/shared/social').SocialView>(a, '/social');
  const mine = data.chat.filter((m) => m.playerId === a.profile.id);
  expect(mine.map((m) => m.channel).sort()).toEqual(['general', 'lobbies', 'trade']);
  expect(mine.find((m) => m.id === first.id)?.body).toBe('General message');
  expect(data.onlinePlayers).toEqual([]);
});
beforeAll(async () => {
  platform = await createPlatform(resolve('.'), { memory: true, timers: false });
  platform.store.isOnline = () => true;
});
it('keeps Starter, Universe I and Universe II drops in their own pools and rejects type-swapped retries', async () => {
  const c = await user(false, false);
  await platform.store.economy.grant(
    c.profile.id,
    'prisms',
    1000,
    'booster-pool-test-grant',
    'test',
  );
  const one = await ok<import('@gacha-triad/shared/platform').BoosterView>(c, '/boosters/buy', {
    quantity: 1,
    type: 'standard',
    requestId: 'booster-pool-one',
  });
  const two = await ok<import('@gacha-triad/shared/platform').BoosterView>(c, '/boosters/buy', {
    quantity: 1,
    type: 'universe-ii',
    requestId: 'booster-pool-two',
  });
  expect(
    (
      await request(c, '/boosters/buy', {
        quantity: 1,
        type: 'universe-ii',
        requestId: 'booster-pool-one',
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await request(c, '/boosters/buy', {
        quantity: 1,
        type: 'starter',
        requestId: 'no-paid-starters',
      })
    ).statusCode,
  ).toBe(400);
  const openedOne = await ok<import('@gacha-triad/shared/platform').BoosterView>(
      c,
      `/boosters/${one.id}/open`,
      {},
    ),
    openedTwo = await ok<import('@gacha-triad/shared/platform').BoosterView>(
      c,
      `/boosters/${two.id}/open`,
      {},
    );
  expect(
    openedOne.cards.every((card) =>
      ['genshin', 'star-rail', 'zenless', 'wuthering-waves'].includes(card.universeId),
    ),
  ).toBe(true);
  expect(
    openedTwo.cards.every((card) =>
      ['epic-seven', 'star-savior', 'nte', 'endfield'].includes(card.universeId),
    ),
  ).toBe(true);
  for (const pack of (
    await ok<import('@gacha-triad/shared/platform').BoosterView[]>(c, '/boosters')
  ).filter((pack) => pack.type === 'starter')) {
    const opened = await ok<import('@gacha-triad/shared/platform').BoosterView>(
      c,
      `/boosters/${pack.id}/open`,
      {},
    );
    expect(
      opened.cards.every(
        (card) =>
          card.rarity <= 4 &&
          ['genshin', 'star-rail', 'zenless', 'wuthering-waves'].includes(card.universeId),
      ),
    ).toBe(true);
    expect(opened.cards[4].rarity).toBeGreaterThanOrEqual(3);
  }
});
it('disables and rejects rematches after the opponent leaves the result or goes offline', async () => {
  const a = await user(),
    b = await user();
  const lobby = await ok<{ lobbyId: string }>(a, '/lobbies', { mode: 'custom', allowBots: false });
  const { matchId } = await ok<{ matchId: string }>(b, `/lobbies/${lobby.lobbyId}/join`, {});
  await ok(b, `/matches/${matchId}/resign`, {});
  expect((await ok<MatchView>(a, `/matches/${matchId}`)).rematch.unavailableReason).toBeNull();
  platform.store.isOnline = (id) => id !== b.profile.id;
  try {
    expect((await ok<MatchView>(a, `/matches/${matchId}`)).rematch.unavailableReason).toMatch(
      /offline/,
    );
    expect((await request(a, `/matches/${matchId}/rematch`, {})).statusCode).toBe(409);
  } finally {
    platform.store.isOnline = () => true;
  }
  await ok(b, `/matches/${matchId}/leave`, {});
  expect((await ok<MatchView>(a, `/matches/${matchId}`)).rematch.unavailableReason).toMatch(/left/);
  expect((await request(a, `/matches/${matchId}/rematch`, {})).statusCode).toBe(409);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await platform?.app.close();
});
it('preserves the starter collection across reload and anonymous account conversion', async () => {
  const c = await user(true);
  const p = await ok<ProfileView>(c, '/profile');
  expect(p.inventory).toEqual(c.profile.inventory);
  expect(p.deck).toHaveLength(5);
  expect(Object.values(p.inventory).reduce((n, c) => n + c.quantity, 0)).toBe(15);
});
it('redacts two Three Open cards, rejects illegal and stale moves, and keeps public waiting/playing counts', async () => {
  const a = await user(),
    b = await user();
  const lobby = await ok<{ lobbyId: string }>(a, '/lobbies', { mode: 'casual' });
  expect((await ok<LobbyView[]>(b, '/lobbies')).find((l) => l.id === lobby.lobbyId)?.players).toBe(
    1,
  );
  const joined = await ok<{ matchId: string }>(b, `/lobbies/${lobby.lobbyId}/join`, {});
  const view = await ok<MatchView>(a, `/matches/${joined.matchId}`);
  expect(view.rules.threeOpen).toBe(true);
  expect(view.game!.hands[1].filter((h) => h.card)).toHaveLength(3);
  expect(view.game).not.toHaveProperty('revealed');
  expect(view.game!.hands[0].every((h) => h.card)).toBe(true);
  expect((await ok<LobbyView[]>(a, '/lobbies')).find((l) => l.id === lobby.lobbyId)?.players).toBe(
    2,
  );
  const actor = view.game!.turn === 0 ? a : b;
  const current = await ok<MatchView>(actor, `/matches/${view.id}`);
  const card = current.game!.hands[current.seat][0].card!;
  const moved = await ok<MatchView>(actor, `/matches/${view.id}/move`, {
    cardId: card.id,
    cell: 0,
    version: 0,
  });
  expect(moved.game!.history).toHaveLength(1);
  expect(
    (await request(actor, `/matches/${view.id}/move`, { cardId: card.id, cell: 1, version: 0 }))
      .statusCode,
  ).toBe(409);
  await ok(a, `/matches/${view.id}/resign`, {});
});
it('keeps Draft, Roulette and unranked queues separate and prevents guest ranked stakes', async () => {
  const a = await user(),
    b = await user(),
    c = await user(true);
  expect((await request(a, '/lobbies', { mode: 'ranked' })).statusCode).toBe(403);
  const d = await ok<{ lobbyId: string; matchId: null }>(c, '/lobbies', {
    mode: 'draft',
    tradeRule: 'one',
  });
  const r = await ok<{ lobbyId: string; matchId: null }>(a, '/lobbies', { mode: 'roulette' });
  const u = await ok<{ lobbyId: string; matchId: null }>(b, '/lobbies', { mode: 'casual' });
  expect([d, r, u].every((q) => q.matchId === null)).toBe(true);
  expect((await ok<LobbyView[]>(c, '/lobbies')).some((l) => l.id === d.lobbyId)).toBe(false);
  await ok(c, `/lobbies/${d.lobbyId}`, undefined, 'DELETE');
  await ok(a, `/lobbies/${r.lobbyId}`, undefined, 'DELETE');
  await ok(b, `/lobbies/${u.lobbyId}`, undefined, 'DELETE');
});
it('settles Trade One exactly once with permanent inventory changes, even on forfeit', async () => {
  const a = await user(true),
    b = await user(true);
  const l = await ok<{ lobbyId: string }>(a, '/lobbies', { mode: 'ranked' });
  const { matchId } = await ok<{ matchId: string }>(b, '/lobbies', { mode: 'ranked' });
  const started = await ok<MatchView>(a, `/matches/${matchId}`);
  expect(started.rules).toMatchObject({ same: true, plus: true, combo: true, allOpen: false });
  expect(started.game!.hands[1].every((c) => c.card === null)).toBe(true);
  await ok(b, `/matches/${matchId}/resign`, {});
  const result = await ok<MatchView>(a, `/matches/${matchId}`);
  expect(result.trade.canClaim).toBe(true);
  expect(result.trade.choices).toHaveLength(5);
  const card = result.trade.choices[0].id;
  const beforeA = a.profile.inventory[card]?.quantity ?? 0,
    beforeB = b.profile.inventory[card].quantity;
  const claims = await Promise.all([
    request(a, `/matches/${matchId}/claim`, { cardId: card }),
    request(a, `/matches/${matchId}/claim`, { cardId: card }),
  ]);
  expect(claims.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  const afterA = await ok<ProfileView>(a, '/profile'),
    afterB = await ok<ProfileView>(b, '/profile');
  expect(afterA.inventory[card].quantity).toBe(beforeA + 1);
  expect(afterB.inventory[card]?.quantity ?? 0).toBe(beforeB - 1);
  expect(Object.values(afterB.inventory).every((c) => c.available === c.quantity)).toBe(true);
  const achievement = (await platform.store.achievements(afterA.id)).find(
    (a) => a.id === 'trade-one',
  );
  expect(achievement?.unlockedAt).toBeTruthy();
});
it('locks only offered Draft cards and completes a full server-authoritative game', async () => {
  const a = await user(true),
    b = await user(true);
  const { lobbyId } = await ok<{ lobbyId: string }>(a, '/lobbies', { mode: 'draft' });
  const { matchId } = await ok<{ matchId: string }>(b, '/lobbies', { mode: 'draft' });
  for (const c of [a, b]) {
    const m = await ok<MatchView>(c, `/matches/${matchId}`);
    expect(m.draftPool).toHaveLength(15);
    expect(m.game).toBeNull();
    expect(
      (
        await request(c, `/matches/${matchId}/draft`, {
          cards: randomDeck(m.draftPool, seededRandom(123)).map((c) => c.id),
        })
      ).statusCode,
    ).toBe(409);
    expect((await request(c, `/matches/${matchId}/draft/reveal`, { step: 2 })).statusCode).toBe(
      409,
    );
    for (let step = 0; step < 15; step++) await ok(c, `/matches/${matchId}/draft/reveal`, { step });
    const replay = await ok<MatchView>(c, `/matches/${matchId}/draft/reveal`, { step: 0 });
    expect(replay.draftRevealed).toBe(15);
    expect(replay.draftPool).toEqual(m.draftPool);
    await ok(c, `/matches/${matchId}/draft`, {
      cards: randomDeck(m.draftPool, seededRandom(123)).map((c) => c.id),
    });
  }
  for (let i = 0; i < 9; i++) {
    const m = await ok<MatchView>(a, `/matches/${matchId}`),
      actor = m.game!.turn === 0 ? a : b,
      v = await ok<MatchView>(actor, `/matches/${matchId}`);
    await ok(actor, `/matches/${matchId}/move`, {
      cardId: v.game!.hands[v.seat][0].card!.id,
      cell: v.game!.board.findIndex((c) => !c),
      version: v.version,
    });
  }
  const done = await ok<MatchView>(a, `/matches/${matchId}`);
  expect(done.status).toBe('complete');
  expect(done.score[0] + done.score[1]).toBe(10);
  expect(done.trade.pending).toBe(false);
  expect((await ok<ProfileView>(a, '/profile')).inventory).toEqual(a.profile.inventory);
});
it('a completed ranked draw releases all stakes and transfers no cards', async () => {
  const a = await user(true),
    b = await user(true);
  const { lobbyId } = await ok<{ lobbyId: string }>(a, '/lobbies', { mode: 'ranked' });
  const { matchId } = await ok<{ matchId: string }>(b, '/lobbies', { mode: 'ranked' });
  const [row] = await platform.db.read((sql) =>
    sql<{ state: GameState }>('SELECT state FROM matches WHERE id=$1', [matchId]),
  );
  let plan: Move[] | null = null;
  for (let seed = 0; seed < 1000 && !plan; seed++) {
    let state = row.state;
    const rng = seededRandom(seed),
      moves: Move[] = [];
    while (state.status === 'playing') {
      const options = legalMoves(state),
        move = options[Math.floor(rng() * options.length)];
      moves.push(move);
      state = applyMove(state, move);
    }
    if (state.board.filter((c) => c?.owner === 0).length + state.hands[0].length === 5)
      plan = moves;
  }
  expect(plan).not.toBeNull();
  for (let i = 0; i < plan!.length; i++) {
    const move = plan![i];
    await ok(move.player === 0 ? a : b, `/matches/${matchId}/move`, { ...move, version: i });
  }
  const result = await ok<MatchView>(a, `/matches/${matchId}`);
  expect(result.winner).toBe('draw');
  expect(result.prismReward).toBe(25);
  expect((await ok<MatchView>(b, `/matches/${matchId}`)).prismReward).toBe(25);
  expect(result.trade.pending).toBe(false);
  expect((await ok<ProfileView>(a, '/profile')).inventory).toEqual(a.profile.inventory);
  expect((await ok<ProfileView>(b, '/profile')).inventory).toEqual(b.profile.inventory);
  expect(
    (await request(a, `/matches/${matchId}/claim`, { cardId: a.profile.deck[0] })).statusCode,
  ).toBe(403);
});
it('rejects another account’s private match/profile and permits only one simultaneous lobby join', async () => {
  const a = await user(),
    b = await user(),
    c = await user();
  const { lobbyId } = await ok<{ lobbyId: string }>(a, '/lobbies', { mode: 'custom' });
  const joined = await Promise.all([
    request(b, `/lobbies/${lobbyId}/join`, {}),
    request(c, `/lobbies/${lobbyId}/join`, {}),
  ]);
  expect(joined.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  const matchId = joined.find((r) => r.statusCode === 200)!.json().matchId;
  const stranger = joined[0].statusCode === 200 ? c : b;
  expect((await request(stranger, `/matches/${matchId}`)).statusCode).toBe(403);
  const denied = await platform.app.inject({
    url: '/api/profile',
    headers: { cookie: stranger.cookie, 'x-profile-id': a.profile.id },
  });
  expect(denied.statusCode).toBe(403);
  await ok(a, `/matches/${matchId}/resign`, {});
});
it('atomically exchanges an offered owned card and rejects repeated acceptance', async () => {
  const a = await user(true),
    b = await user(true),
    give = a.profile.deck[0],
    want = a.profile.deck[1];
  await platform.db.read(async (sql) => {
    for (const profile of [a.profile, b.profile])
      for (const cardId of [give, want])
        await sql(
          'INSERT INTO inventory(profile_id,card_id,quantity) VALUES($1,$2,1) ON CONFLICT(profile_id,card_id) DO UPDATE SET quantity=1',
          [profile.id, cardId],
        );
  });
  const { id } = await ok<{ id: string }>(a, '/trades', { offered: give, wanted: want });
  expect((await ok<ProfileView>(a, '/profile')).inventory[give].available).toBe(0);
  const requests = await Promise.all([
    request(b, `/trades/${id}/accept`, {}),
    request(b, `/trades/${id}/accept`, {}),
  ]);
  expect(requests.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  const pa = await ok<ProfileView>(a, '/profile'),
    pb = await ok<ProfileView>(b, '/profile');
  expect(pa.inventory[give]).toBeUndefined();
  expect(pa.inventory[want].quantity).toBe(2);
  expect(pb.inventory[give].quantity).toBe(2);
  expect(pb.inventory[want]).toBeUndefined();
});
it('populates labeled persistent bots, real lobbies, exhibitions and trade offers, then pauses cleanly', async () => {
  await platform.bots.set(true);
  await platform.bots.tick();
  expect((await platform.bots.status()).bots).toBe(30);
  const lobbies = await platform.store.lobbies();
  expect(lobbies.some((l) => l.players === 2 && l.host.startsWith('[BOT]'))).toBe(true);
  expect(
    lobbies.filter((l) => l.players === 1 && l.host.startsWith('[BOT]')).length,
  ).toBeGreaterThanOrEqual(6);
  expect((await platform.trades.list()).some((t) => t.owner.startsWith('[BOT]'))).toBe(true);
  await platform.bots.set(false);
  expect(
    (await platform.store.lobbies()).some(
      (l) => l.status === 'waiting' && l.host.startsWith('[BOT]'),
    ),
  ).toBe(false);
  expect((await platform.trades.list()).some((t) => t.owner.startsWith('[BOT]'))).toBe(false);
  expect((await platform.bots.status()).enabled).toBe(false);
});
it('enforces the full Trade One prerequisite matrix and accepts added Elemental/Random rules', async () => {
  const a = await user(true);
  for (const visibility of ['closed', 'open', 'three'])
    for (const same of [false, true])
      for (const plus of [false, true])
        for (const combo of [false, true]) {
          const rules = {
            allOpen: visibility === 'open',
            threeOpen: visibility === 'three',
            same,
            plus,
            combo,
            elemental: true,
            random: true,
          };
          const response = await request({ ...a, ip: testIp() }, '/lobbies', {
            mode: 'custom',
            rules,
            tradeRule: 'one',
          });
          const valid = visibility === 'closed' && same && plus && combo;
          expect(response.statusCode, response.body).toBe(valid ? 200 : 400);
          if (valid) await ok(a, `/lobbies/${response.json().lobbyId}`, undefined, 'DELETE');
        }
});
it('public profiles contain no deck, inventory or email and only owned avatars can be selected', async () => {
  const a = await user(),
    b = await user();
  const card = a.profile.deck[0];
  await ok(a, '/profile/avatar', { cardId: card });
  const publicView = await ok<Record<string, unknown>>(b, `/players/${a.profile.id}`);
  expect(publicView).toMatchObject({ id: a.profile.id, avatar: { id: card } });
  for (const key of ['deck', 'inventory', 'email', 'auth_user_id'])
    expect(publicView).not.toHaveProperty(key);
  expect((await request(a, '/profile/avatar', { cardId: 'does-not-exist' })).statusCode).toBe(400);
});
it('authenticates two independent cookie-free clients with signed bearer tokens', async () => {
  const tokens: string[] = [];
  for (let i = 0; i < 2; i++) {
    const response = await request(null, '/auth/sign-in/anonymous', {});
    const signed = response.headers['set-auth-token'];
    expect(typeof signed).toBe('string');
    tokens.push(signed as string);
  }
  const profiles = [];
  for (const token of tokens) {
    const r = await platform.app.inject({
      url: '/api/profile',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode, r.body).toBe(200);
    profiles.push(r.json().id);
  }
  expect(profiles[0]).not.toBe(profiles[1]);
  const invalid = await platform.app.inject({
    url: '/api/profile',
    headers: { authorization: 'Bearer forged-token' },
  });
  expect(invalid.statusCode).toBe(401);
});
it('blocks first duels and lobby joins until onboarding is complete', async () => {
  const response = await request(null, '/auth/sign-in/anonymous', {});
  const c: Client = {
    cookie: response.cookies.map((x) => `${x.name}=${x.value}`).join('; '),
    profile: null!,
  };
  c.profile = (await request(c, '/profile')).json();
  expect(c.profile.tutorialCompleted).toBe(false);
  expect((await request(c, '/solo', {})).statusCode).toBe(428);
  expect((await request(c, '/lobbies', { mode: 'casual' })).statusCode).toBe(428);
  await ok(c, '/tutorial/complete', {});
  for (const pack of await ok<{ id: string }[]>(c, '/boosters'))
    await ok(c, `/boosters/${pack.id}/open`, {});
  const { matchId } = await ok<{ matchId: string }>(c, '/solo', {});
  await ok(c, `/matches/${matchId}/resign`, {});
});
it('keeps Holo ownership separate, accepts it in a deck and trades the exact finish', async () => {
  const a = await user(true),
    b = await user(true),
    base = a.profile.deck[0].replace(/::holo(?::[0-3])?$/, ''),
    holo = base + '::holo';
  await platform.db.read((sql) =>
    sql(
      'INSERT INTO inventory(profile_id,card_id,quantity) VALUES($1,$2,1) ON CONFLICT(profile_id,card_id) DO UPDATE SET quantity=1',
      [a.profile.id, holo],
    ),
  );
  await platform.db.read((sql) =>
    sql(
      'INSERT INTO inventory(profile_id,card_id,quantity) VALUES($1,$2,1) ON CONFLICT(profile_id,card_id) DO UPDATE SET quantity=1',
      [a.profile.id, base],
    ),
  );
  const deck = [holo, ...a.profile.deck.slice(1)];
  await ok(a, '/deck', { cards: deck });
  const solo = await ok<{ matchId: string }>(a, '/solo', {});
  const m = await ok<MatchView>(a, `/matches/${solo.matchId}`);
  expect(m.game!.hands[0].some((c) => c.card?.id === holo && c.card.finish === 'holo')).toBe(true);
  await ok(a, `/matches/${solo.matchId}/resign`, {});
  const offer = await ok<{ id: string }>(a, '/trades', {
    offered: holo,
    wanted: b.profile.deck[1],
  });
  await ok(b, `/trades/${offer.id}/accept`, {});
  const pa = await ok<ProfileView>(a, '/profile'),
    pb = await ok<ProfileView>(b, '/profile');
  expect(pa.inventory[holo]).toBeUndefined();
  expect(pa.inventory[base].quantity).toBe(1);
  expect(pb.inventory[holo].quantity).toBe(1);
});
it('replaces new-account cards with three private, replay-safe starter boosters and preserves conversion', async () => {
  const a = await user(false, false),
    stranger = await user(false, false);
  expect(a.profile.inventory).toEqual({});
  expect(a.profile.deck).toEqual([]);
  expect(a.profile.prisms).toBe(0);
  expect(a.profile.unopenedBoosters).toBe(3);
  const packs = await ok<import('@gacha-triad/shared/platform').BoosterView[]>(a, '/boosters');
  expect(packs).toHaveLength(3);
  expect(packs.every((p) => !p.openedAt && p.cards.length === 0)).toBe(true);
  expect((await request(stranger, `/boosters/${packs[0].id}/open`, {})).statusCode).toBe(404);
  const results = await Promise.all([
    request(a, `/boosters/${packs[0].id}/open`, {}),
    request(a, `/boosters/${packs[0].id}/open`, {}),
  ]);
  expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
  expect(results[0].json()).toEqual(results[1].json());
  for (const pack of packs.slice(1)) await ok(a, `/boosters/${pack.id}/open`, {});
  const opened = await ok<import('@gacha-triad/shared/platform').BoosterView[]>(a, '/boosters');
  expect(opened.every((p) => p.cards.length === 5 && p.cards.some((c) => c.rarity >= 3))).toBe(
    true,
  );
  expect(opened.every((p) => new Set(p.cards.map((c) => c.baseCardId ?? c.id)).size === 5)).toBe(
    true,
  );
  const p = await ok<ProfileView>(a, '/profile');
  expect(Object.values(p.inventory).reduce((n, c) => n + c.quantity, 0)).toBe(15);
  expect(p.unopenedBoosters).toBe(0);
  expect(p.deck).toHaveLength(5);
  const signup = await request(a, '/auth/sign-up/email', {
    name: 'Booster convert',
    email: `${p.id}@test.invalid`,
    password: 'test-password-12345',
  });
  a.cookie = signup.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const after = await ok<ProfileView>(a, '/profile');
  expect(after.id).toBe(p.id);
  expect(after.inventory).toEqual(p.inventory);
  expect(after.unopenedBoosters).toBe(0);
  expect((await ok<unknown[]>(a, '/boosters')).length).toBe(3);
});
it('charges purchases atomically, rejects insufficient funds and replays a purchase without charging again', async () => {
  const c = await user();
  expect((await request(c, '/boosters/buy', { requestId: 'initial-no-funds' })).statusCode).toBe(
    409,
  );
  await platform.db.read((sql) =>
    sql('UPDATE profiles SET prisms=300 WHERE id=$1', [c.profile.id]),
  );
  const attempts = await Promise.all(
    ['purchase-one', 'purchase-two', 'purchase-three'].map((requestId) =>
      request(c, '/boosters/buy', { requestId }),
    ),
  );
  expect(attempts.map((r) => r.statusCode).sort()).toEqual([200, 200, 409]);
  const index = attempts.findIndex((r) => r.statusCode === 200),
    requestId = ['purchase-one', 'purchase-two', 'purchase-three'][index];
  const retry = await ok<{ id: string }>(c, '/boosters/buy', { requestId });
  expect(retry.id).toBe(attempts[index].json().id);
  const p = await ok<ProfileView>(c, '/profile');
  expect(p.prisms).toBe(0);
  expect(p.unopenedBoosters).toBe(2);
  expect((await request(c, '/boosters/buy', { requestId: 42 })).statusCode).toBe(400);
  expect(
    await platform.db.read((sql) =>
      sql("SELECT * FROM prism_ledger WHERE profile_id=$1 AND kind='booster'", [p.id]),
    ),
  ).toHaveLength(2);
});
it('pays 50/25/10 once for a full duel, including guest players, and pays nothing for forfeits', async () => {
  const a = await user(),
    b = await user();
  const { lobbyId } = await ok<{ lobbyId: string }>(a, '/lobbies', { mode: 'casual' });
  const { matchId } = await ok<{ matchId: string }>(b, `/lobbies/${lobbyId}/join`, {});
  const [initial] = await platform.db.read((sql) =>
    sql<{ state: GameState }>('SELECT state FROM matches WHERE id=$1', [matchId]),
  );
  let plan: Move[] | null = null;
  for (let seed = 0; seed < 1000 && !plan; seed++) {
    let state = initial.state;
    const moves: Move[] = [],
      random = seededRandom(seed);
    while (state.status === 'playing') {
      const options = legalMoves(state),
        move = options[Math.floor(random() * options.length)];
      moves.push(move);
      state = applyMove(state, move);
    }
    if (state.status === 'complete' && state.board.filter(Boolean).length === 9) {
      const counts = [0, 0];
      for (const cell of state.board) if (cell) counts[cell.owner]++;
      for (let seat = 0; seat < 2; seat++) counts[seat] += state.hands[seat].length;
      if (counts[0] !== counts[1]) plan = moves;
    }
  }
  expect(plan).not.toBeNull();
  for (let version = 0; version < 9; version++) {
    const move = plan![version];
    await ok(move.player === 0 ? a : b, `/matches/${matchId}/move`, { ...move, version });
  }
  for (const c of [a, b]) {
    const m = await ok<MatchView>(c, `/matches/${matchId}`);
    const expected = m.winner === 'draw' ? 25 : m.winner === m.seat ? 50 : 10;
    expect(m.prismReward).toBe(expected);
    expect((await ok<ProfileView>(c, '/profile')).prisms).toBe(expected);
    await ok(c, `/matches/${matchId}/resign`, {});
    expect((await ok<ProfileView>(c, '/profile')).prisms).toBe(expected);
  }
  const prior = (await ok<ProfileView>(a, '/profile')).prisms;
  const solo = await ok<{ matchId: string }>(a, '/solo', {});
  const resigned = await ok<MatchView>(a, `/matches/${solo.matchId}/resign`, {});
  expect(resigned.prismReward).toBe(0);
  expect((await ok<ProfileView>(a, '/profile')).prisms).toBe(prior);
});
it('restricts bot status and mutations to explicit registered administrators and isolates host moderation', async () => {
  const guest = await user(),
    account = await user(true);
  for (const c of [guest, account]) {
    expect(c.profile.isAdmin).toBe(false);
    expect((await request(c, '/local-bots')).statusCode).toBe(403);
    expect((await request(c, '/local-bots', { enabled: true, isAdmin: true })).statusCode).toBe(
      403,
    );
    expect((await request(c, '/local-control/users')).statusCode).toBe(404);
    expect(
      (
        await request(c, '/local-control/moderation', {
          profileId: c.profile.id,
          action: 'promote',
        })
      ).statusCode,
    ).toBe(404);
  }
  const secret = 'isolated-host-control-test';
  vi.stubEnv('LOCAL_CONTROL_SECRET', secret);
  try {
    const host = async (profileId: string, action: string) =>
      platform.app.inject({
        url: '/api/local-control/moderation',
        method: 'POST',
        headers: { 'x-local-control': secret },
        payload: { profileId, action, reason: 'test' },
      });
    expect((await host(guest.profile.id, 'promote')).statusCode).toBe(400);
    expect((await host(account.profile.id, 'promote')).statusCode).toBe(200);
    expect((await ok<ProfileView>(account, '/profile')).isAdmin).toBe(true);
    expect((await request(account, '/local-bots')).statusCode).toBe(200);
    expect((await request(account, '/local-bots', { enabled: false })).statusCode).toBe(200);
    expect((await host(account.profile.id, 'demote')).statusCode).toBe(200);
    expect((await request(account, '/local-bots')).statusCode).toBe(403);
    const lobby = await ok<{ lobbyId: string }>(account, '/lobbies', { mode: 'casual' });
    expect((await host(account.profile.id, 'suspend')).statusCode).toBe(200);
    expect((await request(account, '/profile')).statusCode).toBe(403);
    expect((await platform.store.lobbies()).some((l) => l.id === lobby.lobbyId)).toBe(false);
    expect((await host(account.profile.id, 'restore')).statusCode).toBe(200);
    expect((await request(account, '/profile')).statusCode).toBe(200);
  } finally {
    vi.unstubAllEnvs();
  }
});
it('allows cross-origin DELETE and closes only the host’s waiting lobby, idempotently', async () => {
  const a = await user(),
    b = await user();
  const preflight = await platform.app.inject({
    method: 'OPTIONS',
    url: '/api/lobbies/test',
    headers: {
      origin: 'http://127.0.0.1:3000',
      'access-control-request-method': 'DELETE',
      'access-control-request-headers': 'authorization,x-profile-id',
    },
  });
  expect(preflight.headers['access-control-allow-methods']).toContain('DELETE');
  const { lobbyId } = await ok<{ lobbyId: string }>(a, '/lobbies', {
    mode: 'custom',
    allowBots: false,
  });
  expect((await platform.store.lobbies()).find((l) => l.id === lobbyId)?.allowBots).toBe(false);
  expect((await request(b, `/lobbies/${lobbyId}`, undefined, 'DELETE')).statusCode).toBe(403);
  await ok(a, `/lobbies/${lobbyId}`, undefined, 'DELETE');
  await ok(a, `/lobbies/${lobbyId}`, undefined, 'DELETE');
  expect((await ok<ProfileView>(a, '/profile')).waitingLobbyId).toBeNull();
  const next = await ok<{ lobbyId: string }>(a, '/lobbies', { mode: 'custom', allowBots: true });
  const joined = await ok<{ matchId: string }>(b, `/lobbies/${next.lobbyId}/join`, {});
  expect((await request(a, `/lobbies/${next.lobbyId}`, undefined, 'DELETE')).statusCode).toBe(409);
  await ok(a, `/matches/${joined.matchId}/resign`, {});
});
it('prunes traded last copies from saved decks and prompts for a five-card deck', async () => {
  const a = await user(true),
    b = await user(true),
    give = a.profile.deck[0],
    want = b.profile.deck[0];
  await platform.db.read((sql) =>
    sql('UPDATE inventory SET quantity=1 WHERE profile_id=$1 AND card_id=$2', [a.profile.id, give]),
  );
  const offer = await ok<{ id: string }>(a, '/trades', { offered: give, wanted: want });
  await ok(b, `/trades/${offer.id}/accept`, {});
  const after = await ok<ProfileView>(a, '/profile');
  expect(after.deck).toHaveLength(4);
  expect(after.deck).not.toContain(give);
  const blocked = await request(a, '/solo', {});
  expect(blocked.statusCode).toBe(428);
  expect(blocked.json().error).toContain('4/5');
  expect((await request(a, '/solo', { rules: { random: true } })).statusCode).toBe(428);
  await ok(a, '/deck/auto', {});
  const solo = await ok<{ matchId: string }>(a, '/solo', {});
  await ok(a, `/matches/${solo.matchId}/resign`, {});
});
it('keeps medium difficulty as default, enforces no-bot tables and excludes Easy bots from ranked', async () => {
  const a = await user(true);
  await platform.bots.set(true, 'medium');
  const bot = await platform.store.profile({
    id: 'local-bot-0',
    name: '[BOT] Nova',
    isAnonymous: false,
  });
  if (bot.waitingLobbyId) await platform.store.cancelLobby(bot.id, bot.waitingLobbyId);
  const own = await ok<{ lobbyId: string }>(a, '/lobbies', { mode: 'custom', allowBots: false });
  await expect(platform.store.joinLobby(bot, own.lobbyId)).rejects.toMatchObject({
    statusCode: 403,
  });
  await ok(a, `/lobbies/${own.lobbyId}`, undefined, 'DELETE');
  await platform.bots.set(true, 'easy');
  await expect(platform.store.createLobby(bot, { mode: 'ranked' })).rejects.toMatchObject({
    statusCode: 403,
  });
  expect((await platform.bots.status()).difficulty).toBe('easy');
  await platform.bots.set(false, 'medium');
  expect((await platform.bots.status()).difficulty).toBe('medium');
});
it('discards a temporary guest on existing-account sign-in and removes legacy extra guest profiles', async () => {
  const account = await user(true),
    guest = await user();
  const temporaryId = guest.profile.id;
  const response = await request(guest, '/auth/sign-in/email', {
    email: `${account.profile.id}@test.invalid`,
    password: 'a-test-password-123',
  });
  expect(response.statusCode, response.body).toBe(200);
  guest.cookie = response.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const current = await ok<ProfileView>(guest, '/profile');
  expect(current.id).toBe(account.profile.id);
  expect(current.profiles).toHaveLength(1);
  expect(
    await platform.db.read((sql) => sql('SELECT 1 FROM profiles WHERE id=$1', [temporaryId])),
  ).toHaveLength(0);
  expect(
    await platform.db.read((sql) =>
      sql('SELECT 1 FROM inventory WHERE profile_id=$1', [temporaryId]),
    ),
  ).toHaveLength(0);
  const [{ auth_user_id }] = await platform.db.read((sql) =>
    sql<{ auth_user_id: string }>('SELECT auth_user_id FROM profile_accounts WHERE profile_id=$1', [
      account.profile.id,
    ]),
  );
  const legacyId = `legacy-${temporaryId}`;
  await platform.db.tx(async (sql) => {
    await sql("INSERT INTO profiles(id,name,default_deck) VALUES($1,'Guest old','[]')", [legacyId]);
    await sql('INSERT INTO profile_accounts(user_key,profile_id,auth_user_id) VALUES($1,$2,$1)', [
      auth_user_id,
      legacyId,
    ]);
  });
  await platform.guests.cleanup();
  expect(
    await platform.db.read((sql) => sql('SELECT 1 FROM profiles WHERE id=$1', [legacyId])),
  ).toHaveLength(0);
});
it('deletes guests inactive for seven days without deleting active guests or registered accounts', async () => {
  const expired = await user(),
    active = await user(),
    registered = await user(true);
  await platform.db.read((sql) =>
    sql("UPDATE profiles SET last_seen_at=now()-interval '8 days' WHERE id=$1 OR id=$2", [
      expired.profile.id,
      registered.profile.id,
    ]),
  );
  await platform.guests.cleanup();
  expect((await request(expired, '/profile')).statusCode).toBe(401);
  expect((await request(active, '/profile')).statusCode).toBe(200);
  expect((await request(registered, '/profile')).statusCode).toBe(200);
  expect(
    await platform.db.read((sql) =>
      sql('SELECT 1 FROM profiles WHERE id=$1', [expired.profile.id]),
    ),
  ).toHaveLength(0);
});
it('supports private friend requests, global chat with rate limits, and recipient-only duel invitations', async () => {
  const a = await user(true),
    b = await user(true),
    stranger = await user(true),
    guest = await user();
  expect((await request(guest, '/friends/request', { playerId: a.profile.id })).statusCode).toBe(
    403,
  );
  await ok(a, '/friends/request', { playerId: b.profile.id });
  expect(
    (await ok<import('@gacha-triad/shared/social').SocialView>(b, '/social')).friends[0].status,
  ).toBe('incoming');
  expect((await request(a, `/friends/${b.profile.id}/accept`, {})).statusCode).toBe(409);
  await ok(b, `/friends/${a.profile.id}/accept`, {});
  const chat = await ok<{ id: string }>(a, '/chat', {
    message: 'Hello <b>card hall</b>',
    requestId: 'hello-chat-retry',
  });
  expect(
    (
      await ok<{ id: string }>(a, '/chat', {
        message: 'Hello <b>card hall</b>',
        requestId: 'hello-chat-retry',
      })
    ).id,
  ).toBe(chat.id);
  expect(
    (await request(a, '/chat', { message: 'too fast', requestId: 'hello-too-fast' })).statusCode,
  ).toBe(429);
  expect(
    (await request(guest, '/chat', { message: 'guest', requestId: 'guest-message' })).statusCode,
  ).toBe(403);
  expect((await request(b, `/chat/${chat.id}`, undefined, 'DELETE')).statusCode).toBe(403);
  const invite = await ok<{ id: string; lobbyId: string }>(a, '/invites', {
    playerId: b.profile.id,
  });
  expect((await ok<ProfileView>(a, '/profile')).waitingLobby).toMatchObject({
    id: invite.lobbyId,
    mode: 'custom',
    invited: true,
  });
  expect((await request(stranger, `/lobbies/${invite.lobbyId}/join`, {})).statusCode).toBe(403);
  expect(
    (await request(stranger, `/invites/${invite.id}/respond`, { accept: true })).statusCode,
  ).toBe(404);
  const joined = await ok<{ matchId: string }>(b, `/invites/${invite.id}/respond`, {
    accept: true,
  });
  expect((await ok<MatchView>(a, `/matches/${joined.matchId}`)).rules).toMatchObject({
    threeOpen: true,
    same: true,
    plus: true,
    combo: true,
  });
  expect((await ok<ProfileView>(a, '/profile')).waitingLobby).toBeNull();
  expect(
    (await ok<{ matchId: string }>(b, `/invites/${invite.id}/respond`, { accept: true })).matchId,
  ).toBe(joined.matchId);
  await ok(a, `/matches/${joined.matchId}/resign`, {});
  const pending = await ok<{ id: string; lobbyId: string }>(a, '/invites', {
    playerId: b.profile.id,
  });
  await platform.db.read((sql) =>
    sql("UPDATE duel_invitations SET expires_at=now()-interval '1 second' WHERE id=$1", [
      pending.id,
    ]),
  );
  expect((await request(b, `/invites/${pending.id}/respond`, { accept: true })).statusCode).toBe(
    409,
  );
  expect((await ok<ProfileView>(a, '/profile')).waitingLobbyId).toBeNull();
  await ok(b, `/friends/${a.profile.id}`, undefined, 'DELETE');
  expect(
    (await ok<import('@gacha-triad/shared/social').SocialView>(a, '/social')).friends,
  ).toHaveLength(0);
});
it('guards first ranked entry, equips earned titles, exposes match avatars and lists human ratings', async () => {
  const a = await user(true),
    b = await user(true);
  await platform.db.read((sql) =>
    sql('UPDATE profiles SET ranked_acknowledged=false WHERE id=$1', [a.profile.id]),
  );
  expect((await request(a, '/lobbies', { mode: 'ranked' })).statusCode).toBe(428);
  expect((await request(a, '/ranked/acknowledge', {})).statusCode).toBe(400);
  await ok(a, '/ranked/acknowledge', { acknowledged: true });
  await ok(a, '/profile/avatar', { cardId: a.profile.deck[0] });
  expect((await request(a, '/profile/title', { titleId: 'triad-master' })).statusCode).toBe(400);
  const lobby = await ok<{ lobbyId: string }>(a, '/lobbies', { mode: 'ranked', allowBots: false });
  const joined = await ok<{ matchId: string }>(b, '/lobbies', { mode: 'ranked' });
  const match = await ok<MatchView>(a, `/matches/${joined.matchId}`);
  expect(match.players[0].avatar?.id).toBe(a.profile.deck[0]);
  await ok(b, `/matches/${joined.matchId}/resign`, {});
  await ok(a, `/matches/${joined.matchId}/claim`, { cardId: b.profile.deck[0] });
  await ok(a, '/profile/title', { titleId: 'card-player' });
  expect((await platform.store.playerProfile(a.profile.id)).title).toBe('Card Player');
  const ladder = await ok<import('@gacha-triad/shared/social').LadderEntry[]>(a, '/ladder');
  expect(ladder.some((p) => p.id === a.profile.id && p.games === 1)).toBe(true);
  expect(ladder.every((p) => !p.name.startsWith('[BOT]'))).toBe(true);
});
it('protects retry-safe admin grants and deletes only the explicitly confirmed account', async () => {
  const admin = await user(true),
    target = await user(true),
    other = await user(true);
  const grant = {
    profileId: target.profile.id,
    kind: 'prisms',
    amount: 300,
    requestId: 'admin-currency-retry',
  };
  expect((await request(other, '/admin/grants', grant)).statusCode).toBe(403);
  await platform.moderation.action(admin.profile.id, 'promote', 'test');
  await ok(admin, '/admin/grants', grant);
  await ok(admin, '/admin/grants', grant);
  expect((await ok<ProfileView>(target, '/profile')).prisms).toBe(300);
  const packs = { ...grant, kind: 'boosters', amount: 2, requestId: 'admin-boosters-retry' };
  await ok(admin, '/admin/grants', packs);
  await ok(admin, '/admin/grants', packs);
  expect((await ok<ProfileView>(target, '/profile')).unopenedBoosters).toBe(2);
  expect(
    (await request(admin, '/admin/grants', { ...packs, requestId: 'bad-admin-amount', amount: -1 }))
      .statusCode,
  ).toBe(400);
  vi.stubEnv('LOCAL_CONTROL_SECRET', 'delete-account-host');
  try {
    await ok(target, '/friends/request', { playerId: other.profile.id });
    await ok(other, `/friends/${target.profile.id}/accept`, {});
    await ok(target, '/chat', {
      message: 'This account will be deleted',
      requestId: 'deleted-chat-message',
    });
    const invite = await ok<{ id: string }>(target, '/invites', { playerId: other.profile.id });
    const duel = await ok<{ matchId: string }>(other, `/invites/${invite.id}/respond`, {
      accept: true,
    });
    const remove = (confirmation: string) =>
      platform.app.inject({
        method: 'POST',
        url: '/api/local-control/delete-account',
        headers: { 'x-local-control': 'delete-account-host' },
        payload: { profileId: target.profile.id, confirmation },
      });
    expect((await remove('wrong name')).statusCode).toBe(409);
    expect((await request(target, '/profile')).statusCode).toBe(200);
    expect((await remove(target.profile.name)).statusCode).toBe(200);
    expect((await request(target, '/profile')).statusCode).toBe(401);
    expect(
      await platform.db.read((sql) =>
        sql('SELECT 1 FROM profiles WHERE id=$1', [target.profile.id]),
      ),
    ).toHaveLength(0);
    expect((await request(other, '/profile')).statusCode).toBe(200);
    expect((await ok<MatchView>(other, `/matches/${duel.matchId}`)).status).toBe('complete');
    expect(
      (await ok<import('@gacha-triad/shared/social').SocialView>(other, '/social')).friends,
    ).toHaveLength(0);
    expect(
      await platform.db.read((sql) =>
        sql('SELECT 1 FROM chat_messages WHERE profile_id=$1', [target.profile.id]),
      ),
    ).toHaveLength(0);
  } finally {
    vi.unstubAllEnvs();
  }
});
