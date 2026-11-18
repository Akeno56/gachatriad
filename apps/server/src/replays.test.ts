import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createPlatform } from './app';
import { MatchReplays, replayFrames } from './replays';
import { ALL_CARDS } from '@gacha-triad/shared';
import {
  applyMove,
  createGame,
  legalMoves,
  scores,
  seededRandom,
  shuffle,
  STANDARD,
  type Card,
  type GameState,
  type Player,
} from '@gacha-triad/engine';
import type { ReplayList, ReplayView } from '@gacha-triad/shared/replays';

let p: Awaited<ReturnType<typeof createPlatform>>,
  replays: MatchReplays,
  serial = 0;
beforeAll(async () => {
  p = await createPlatform(resolve('.'), { memory: true, timers: false });
  await p.bots.set(false);
  replays = new MatchReplays(p.db);
});
afterAll(async () => {
  await p.app.close();
});
async function user() {
  const n = ++serial;
  const r = await p.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    remoteAddress: `198.18.18.${n}`,
    payload: {
      name: `Replay tester ${n}`,
      email: `replay-${n}@test.invalid`,
      password: 'replay-test-password',
    },
  });
  expect(r.statusCode, r.body).toBe(200);
  const actor = { ...r.json().user, isAnonymous: false },
    token = String(r.headers['set-auth-token']);
  let profile = await p.store.profile(actor);
  for (const pack of await p.store.economy.list(profile.id))
    await p.store.economy.open(profile.id, pack.id);
  await p.store.rebuildDeck(profile.id);
  await p.store.completeTutorial(profile.id);
  profile = await p.store.profile(actor);
  return { actor, token, profile };
}
type User = Awaited<ReturnType<typeof user>>;
async function request(u: User, path: string, body?: unknown) {
  return p.app.inject({
    method: body === undefined ? 'GET' : 'POST',
    url: '/api' + path,
    headers: { authorization: `Bearer ${u.token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}
async function legacy(a: User, b?: User, completedAt = new Date(), mode = 'custom') {
  const decks = [a.profile.deck, (b ?? a).profile.deck].map((d) =>
    d.map((id) => ALL_CARDS.find((c) => c.id === id)!),
  ) as [Card[], Card[]];
  let state = createGame(
    decks,
    { ...STANDARD, same: true, plus: true, combo: true },
    seededRandom(18),
  );
  for (let i = 0; i < 6; i++)
    state = applyMove(state, legalMoves(state)[i % legalMoves(state).length]);
  const id = randomUUID();
  await p.db.read((sql) =>
    sql(
      "INSERT INTO matches(id,mode,player0,player1,state,decks,rules,status,winner,is_draw,end_reason,completed_at,settlement_done) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,'complete',0,false,'forfeit',$8,true)",
      [
        id,
        mode,
        a.profile.id,
        b?.profile.id ?? null,
        JSON.stringify(state),
        JSON.stringify(decks.map((d) => d.map((c) => c.id))),
        JSON.stringify(state.rules),
        completedAt,
      ],
    ),
  );
  return { id, state, decks };
}
it('reconstructs every actual frame including special captures, both starters, partial games and Elemental/Holo values', () => {
  const reasons = new Set<string>();
  for (let seed = 0; seed < 90; seed++) {
    const random = seededRandom(seed),
      pool = shuffle(
        ALL_CARDS.filter((c) => c.enabled),
        random,
      );
    const decks: [Card[], Card[]] = [pool.slice(0, 5), pool.slice(5, 10)];
    decks[0][0] = {
      ...decks[0][0],
      finish: 'holo',
      holoBonusSide: 0,
      stats: [
        Math.min(10, decks[0][0].stats[0] + 1),
        ...decks[0][0].stats.slice(1),
      ] as unknown as Card['stats'],
    };
    const states = [
      createGame(
        decks,
        { ...STANDARD, same: true, plus: true, combo: true, elemental: true },
        random,
      ),
    ];
    for (let turn = 0; turn < (seed % 3 === 0 ? 5 : 9); turn++) {
      const state = states.at(-1)!,
        moves = legalMoves(state);
      states.push(applyMove(state, moves[Math.floor(random() * moves.length)]));
    }
    const frozen = structuredClone(states.at(-1)!);
    const frames = replayFrames(frozen, decks);
    expect(frames).toHaveLength(states.length);
    frames.forEach((frame, i) => {
      const actual = states[i];
      expect(frame.board).toEqual(
        actual.board.map((s) =>
          s ? { cardId: s.card.id, owner: s.owner, originalOwner: s.originalOwner } : null,
        ),
      );
      expect(frame.hands).toEqual(actual.hands.map((h) => h.map((c) => c.id)));
      expect(frame.score).toEqual(scores(actual));
      expect(frame.turn).toBe(actual.turn);
      expect(frame.move).toEqual(actual.history.at(-1)?.move ?? null);
      expect(frame.captures).toEqual(actual.history.at(-1)?.captures ?? []);
      frame.captures.forEach((c) => reasons.add(c.reason));
    });
    expect(frozen).toEqual(states.at(-1));
  }
  expect([...reasons].sort()).toEqual(['combo', 'plus', 'same', 'standard']);
});
it('rejects unauthenticated, unrelated and live-match access without leaking closed hands', async () => {
  const a = await user(),
    b = await user(),
    other = await user();
  await p.store.createLobby(a.profile, { mode: 'ranked', allowBots: false });
  const { matchId: id } = await p.store.createLobby(b.profile, {
    mode: 'ranked',
    allowBots: false,
  });
  expect((await request(a, `/replays/${id}`)).statusCode).toBe(404);
  expect((await request(a, '/replays')).json<ReplayList>().total).toBe(0);
  await p.store.resign(b.profile.id, id!);
  expect((await p.app.inject({ url: `/api/replays/${id}` })).statusCode).toBe(401);
  expect((await request(other, `/replays/${id}`)).statusCode).toBe(404);
  expect((await request(other, `/replays/${id}/favorite`, { favorite: true })).statusCode).toBe(
    404,
  );
  const first = (await request(a, `/replays/${id}`)).json<ReplayView>();
  const second = (await request(b, `/replays/${id}`)).json<ReplayView>();
  expect(first.seat).not.toBe(second.seat);
  expect(first.frames).toEqual(second.frames);
  expect(first.ratings).toEqual([
    { before: 1000, after: 1016 },
    { before: 1000, after: 984 },
  ]);
  expect(first.endReason).toBe('forfeit');
  expect(first.tradeRule).toBe('none');
  const balance = (await p.store.profile(a.actor)).prisms;
  await request(a, `/replays/${id}/favorite`, { favorite: true });
  expect((await request(b, `/replays/${id}`)).json<ReplayView>().favorite).toBe(false);
  expect((await request(a, '/replays?favorites=true')).json<ReplayList>().total).toBe(1);
  expect((await request(b, '/replays?favorites=true')).json<ReplayList>().total).toBe(0);
  const listing = (await request(a, '/replays')).json<ReplayList>();
  expect(listing.rows[0]).not.toHaveProperty('decks');
  expect(listing.rows[0]).not.toHaveProperty('frames');
  for (const bad of [null, 'true', 1, {}])
    expect((await request(a, `/replays/${id}/favorite`, { favorite: bad })).statusCode).toBe(400);
  expect((await p.store.profile(a.actor)).prisms).toBe(balance);
  expect((await replays.get(a.profile.id, id!)).ratings).toEqual(first.ratings);
});
it('backfills any page of older matches, filters and paginates without duplicating rows', async () => {
  const a = await user();
  const ids = [];
  for (let i = 0; i < 23; i++)
    ids.push(
      (await legacy(a, undefined, new Date(Date.now() - i * 1000), i === 22 ? 'draft' : 'custom'))
        .id,
    );
  const page2 = await replays.list(a.profile.id, { offset: '20' });
  expect(page2.total).toBe(23);
  expect(page2.rows.map((r) => r.id)).toEqual(ids.slice(20));
  const page1 = await replays.list(a.profile.id, {});
  expect(page1.rows).toHaveLength(20);
  expect(page1.rows.map((r) => r.id)).toEqual(ids.slice(0, 20));
  expect((await replays.list(a.profile.id, { mode: 'draft' })).rows.map((r) => r.id)).toEqual([
    ids[22],
  ]);
  for (const query of [
    { offset: '-1' },
    { offset: '1.5' },
    { offset: 'NaN' },
    { mode: 'invented' },
    { favorites: '1' },
  ])
    await expect(replays.list(a.profile.id, query)).rejects.toMatchObject({ statusCode: 400 });
  await replays.favorite(a.profile.id, ids[21], true);
  await replays.favorite(a.profile.id, ids[21], true);
  expect((await replays.list(a.profile.id, { favorites: 'true' })).rows.map((r) => r.id)).toEqual([
    ids[21],
  ]);
});
it('keeps snapshotted values after state edits and anonymizes deleted participants', async () => {
  const a = await user(),
    b = await user(),
    { id } = await legacy(a, b);
  const saved = await replays.get(a.profile.id, id);
  await p.db.read((sql) =>
    sql("UPDATE matches SET state=NULL,decks='[[],[]]'::jsonb WHERE id=$1", [id]),
  );
  expect((await replays.get(b.profile.id, id)).decks).toEqual(saved.decks);
  expect((await replays.get(a.profile.id, id)).frames).toEqual(saved.frames);
  await p.guests.deleteAccount(a.profile.id, a.profile.name);
  const remaining = await replays.get(b.profile.id, id);
  expect(remaining.players[0]).toEqual({ name: 'Deleted player', avatar: null, botStyle: null });
  expect(JSON.stringify(remaining)).not.toContain(a.profile.name);
  await expect(replays.get(a.profile.id, id)).rejects.toMatchObject({ statusCode: 404 });
  await p.guests.deleteAccount(b.profile.id, b.profile.name);
  expect(
    await p.db.read((sql) => sql('SELECT 1 FROM match_replays WHERE match_id=$1', [id])),
  ).toHaveLength(0);
});
it('records Trade One settlement without changing the original decks', async () => {
  const a = await user(),
    b = await user();
  const lobby = await p.store.createLobby(a.profile, {
    mode: 'custom',
    tradeRule: 'one',
    allowBots: false,
    rules: { ...STANDARD, same: true, plus: true, combo: true },
  });
  const joined = await p.store.joinLobby(b.profile, lobby.lobbyId!);
  const id = joined.matchId!;
  await p.store.resign(b.profile.id, id);
  const before = await replays.get(a.profile.id, id);
  expect(before.tradePending).toBe(true);
  const claimed = b.profile.deck[0];
  await p.store.claimCard(a.profile.id, id, claimed);
  const after = await replays.get(a.profile.id, id);
  expect(after.tradePending).toBe(false);
  expect(after.claimedCardId).toBe(claimed);
  expect(after.decks).toEqual(before.decks);
});
it('persists selected practice styles, rejects invalid ones, and archives a natural completed duel', async () => {
  const a = await user();
  expect(
    (await request(a, '/solo', { difficulty: 'normal', rules: STANDARD, style: 'cheater' }))
      .statusCode,
  ).toBe(400);
  const started = await request(a, '/solo', {
    difficulty: 'normal',
    rules: STANDARD,
    style: 'defensive',
  });
  expect(started.statusCode, started.body).toBe(200);
  const id = started.json().matchId;
  expect((await p.store.view(a.profile.id, id)).cpuStyle).toBe('defensive');
  for (let turn = 0; turn < 12; turn++) {
    const [m] = await p.db.read((sql) =>
      sql<{ state: GameState; version: number }>('SELECT state,version FROM matches WHERE id=$1', [
        id,
      ]),
    );
    if (m.state.status === 'complete') break;
    if (m.state.turn === 0) {
      const move = legalMoves(m.state)[0];
      await p.store.move(a.profile.id, id, move.cardId, move.cell, m.version);
    } else {
      await p.db.read((sql) =>
        sql('UPDATE matches SET deadline=$1 WHERE id=$2', [Date.now() - 10, id]),
      );
      await p.store.tick();
    }
  }
  const replay = await replays.get(a.profile.id, id);
  expect(replay.frames).toHaveLength(10);
  expect(replay.players[1].botStyle).toBe('defensive');
  expect(replay.ratings).toEqual([null, null]);
  expect(replay.frames[9].score.reduce((a, b) => a + b)).toBe(10);
  const old = await p.store.solo(a.profile.id, 'easy', STANDARD);
  expect((await p.store.view(a.profile.id, old)).cpuStyle).toBe('balanced');
  await p.store.resign(a.profile.id, old);
});
it('saves abandoned draft selections without exposing an active draft', async () => {
  const a = await user(),
    b = await user();
  for (const mode of ['draft', 'shared-draft'] as const) {
    await p.store.createLobby(a.profile, { mode, allowBots: false });
    const { matchId } = await p.store.createLobby(b.profile, { mode, allowBots: false });
    await expect(replays.get(a.profile.id, matchId!)).rejects.toMatchObject({ statusCode: 404 });
    await p.store.resign(b.profile.id, matchId!);
    const saved = await replays.get(a.profile.id, matchId!);
    expect(saved.mode).toBe(mode);
    expect(saved.endReason).toBe('draft abandoned');
    expect(saved.frames).toHaveLength(1);
    expect(saved.frames[0].move).toBeNull();
    expect(saved.players.map((p) => p.name)).toEqual([a.profile.name, b.profile.name]);
  }
});
it('keeps population bot styles consistent and displays them without granting Elo', async () => {
  await p.bots.set(true, 'medium');
  try {
    const first = await p.db.read((sql) =>
      sql<{ id: string; bot_style: string }>(
        'SELECT id,bot_style FROM profiles WHERE is_bot ORDER BY id',
      ),
    );
    expect([...new Set(first.map((b) => b.bot_style))].sort()).toEqual([
      'aggressive',
      'balanced',
      'combo',
      'defensive',
    ]);
    await p.bots.set(true, 'hard');
    expect(
      await p.db.read((sql) => sql('SELECT id,bot_style FROM profiles WHERE is_bot ORDER BY id')),
    ).toEqual(first);
    const bot = await p.store.profile({ id: 'local-bot-1', name: '[BOT] Mog', isAnonymous: false });
    const lobby = await p.store.createLobby(bot, { mode: 'custom', allowBots: true });
    expect((await p.store.lobbies()).find((l) => l.id === lobby.lobbyId)?.botStyle).toBe(
      'aggressive',
    );
    const a = await user(),
      joined = await p.store.joinLobby(a.profile, lobby.lobbyId!);
    const match = await p.store.view(a.profile.id, joined.matchId!);
    expect(match.players.find((p) => p.id === bot.id)?.botStyle).toBe('aggressive');
    await p.store.resign(a.profile.id, joined.matchId!);
    const replay = await replays.get(a.profile.id, joined.matchId!);
    expect(replay.players[0].botStyle).toBe('aggressive');
    expect(replay.ratings).toEqual([null, null]);
  } finally {
    await p.bots.set(false);
  }
});
