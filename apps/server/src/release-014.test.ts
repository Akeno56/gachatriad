import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createPlatform } from './app';
import {
  legalMoves,
  applyMove,
  validateDeck,
  winner,
  randomDeck,
  seededRandom,
} from '@gacha-triad/engine';
import { DailyPuzzles, makePuzzle, puzzleValue, puzzleDay } from './daily-puzzle';
let p: Awaited<ReturnType<typeof createPlatform>>,
  serial = 0;
beforeAll(async () => {
  p = await createPlatform(resolve('.'), { memory: true, timers: false });
  await p.bots.set(false);
  p.store.isOnline = () => true;
});
afterAll(async () => {
  await p?.app.close();
});
async function account(open = true) {
  const n = ++serial;
  const response = await p.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    remoteAddress: `198.19.14.${n}`,
    payload: {
      name: `Release fourteen ${n}`,
      email: `fourteen-${n}@test.invalid`,
      password: 'release-fourteen-password',
    },
  });
  expect(response.statusCode, response.body).toBe(200);
  const actor = { ...response.json().user, isAnonymous: false },
    token = String(response.headers['set-auth-token']);
  let profile = await p.store.profile(actor);
  if (open) {
    for (const pack of await p.store.economy.list(profile.id))
      await p.store.economy.open(profile.id, pack.id);
  }
  await p.store.completeTutorial(profile.id);
  profile = await p.store.profile(actor);
  return { actor, profile, token, ip: `198.19.14.${n}` };
}
async function readyDraft(
  a: Awaited<ReturnType<typeof account>>,
  b: Awaited<ReturnType<typeof account>>,
) {
  await p.store.createLobby(a.profile, { mode: 'shared-draft' });
  const { matchId } = await p.store.createLobby(b.profile, { mode: 'shared-draft' });
  const id = matchId!;
  for (const person of [a, b])
    for (let step = 0; step < 20; step++) await p.store.revealDraft(person.profile.id, id, step);
  return id;
}
it('makes deterministic uniquely winning endgames with valid real cards', () => {
  for (const seed of [1, 42, 20261116]) {
    const a = makePuzzle(seed),
      b = makePuzzle(seed);
    expect(a).toEqual(b);
    expect(a.history).toHaveLength(6);
    expect(a.turn).toBe(0);
    expect(legalMoves(a).filter((move) => puzzleValue(applyMove(a, move)) > 5)).toHaveLength(1);
  }
});
it('keeps new Ranked losses free of card transfers and allows immediate requeue', async () => {
  const a = await account(),
    b = await account();
  const before = await p.store.profile(b.actor);
  await p.store.createLobby(a.profile, { mode: 'ranked', tradeRule: 'one' });
  const { matchId } = await p.store.createLobby(b.profile, { mode: 'ranked' });
  await p.store.resign(b.profile.id, matchId!);
  const view = await p.store.view(b.profile.id, matchId!);
  expect(view.trade.rule).toBe('none');
  expect(view.trade.pending).toBe(false);
  const after = await p.store.profile(b.actor);
  expect(after.deck).toEqual(before.deck);
  expect(after.inventory).toEqual(before.inventory);
  expect(after.pendingTrade).toBeNull();
  const queued = await p.store.createLobby(after, { mode: 'ranked' });
  expect(queued.lobbyId).toBeTruthy();
  await p.store.cancelLobby(after.id, queued.lobbyId!);
});
it('migrates active Ranked stakes while preserving already pending legacy settlements', async () => {
  const a = await account(),
    b = await account(),
    c = await account(),
    d = await account();
  await p.store.createLobby(a.profile, { mode: 'ranked' });
  const legacy = await p.store.createLobby(b.profile, { mode: 'ranked' });
  await p.db.read((sql) =>
    sql("UPDATE matches SET trade_rule='one' WHERE id=$1", [legacy.matchId]),
  );
  await p.store.resign(b.profile.id, legacy.matchId!);
  expect((await p.store.view(a.profile.id, legacy.matchId!)).trade.pending).toBe(true);
  await p.store.createLobby(c.profile, { mode: 'ranked' });
  const active = await p.store.createLobby(d.profile, { mode: 'ranked' });
  await p.db.read((sql) =>
    sql("UPDATE matches SET trade_rule='one' WHERE id=$1", [active.matchId]),
  );
  await p.db.exec(
    await readFile(resolve('apps/server/migrations/019_shared_draft_daily_puzzle.sql'), 'utf8'),
  );
  const pending = await p.store.view(a.profile.id, legacy.matchId!);
  expect(pending.trade.rule).toBe('one');
  expect(pending.trade.pending).toBe(true);
  expect((await p.store.view(c.profile.id, active.matchId!)).trade.rule).toBe('none');
  await p.store.resign(d.profile.id, active.matchId!);
  expect((await p.store.profile(d.actor)).inventory).toEqual(d.profile.inventory);
  const reserved = await p.db.read((sql) =>
    sql<{ n: number }>(
      'SELECT coalesce(sum(reserved),0)::int AS n FROM inventory WHERE profile_id=$1 OR profile_id=$2',
      [c.profile.id, d.profile.id],
    ),
  );
  expect(reserved[0].n).toBe(0);
  await p.store.claimCard(a.profile.id, legacy.matchId!, pending.trade.choices[0].id);
  expect((await p.store.view(a.profile.id, legacy.matchId!)).trade.pending).toBe(false);
});
it('shares exactly four boosters, enforces turns, versions and rarity caps, and starts with the second picker', async () => {
  const a = await account(false),
    b = await account(false);
  const id = await readyDraft(a, b);
  let view = await p.store.view(a.profile.id, id);
  const other = await p.store.view(b.profile.id, id);
  expect(view.draftPool).toHaveLength(20);
  expect(other.draftPool).toEqual(view.draftPool);
  expect(view.draftPool.filter((c) => c.rarity <= 3).length).toBeGreaterThanOrEqual(10);
  expect(view.rules.allOpen).toBe(true);
  expect(view.sharedDraft!.available).toHaveLength(20);
  await expect(
    p.store.lockDraft(
      a.profile.id,
      id,
      view.draftPool.slice(0, 5).map((c) => c.id),
    ),
  ).rejects.toThrow('Pick cards in turn');
  const first = view.sharedDraft!.first;
  for (let n = 0; n < 10; n++) {
    const seat = view.sharedDraft!.turn!,
      person = seat === 0 ? a : b,
      opponent = seat === 0 ? b : a;
    const ownView = await p.store.view(person.profile.id, id),
      pick = ownView.sharedDraft!.legal[0];
    await expect(p.store.pickDraft(opponent.profile.id, id, pick, ownView.version)).rejects.toThrow(
      'Wait for your drafting turn',
    );
    await expect(
      p.store.pickDraft(person.profile.id, id, pick, ownView.version - 1),
    ).rejects.toThrow('draft has changed');
    if (n === 0) {
      const raced = await Promise.allSettled([
        p.store.pickDraft(person.profile.id, id, pick, ownView.version),
        p.store.pickDraft(person.profile.id, id, pick, ownView.version),
      ]);
      expect(raced.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    } else await p.store.pickDraft(person.profile.id, id, pick, ownView.version);
    view = await p.store.view(a.profile.id, id);
    if (n < 9) expect(view.sharedDraft!.available).not.toContain(pick);
  }
  expect(view.status).toBe('playing');
  expect(view.game!.firstPlayer).toBe(1 - first);
  for (const hand of view.game!.hands) expect(validateDeck(hand.map((c) => c.card!))).toEqual([]);
  expect((await p.store.profile(a.actor)).inventory).toEqual({});
});
it('validates shared Draft ownership, unopened pools and timeout picks', async () => {
  const a = await account(false),
    b = await account(false),
    intruder = await account(false);
  await p.store.createLobby(a.profile, { mode: 'shared-draft' });
  const { matchId } = await p.store.createLobby(b.profile, { mode: 'shared-draft' });
  const id = matchId!;
  let m = await p.store.view(a.profile.id, id);
  await expect(
    p.store.pickDraft(intruder.profile.id, id, m.draftPool[0].id, m.version),
  ).rejects.toThrow('private');
  await expect(p.store.pickDraft(a.profile.id, id, m.draftPool[0].id, m.version)).rejects.toThrow(
    'finish opening',
  );
  for (const person of [a, b])
    for (let step = 0; step < 20; step++) await p.store.revealDraft(person.profile.id, id, step);
  const initial = (await p.store.view(a.profile.id, id)).sharedDraft!.first;
  await p.db.read((sql) => sql('UPDATE matches SET deadline=$1 WHERE id=$2', [Date.now() - 1, id]));
  await p.store.tick();
  m = await p.store.view(a.profile.id, id);
  expect(m.sharedDraft!.picks[initial]).toHaveLength(1);
  expect(m.sharedDraft!.turn).toBe(1 - initial);
  const other = initial === 0 ? b : a;
  const next = await p.store.view(other.profile.id, id);
  await p.store.pickDraft(other.profile.id, id, next.sharedDraft!.legal[0], next.version);
  await p.db.read((sql) => sql('UPDATE matches SET deadline=$1 WHERE id=$2', [Date.now() - 1, id]));
  await p.store.tick();
  expect((await p.store.view(a.profile.id, id)).endReason).toBe(
    'two consecutive missed draft picks',
  );
});
it('preserves private Draft and keeps all three human Elo ladders independent', async () => {
  const a = await account(false),
    b = await account(false);
  await p.db.read((sql) =>
    sql('UPDATE profiles SET draft_rating=1200 WHERE id=$1', [a.profile.id]),
  );
  await p.store.createLobby(a.profile, { mode: 'draft' });
  const { matchId } = await p.store.createLobby(b.profile, { mode: 'draft' });
  for (const person of [a, b]) {
    const view = await p.store.view(person.profile.id, matchId!);
    expect(view.draftPool).toHaveLength(15);
    expect(view.sharedDraft).toBeUndefined();
    expect(view.rules.threeOpen).toBe(true);
    for (let step = 0; step < 15; step++)
      await p.store.revealDraft(person.profile.id, matchId!, step);
    await p.store.lockDraft(
      person.profile.id,
      matchId!,
      randomDeck(view.draftPool, seededRandom(9)).map((c) => c.id),
    );
  }
  expect((await p.store.view(a.profile.id, matchId!)).status).toBe('playing');
  await p.store.resign(b.profile.id, matchId!);
  const afterDraft = await p.store.profile(a.actor);
  expect(afterDraft.draftRating).toBeGreaterThan(1200);
  expect(afterDraft.sharedDraftRating).toBe(1000);
  expect(afterDraft.rating).toBe(1000);
  const id = await readyDraft(a, b);
  await p.store.resign(b.profile.id, id);
  const afterShared = await p.store.profile(a.actor);
  expect(afterShared.sharedDraftRating).toBeGreaterThan(1000);
  expect(afterShared.draftRating).toBe(afterDraft.draftRating);
  expect(afterShared.rating).toBe(1000);
  const regular = (await p.social.ladder('draft')).find((e) => e.id === a.profile.id)!;
  const shared = (await p.social.ladder('shared-draft')).find((e) => e.id === a.profile.id)!;
  expect(regular.rating).toBe(afterDraft.draftRating);
  expect(shared.rating).toBe(afterShared.sharedDraftRating);
  expect(regular.games).toBe(1);
  expect(shared.games).toBe(1);
  expect((await p.social.ladder('ranked')).some((e) => e.id === a.profile.id)).toBe(false);
});
it('allows explicit Shared Draft bot practice without Elo or ranked leaderboard results', async () => {
  const human = await account(false),
    bot = await account(false);
  await p.db.read((sql) =>
    sql("UPDATE profiles SET is_bot=true,bot_difficulty='medium' WHERE id=$1", [bot.profile.id]),
  );
  const lobby = await p.store.createLobby(human.profile, { mode: 'shared-draft', allowBots: true });
  const [queued] = await p.db.read((sql) =>
    sql<{ allow_bots: boolean }>('SELECT allow_bots FROM lobbies WHERE id=$1', [lobby.lobbyId]),
  );
  expect(queued.allow_bots).toBe(false);
  await p.store.enablePractice(human.profile.id, lobby.lobbyId!);
  const { matchId } = await p.store.createLobby(bot.profile, { mode: 'shared-draft' });
  expect(matchId).toBeTruthy();
  await p.store.resign(bot.profile.id, matchId!);
  const view = await p.store.view(human.profile.id, matchId!);
  expect(view.ratingApplies).toBe(false);
  expect((await p.store.profile(human.actor)).sharedDraftRating).toBe(1000);
  expect((await p.social.ladder('shared-draft')).some((e) => e.id === human.profile.id)).toBe(
    false,
  );
});
it('lets the populated-bot policy open and pick a legal Shared Draft hand', async () => {
  const human = await account(false),
    bot = await account(false);
  await p.db.read((sql) =>
    sql("UPDATE profiles SET is_bot=true,bot_difficulty='medium' WHERE id=$1", [bot.profile.id]),
  );
  const lobby = await p.store.createLobby(human.profile, { mode: 'shared-draft' });
  await p.store.enablePractice(human.profile.id, lobby.lobbyId!);
  const { matchId } = await p.store.createLobby(bot.profile, { mode: 'shared-draft' });
  for (let step = 0; step < 20; step++) await p.store.revealDraft(human.profile.id, matchId!, step);
  let time = Date.now();
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => time);
  try {
    for (let step = 0; step < 11; step++) {
      time += 4000;
      await p.bots.tick();
      const view = await p.store.view(human.profile.id, matchId!);
      if (view.status === 'playing') break;
      if (view.sharedDraft?.turn === view.seat)
        await p.store.pickDraft(
          human.profile.id,
          matchId!,
          view.sharedDraft.legal[0],
          view.version,
        );
    }
    const view = await p.store.view(human.profile.id, matchId!);
    expect(view.status).toBe('playing');
    for (const hand of view.game!.hands) expect(validateDeck(hand.map((c) => c.card!))).toEqual([]);
    expect(view.ratingApplies).toBe(false);
  } finally {
    clock.mockRestore();
  }
});
it('validates puzzle moves, pays exactly once per account/day and freezes the first solve ranking', async () => {
  const a = await account();
  const before = await p.store.profile(a.actor),
    day = puzzleDay();
  const preview = await p.puzzles.view(a.profile.id, true, a.actor.id);
  expect(preview.state).toBeNull();
  let m = await p.puzzles.start(
    a.profile.id,
    true,
    { day, requestId: 'puzzle-start-1' },
    a.actor.id,
  );
  await expect(
    p.puzzles.move(a.profile.id, true, { day, version: 999, cardId: 'fake', cell: 0 }, a.actor.id),
  ).rejects.toThrow('changed');
  while (m.state?.status === 'playing') {
    const choices = legalMoves(m.state)
      .map((move) => ({ move, value: puzzleValue(applyMove(m.state!, move)) }))
      .sort((a, b) => b.value - a.value);
    const move = choices[0].move;
    m = await p.puzzles.move(
      a.profile.id,
      true,
      { day, version: m.version, cardId: move.cardId, cell: move.cell },
      a.actor.id,
    );
  }
  expect(winner(m.state!)).toBe(0);
  expect(m.rewarded).toBe(true);
  expect(m.leaderboard[0].playerId).toBe(a.profile.id);
  const solved = m.leaderboard.find((e) => e.playerId === a.profile.id)!;
  await Promise.all([
    p.puzzles.claim(a.profile.id, true, { day }, a.actor.id),
    p.puzzles.claim(a.profile.id, true, { day }, a.actor.id),
  ]);
  const after = await p.store.profile(a.actor);
  expect(after.prisms - before.prisms).toBe(100);
  expect(after.inventory).toEqual(before.inventory);
  expect(after.rating).toBe(before.rating);
  await p.puzzles.start(
    a.profile.id,
    true,
    { day, restart: true, requestId: 'puzzle-practice' },
    a.actor.id,
  );
  const practiced = await p.puzzles.view(a.profile.id, true, a.actor.id);
  expect(practiced.leaderboard.find((e) => e.playerId === a.profile.id)).toEqual(solved);
  await expect(
    p.puzzles.move(a.profile.id, true, { day: '2000-01-01' }, a.actor.id),
  ).rejects.toThrow('reset');
});
it('cannot claim rewards by posting a result, and retries are idempotent', async () => {
  const a = await account(),
    day = puzzleDay();
  const m = await p.puzzles.start(
    a.profile.id,
    true,
    { day, requestId: 'attempt-start' },
    a.actor.id,
  );
  await p.puzzles.claim(a.profile.id, true, { day, solved: true }, a.actor.id);
  expect((await p.store.profile(a.actor)).prisms).toBe(0);
  const r1 = await p.puzzles.start(
    a.profile.id,
    true,
    { day, restart: true, requestId: 'attempt-retry' },
    a.actor.id,
  );
  const r2 = await p.puzzles.start(
    a.profile.id,
    true,
    { day, restart: true, requestId: 'attempt-retry' },
    a.actor.id,
  );
  expect(r1.attempts).toBe(m.attempts + 1);
  expect(r2.attempts).toBe(r1.attempts);
  await expect(p.puzzles.claim(a.profile.id, false, { day }, a.actor.id)).rejects.toThrow(
    'Register',
  );
});
it('binds puzzle actions to the authenticated profile and ignores forged account and reward fields', async () => {
  const a = await account(false),
    b = await account(false),
    day = puzzleDay();
  const headers = { authorization: `Bearer ${a.token}` };
  const forged = await p.app.inject({
    method: 'POST',
    url: '/api/puzzles/daily/start',
    remoteAddress: a.ip,
    headers: { ...headers, 'x-profile-id': b.profile.id },
    payload: { day, requestId: 'forged-owner-1' },
  });
  expect(forged.statusCode).toBe(403);
  const started = await p.app.inject({
    method: 'POST',
    url: '/api/puzzles/daily/start',
    remoteAddress: a.ip,
    headers,
    payload: {
      day,
      requestId: 'genuine-start-1',
      profileId: b.profile.id,
      accountId: b.actor.id,
      solved: true,
    },
  });
  expect(started.statusCode, started.body).toBe(200);
  const claim = await p.app.inject({
    method: 'POST',
    url: '/api/puzzles/daily/claim',
    remoteAddress: a.ip,
    headers,
    payload: { day, solved: true, reward: 999999, accountId: b.actor.id },
  });
  expect(claim.statusCode).toBe(200);
  expect(claim.json().rewarded).toBe(false);
  expect((await p.store.profile(a.actor)).prisms).toBe(0);
  expect((await p.puzzles.view(b.profile.id, true, b.actor.id)).state).toBeNull();
});
it('persists the daily board and prevents duplicate rewards across profiles of one account', async () => {
  const a = await account(false),
    b = await account(false),
    day = puzzleDay();
  const first = await p.puzzles.start(
    a.profile.id,
    true,
    { day, requestId: 'first-daily-board' },
    a.actor.id,
  );
  const restored = await new DailyPuzzles(p.db, 'different-secret-after-restart').start(
    b.profile.id,
    true,
    { day, requestId: 'second-daily-board' },
    a.actor.id,
  );
  expect(restored.state).toEqual(first.state);
  for (const person of [a, b]) {
    let view = await p.puzzles.view(person.profile.id, true, a.actor.id);
    while (view.state!.status === 'playing') {
      const choice = legalMoves(view.state!).sort(
        (x, y) => puzzleValue(applyMove(view.state!, y)) - puzzleValue(applyMove(view.state!, x)),
      )[0];
      view = await p.puzzles.move(
        person.profile.id,
        true,
        { day, version: view.version, cardId: choice.cardId, cell: choice.cell },
        a.actor.id,
      );
    }
  }
  expect((await p.store.profile(a.actor)).prisms).toBe(100);
  expect((await p.store.profile(b.actor)).prisms).toBe(0);
  const ranked = await p.puzzles.view(b.profile.id, true, a.actor.id);
  expect(ranked.rewarded).toBe(true);
  expect(ranked.leaderboard.some((e) => e.playerId === b.profile.id)).toBe(false);
  expect(puzzleDay(Date.parse('2026-11-16T23:59:59.999Z'))).toBe('2026-11-16');
  expect(puzzleDay(Date.parse('2026-11-17T00:00:00.000Z'))).toBe('2026-11-17');
});
