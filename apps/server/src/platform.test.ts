import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { createPlatform } from './app';
import type { MatchView, ProfileView, LobbyView } from '@gacha-triad/shared/platform';
import {
  applyMove,
  legalMoves,
  randomDeck,
  seededRandom,
  type GameState,
  type Move,
} from '@gacha-triad/engine';
let platform: Awaited<ReturnType<typeof createPlatform>>;
type Client = { cookie: string; profile: ProfileView };
async function request(
  client: Client | null,
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
) {
  return platform.app.inject({
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
async function user(registered = false) {
  const response = await request(null, '/auth/sign-in/anonymous', {});
  expect(response.statusCode, response.body).toBe(200);
  const client: Client = {
    cookie: response.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
    profile: null!,
  };
  client.profile = (await request(client, '/profile')).json();
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
  }
  return client;
}
async function ok<T>(c: Client, path: string, body?: unknown, method?: string): Promise<T> {
  const r = await request(c, path, body, method);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}
beforeAll(async () => {
  platform = await createPlatform(resolve('.'), { memory: true, timers: false });
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
  expect(Object.keys(p.inventory).length).toBeGreaterThan(20);
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
  expect((await ok<LobbyView[]>(c, '/lobbies')).find((l) => l.id === d.lobbyId)?.tradeRule).toBe(
    'none',
  );
  await ok(c, `/lobbies/${d.lobbyId}`, undefined, 'DELETE');
  await ok(a, `/lobbies/${r.lobbyId}`, undefined, 'DELETE');
  await ok(b, `/lobbies/${u.lobbyId}`, undefined, 'DELETE');
});
it('settles Trade One exactly once with permanent inventory changes, even on forfeit', async () => {
  const a = await user(true),
    b = await user(true);
  const l = await ok<{ lobbyId: string }>(a, '/lobbies', { mode: 'ranked' });
  const { matchId } = await ok<{ matchId: string }>(b, `/lobbies/${l.lobbyId}/join`, {});
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
  const { matchId } = await ok<{ matchId: string }>(b, `/lobbies/${lobbyId}/join`, {});
  for (const c of [a, b]) {
    const m = await ok<MatchView>(c, `/matches/${matchId}`);
    expect(m.draftPool).toHaveLength(8);
    expect(m.game).toBeNull();
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
  const { matchId } = await ok<{ matchId: string }>(b, `/lobbies/${lobbyId}/join`, {});
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
  expect((await platform.bots.status()).bots).toBe(10);
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
          const response = await request(a, '/lobbies', {
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
  const { matchId } = await ok<{ matchId: string }>(c, '/solo', {});
  await ok(c, `/matches/${matchId}/resign`, {});
});
it('keeps Holo ownership separate, accepts it in a deck and trades the exact finish', async () => {
  const a = await user(true),
    b = await user(true),
    base = a.profile.deck[0],
    holo = base + '::holo';
  await platform.db.read((sql) =>
    sql('INSERT INTO inventory(profile_id,card_id,quantity) VALUES($1,$2,1)', [a.profile.id, holo]),
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
