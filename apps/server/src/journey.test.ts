import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createPlatform } from './app';
import { PlayerJourney, weekWindow } from './journey';
import { puzzleDay, puzzleValue } from './daily-puzzle';
import { ALL_CARDS } from '@gacha-triad/shared';
import { applyMove, createGame, legalMoves, STANDARD, type GameState } from '@gacha-triad/engine';
import type { JourneyView, WeeklyView } from '@gacha-triad/shared/journey';

let p: Awaited<ReturnType<typeof createPlatform>>,
  serial = 0;
beforeAll(async () => {
  p = await createPlatform(resolve('.'), { memory: true, timers: false });
  await p.bots.set(false);
});
afterAll(async () => {
  await p.app.close();
});
async function user(guest = false) {
  const n = ++serial;
  const r = await p.app.inject({
    method: 'POST',
    url: guest ? '/api/auth/sign-in/anonymous' : '/api/auth/sign-up/email',
    remoteAddress: `198.18.17.${n}`,
    payload: guest
      ? {}
      : {
          name: `Traveller ${n}`,
          email: `journey-${n}@test.invalid`,
          password: 'journey-test-password',
        },
  });
  expect(r.statusCode, r.body).toBe(200);
  const actor = { ...r.json().user, isAnonymous: guest },
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
async function request(u: User, path = '/journey', body?: unknown, extraHeaders = {}) {
  return p.app.inject({
    method: body === undefined ? 'GET' : 'POST',
    url: '/api' + path,
    headers: {
      authorization: `Bearer ${u.token}`,
      'content-type': 'application/json',
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}
async function view(u: User) {
  const r = await request(u);
  expect(r.statusCode, r.body).toBe(200);
  return r.json<JourneyView>();
}
async function openWeeklyBoosters(u: User) {
  await p.store.economy.grant(u.profile.id, 'boosters', 2, randomUUID(), 'Weekly test');
  for (const pack of await p.store.economy.list(u.profile.id))
    if (!pack.openedAt) await p.store.economy.open(u.profile.id, pack.id);
}
async function saveWeeklyDeck(u: User) {
  expect(
    (await request(u, '/deck-loadouts', { name: 'Weekly hand', cards: u.profile.deck })).statusCode,
  ).toBe(200);
}
async function storedDuel(
  u: User,
  mode: string,
  date = new Date(),
  reason: string | null = null,
  turns = 9,
  opponent?: string,
  season = 0,
) {
  const deck = u.profile.deck.map((id) => ALL_CARDS.find((card) => card.id === id)!);
  let state = createGame([deck, deck], STANDARD, () => 0);
  for (let i = 0; i < turns; i++) state = applyMove(state, legalMoves(state)[0]);
  const id = randomUUID();
  await p.db.read((sql) =>
    sql(
      "INSERT INTO matches(id,mode,player0,player1,state,decks,rules,status,winner,is_draw,end_reason,completed_at,settlement_done,season) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,'complete',0,false,$8,$9,true,$10)",
      [
        id,
        mode,
        u.profile.id,
        opponent ?? null,
        JSON.stringify(state),
        JSON.stringify([u.profile.deck, u.profile.deck]),
        JSON.stringify(STANDARD),
        reason,
        date,
        season,
      ],
    ),
  );
  return id;
}
it('uses Monday UTC boundaries across Sundays and years', () => {
  expect(weekWindow(Date.parse('2026-11-22T23:59:59.999Z'))).toEqual({
    week: '2026-11-16',
    start: '2026-11-16T00:00:00.000Z',
    resetAt: '2026-11-23T00:00:00.000Z',
  });
  expect(weekWindow(Date.parse('2026-11-23T00:00:00Z')).week).toBe('2026-11-23');
  expect(weekWindow(Date.parse('2027-01-01T05:00:00Z')).week).toBe('2026-12-28');
});
it('swaps one unfinished weekly objective for an alternative of the same tier', async () => {
  const u = await user(),
    guest = await user(true);
  await storedDuel(u, 'solo');
  await saveWeeklyDeck(u);
  const initial = (await view(u)).weekly;
  const path = '/journey/weekly/swap';
  const valid = { week: initial.week, original: 'puzzle', replacement: 'practice' };
  expect((await request(guest, path, valid)).statusCode).toBe(403);
  expect((await request(u, path, { ...valid, original: 'deck' })).statusCode).toBe(409);
  expect((await request(u, path, { ...valid, original: 'boosters' })).statusCode).toBe(400);
  expect((await request(u, path, { ...valid, week: '2001-01-01' })).statusCode).toBe(409);
  const responses = await Promise.all([request(u, path, valid), request(u, path, valid)]);
  expect(responses.map((response) => response.statusCode)).toEqual([200, 409]);
  const updated = responses[0].json<WeeklyView>();
  expect(updated).toMatchObject({
    required: 5,
    completed: initial.completed + 1,
    swapped: true,
    reward: initial.reward,
  });
  expect(updated.objectives).toHaveLength(6);
  expect(updated.objectives.find((row) => row.id === 'practice')?.progress).toBe(1);
  expect(updated.objectives.some((row) => row.id === 'puzzle')).toBe(false);
  expect((await view(u)).weekly).toEqual(updated);
  const newWeek = new PlayerJourney(p.db, () => Date.parse(initial.resetAt));
  expect((await newWeek.view(u.profile.id, u.actor.id, true)).weekly).toMatchObject({
    swapped: false,
    objectives: expect.arrayContaining([{ id: 'puzzle', progress: 0 }]),
  });
});
it('counts a real completed practice duel and excludes forfeits, timeouts, admin results and old weeks', async () => {
  const u = await user();
  const id = await p.store.solo(u.profile.id, 'easy', STANDARD);
  for (let i = 0; i < 12; i++) {
    const [m] = await p.db.read((sql) =>
      sql<{ state: GameState; version: number }>('SELECT state,version FROM matches WHERE id=$1', [
        id,
      ]),
    );
    if (m.state.status === 'complete') break;
    if (m.state.turn === 0) {
      const move = legalMoves(m.state)[0];
      await p.store.move(u.profile.id, id, move.cardId, move.cell, m.version);
    } else {
      await p.db.read((sql) =>
        sql('UPDATE matches SET deadline=$1 WHERE id=$2', [Date.now() - 10, id]),
      );
      await p.store.tick();
    }
  }
  expect((await p.store.view(u.profile.id, id)).status).toBe('complete');
  await storedDuel(u, 'custom', new Date(), 'forfeit');
  await storedDuel(u, 'draft', new Date(), 'two consecutive missed turns');
  await storedDuel(u, 'shared-draft', new Date(), 'admin test result');
  await storedDuel(u, 'roulette', new Date(), null, 3);
  await storedDuel(u, 'custom', new Date(Date.parse(weekWindow().start) - 1));
  const result = await view(u);
  expect(result.weekly.objectives.find((r) => r.id === 'duels')?.progress).toBe(1);
  expect(result.weekly.objectives.find((r) => r.id === 'modes')?.progress).toBe(1);
  expect(result.weekly.objectives.find((r) => r.id === 'variant')?.progress).toBe(0);
  expect(result.chapters.find((r) => r.id === 'duel')?.completed).toBe(true);
});
it('requires five of six objectives and pays exactly once under repeated and concurrent requests', async () => {
  const u = await user();
  await storedDuel(u, 'solo');
  await storedDuel(u, 'custom');
  await storedDuel(u, 'solo');
  let result = await view(u);
  expect(result.weekly.completed).toBe(3);
  expect(result.weekly.required).toBe(5);
  expect(result.weekly.objectives).toHaveLength(6);
  expect((await request(u, '/journey/weekly/claim', { week: result.weekly.week })).statusCode).toBe(
    409,
  );
  await saveWeeklyDeck(u);
  result = await view(u);
  expect(result.weekly.completed).toBe(4);
  expect((await request(u, '/journey/weekly/claim', { week: result.weekly.week })).statusCode).toBe(
    409,
  );
  await openWeeklyBoosters(u);
  result = await view(u);
  expect(result.weekly.completed).toBe(5);
  const before = await p.store.profile(u.actor);
  expect((await request(u, '/journey/weekly/claim', { week: '2000-01-03' })).statusCode).toBe(409);
  const claims = await Promise.all(
    Array.from({ length: 4 }, () =>
      request(u, '/journey/weekly/claim', { week: result.weekly.week }),
    ),
  );
  expect(claims.map((r) => r.statusCode)).toEqual([200, 200, 200, 200]);
  expect(claims.reduce((n, r) => n + r.json().awarded, 0)).toBe(150);
  const after = await p.store.profile(u.actor);
  expect(after.prisms - before.prisms).toBe(150);
  expect(after.inventory).toEqual(before.inventory);
  expect(after.deck).toEqual(before.deck);
  expect((await view(u)).weekly.claimed).toBe(true);
  expect(
    await p.db.read((sql) =>
      sql("SELECT id FROM prism_ledger WHERE profile_id=$1 AND kind='weekly-journey'", [
        u.profile.id,
      ]),
    ),
  ).toHaveLength(1);
  const nextWeek = new PlayerJourney(p.db, () => Date.parse(result.weekly.resetAt));
  const next = await nextWeek.view(u.profile.id, u.actor.id, true);
  expect(next.weekly.claimed).toBe(false);
  expect(next.weekly.completed).toBe(0);
  await expect(nextWeek.claim(u.profile.id, u.actor.id, true, result.weekly.week)).rejects.toThrow(
    'new week',
  );
});
it('keeps guest progress without paying guests, and ignores forged client progress or profile IDs', async () => {
  const guest = await user(true),
    owner = await user(),
    other = await user();
  await storedDuel(guest, 'solo');
  await storedDuel(guest, 'custom');
  await storedDuel(guest, 'solo');
  await saveWeeklyDeck(guest);
  await openWeeklyBoosters(guest);
  const g = await view(guest);
  expect(g.weekly.completed).toBe(5);
  expect(g.weekly.registered).toBe(false);
  expect((await request(guest, '/journey/weekly/claim', { week: g.weekly.week })).statusCode).toBe(
    403,
  );
  const forge = await request(owner, '/journey/weekly/claim', {
    week: g.weekly.week,
    completed: 6,
    profileId: guest.profile.id,
  });
  expect(forge.statusCode).toBe(409);
  expect(
    (await request(owner, '/journey', undefined, { 'x-profile-id': other.profile.id })).statusCode,
  ).toBe(403);
  expect((await p.app.inject({ url: '/api/journey' })).statusCode).toBe(401);
  expect((await p.store.profile(guest.actor)).prisms).toBe(guest.profile.prisms);
});
it('records complete saved decks permanently, excluding incomplete loadouts and starter packs from weekly goals', async () => {
  const u = await user();
  await request(u, '/deck-loadouts', { name: 'Incomplete', cards: u.profile.deck.slice(0, 4) });
  let result = await view(u);
  expect(result.weekly.objectives.find((r) => r.id === 'deck')?.progress).toBe(0);
  expect(result.weekly.objectives.find((r) => r.id === 'boosters')?.progress).toBe(0);
  expect(result.chapters.find((r) => r.id === 'booster')?.completed).toBe(true);
  const saved = await request(u, '/deck-loadouts', { name: 'Full hand', cards: u.profile.deck });
  expect(saved.statusCode).toBe(200);
  await p.db.read((sql) => sql('DELETE FROM deck_loadouts WHERE id=$1', [saved.json().id]));
  result = await view(u);
  expect(result.weekly.objectives.find((r) => r.id === 'deck')?.progress).toBe(1);
  expect(result.chapters.find((r) => r.id === 'deck')?.completed).toBe(true);
  await p.store.migrate(resolve('.'));
  expect((await view(u)).chapters.find((r) => r.id === 'deck')?.completed).toBe(true);
});
it('uses the actual rating ledger and separates the current season and all three formats', async () => {
  const u = await user(),
    rival = await user();
  for (const mode of ['ranked', 'draft', 'shared-draft']) {
    const id = await storedDuel(u, mode, new Date(), null, 9, rival.profile.id);
    await p.db.read((sql) =>
      sql(
        'INSERT INTO match_ratings(match_id,profile_id,before_rating,after_rating) VALUES($1,$2,1000,1016)',
        [id, u.profile.id],
      ),
    );
  }
  await storedDuel(u, 'ranked', new Date(), null, 9, rival.profile.id); // Unrated human result.
  const old = await storedDuel(u, 'ranked', new Date(), null, 9, rival.profile.id, -1);
  await p.db.read((sql) =>
    sql(
      'INSERT INTO match_ratings(match_id,profile_id,before_rating,after_rating) VALUES($1,$2,1000,1016)',
      [old, u.profile.id],
    ),
  );
  const result = await view(u);
  expect(result.records.map((r) => ({ mode: r.mode, games: r.games, wins: r.wins }))).toEqual([
    { mode: 'ranked', games: 1, wins: 1 },
    { mode: 'ranked-random', games: 0, wins: 0 },
    { mode: 'draft', games: 1, wins: 1 },
    { mode: 'shared-draft', games: 1, wins: 1 },
  ]);
  expect(result.season).toMatchObject({ id: 0, name: 'Astral', endAt: null });
  const ladder = (await request(u, '/ladder?mode=ranked')).json();
  expect(ladder.find((row: { id: string }) => row.id === u.profile.id)?.games).toBe(1);
});

it('counts real puzzle, booster and loadout actions toward the five-objective reward', async () => {
  const u = await user();
  const daily = await p.store.economy.claimDaily(u.profile.id, true);
  await p.store.economy.open(u.profile.id, daily.id);
  await p.store.economy.grant(u.profile.id, 'boosters', 1, randomUUID(), 'Journey test');
  const extra = (await p.store.economy.list(u.profile.id)).find((pack) => !pack.openedAt)!;
  await p.store.economy.open(u.profile.id, extra.id);
  expect(
    (await request(u, '/deck-loadouts', { name: 'Puzzle hand', cards: u.profile.deck })).statusCode,
  ).toBe(200);
  let puzzle = await p.puzzles.start(
    u.profile.id,
    true,
    { day: puzzleDay(), requestId: randomUUID() },
    u.actor.id,
  );
  while (puzzle.state?.status === 'playing') {
    const move = legalMoves(puzzle.state).find(
      (move) => puzzleValue(applyMove(puzzle.state!, move)) > 5,
    )!;
    puzzle = await p.puzzles.move(
      u.profile.id,
      true,
      { ...move, day: puzzle.day, version: puzzle.version },
      u.actor.id,
    );
  }
  expect(puzzle.solved).toBe(true);
  const result = await view(u);
  expect(result.weekly.completed).toBe(3);
  expect(result.weekly.objectives.filter((row) => row.progress > 0).map((row) => row.id)).toEqual([
    'puzzle',
    'boosters',
    'deck',
  ]);
  const before = await p.store.profile(u.actor);
  expect((await request(u, '/journey/weekly/claim', { week: result.weekly.week })).statusCode).toBe(
    409,
  );
  await storedDuel(u, 'solo');
  await storedDuel(u, 'custom');
  expect((await view(u)).weekly.completed).toBe(5);
  expect(
    (await request(u, '/journey/weekly/claim', { week: result.weekly.week })).json().awarded,
  ).toBe(150);
  const after = await p.store.profile(u.actor);
  expect(after.prisms).toBe(before.prisms + 150);
  expect(after.inventory).toEqual(before.inventory);
});

it('rolls back a claim when the currency limit prevents payment, allowing a safe retry', async () => {
  const u = await user();
  await storedDuel(u, 'custom');
  await storedDuel(u, 'solo');
  await storedDuel(u, 'solo');
  await saveWeeklyDeck(u);
  await openWeeklyBoosters(u);
  await p.db.read((sql) =>
    sql('UPDATE profiles SET prisms=2147483647 WHERE id=$1', [u.profile.id]),
  );
  const week = weekWindow().week;
  const r = await request(u, '/journey/weekly/claim', { week });
  expect(r.statusCode).toBe(409);
  expect((await view(u)).weekly.claimed).toBe(false);
  await p.db.read((sql) => sql('UPDATE profiles SET prisms=0 WHERE id=$1', [u.profile.id]));
  expect((await request(u, '/journey/weekly/claim', { week })).json().awarded).toBe(150);
});
