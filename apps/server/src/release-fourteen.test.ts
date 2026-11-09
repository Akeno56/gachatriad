import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { resolve } from 'node:path';
import { createPlatform } from './app';
import { legalMoves, type GameState } from '@gacha-triad/engine';
import { distributeBots, validateMix } from './bot-difficulty';
import type { ProfileView } from '@gacha-triad/shared/platform';
let p: Awaited<ReturnType<typeof createPlatform>>;
beforeAll(async () => {
  p = await createPlatform(resolve('.'), { memory: true, timers: false });
  p.store.isOnline = () => true;
});
afterAll(async () => {
  vi.restoreAllMocks();
  await p.app.close();
});
let serial = 0;
async function player(registered = true) {
  const n = ++serial,
    id = `release-fourteen-${n}`;
  await p.db.read((sql) =>
    sql(
      'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt","isAnonymous") VALUES($1,$2,$3,false,now(),now(),$4)',
      [id, `Player ${n}`, `${id}@test.invalid`, !registered],
    ),
  );
  const actor = { id, name: `Player ${n}`, isAnonymous: !registered };
  let profile = await p.store.profile(actor);
  for (const pack of await p.store.economy.list(profile.id))
    await p.store.economy.open(profile.id, pack.id);
  await p.store.completeTutorial(profile.id);
  await p.store.acknowledgeRanked(profile.id);
  profile = await p.store.profile(actor);
  return { actor, profile };
}
async function duel(mode: 'custom' | 'ranked' | 'draft' = 'custom') {
  const a = await player(),
    b = await player();
  const lobby = await p.store.createLobby(a.profile, { mode, allowBots: false });
  const match = await p.store.joinLobby(b.profile, lobby.lobbyId!);
  return { a, b, id: match.matchId! };
}
async function ageDisconnect(id: string, seat: number, ms: number) {
  await p.db.read((sql) =>
    sql(
      'UPDATE matches SET disconnected_at=jsonb_set(disconnected_at,$1::text[],to_jsonb($2::bigint)) WHERE id=$3',
      [[String(seat)], Date.now() - ms, id],
    ),
  );
}
it('forfeits a disconnected opponent at 120s even when it is not their turn and settles once', async () => {
  const { a, b, id } = await duel('ranked');
  const m = await p.store.view(a.profile.id, id),
    absent = m.game!.turn === 0 ? b : a,
    seat = m.game!.turn === 0 ? 1 : 0;
  await p.store.presence(absent.profile.id, false);
  await ageDisconnect(id, seat, 119000);
  await p.store.tick();
  expect((await p.store.view(a.profile.id, id)).status).toBe('playing');
  await ageDisconnect(id, seat, 120001);
  await p.store.tick();
  const done = await p.store.view(a.profile.id, id);
  expect(done.winner).toBe(1 - seat);
  expect(done.endReason).toMatch(/disconnected/);
  expect(done.trade.pending).toBe(true);
  const before = await p.store.profile(a.actor);
  await p.store.tick();
  expect((await p.store.profile(a.actor)).played).toBe(before.played);
  await p.store.claimCard(
    done.winner === 0 ? a.profile.id : b.profile.id,
    id,
    done.trade.choices[0].id,
  );
  expect((await p.store.view(a.profile.id, id)).trade.pending).toBe(false);
});
it('allows reconnect before expiry but does not let a late reconnect or move avoid forfeiture', async () => {
  const { a, b, id } = await duel();
  await p.store.presence(b.profile.id, false);
  await ageDisconnect(id, 1, 60000);
  await p.store.presence(b.profile.id, true);
  expect(
    (
      await p.db.read((sql) =>
        sql<{ disconnected_at: unknown }>('SELECT disconnected_at FROM matches WHERE id=$1', [id]),
      )
    )[0].disconnected_at,
  ).toEqual([null, null]);
  await ageDisconnect(id, 1, 120001);
  await p.store.presence(b.profile.id, true);
  expect((await p.store.view(a.profile.id, id)).winner).toBe(0);
  const next = await duel();
  const view = await p.store.view(next.a.profile.id, next.id);
  await p.db.read((sql) =>
    sql('UPDATE matches SET deadline=$1 WHERE id=$2', [Date.now() - 1, next.id]),
  );
  const move = legalMoves(view.game as unknown as GameState)[0];
  const own = view.game!.turn === 0 ? next.a : next.b;
  await p.store.move(own.profile.id, next.id, move.cardId, move.cell, view.version);
  const done = await p.store.view(next.a.profile.id, next.id);
  expect(done.status).toBe('complete');
  expect(done.game!.history).toHaveLength(0);
  expect(done.endReason).toMatch(/inactive/);
});
it('times out connected AFK players and abandoned drafts while keeping bots exempt', async () => {
  const { a, id } = await duel();
  const view = await p.store.view(a.profile.id, id);
  expect(view.deadline! - Date.now()).toBeGreaterThan(118000);
  await p.db.read((sql) => sql('UPDATE matches SET deadline=$1 WHERE id=$2', [Date.now() - 1, id]));
  await p.store.tick();
  const done = await p.store.view(a.profile.id, id);
  expect(done.winner).toBe(1 - view.game!.turn);
  expect(done.game!.history).toHaveLength(0);
  const draft = await duel('draft');
  await p.db.read((sql) =>
    sql('UPDATE matches SET activity_at=$1::jsonb WHERE id=$2', [
      JSON.stringify([Date.now() - 120001, Date.now()]),
      draft.id,
    ]),
  );
  await p.store.tick();
  expect((await p.store.view(draft.a.profile.id, draft.id)).winner).toBe(1);
});
it('repopulates 30 persistent bots with a validated saved mix and per-bot Ranked eligibility', async () => {
  expect(() => validateMix({ easy: 45, medium: 25, hard: 20 })).toThrow(/100/);
  expect(() => validateMix({ easy: -1, medium: 101, hard: 0 })).toThrow();
  expect(distributeBots({ easy: 45, medium: 25, hard: 30 })).toHaveLength(30);
  const status = await p.bots.set(true, undefined, { easy: 45, medium: 25, hard: 30 });
  expect(status.bots).toBe(30);
  expect(status.counts).toEqual({ easy: 14, medium: 7, hard: 9 });
  await p.bots.set(true);
  expect((await p.bots.status()).mix).toEqual(status.mix);
  const [easy] = await p.db.read((sql) =>
    sql<{ id: string; name: string }>(
      'SELECT u.id,u.name FROM "user" u JOIN profile_accounts a ON a.auth_user_id=u.id JOIN profiles p ON p.id=a.profile_id WHERE p.is_bot AND bot_difficulty=\'easy\' LIMIT 1',
    ),
  );
  const profile = await p.store.profile({ ...easy, isAnonymous: false });
  await expect(p.store.createLobby(profile, { mode: 'ranked' })).rejects.toThrow(/Medium and Hard/);
  await p.bots.set(false);
});
it('never changes either participant Elo or ladder qualification for bot Ranked and Draft results', async () => {
  for (const mode of ['ranked', 'draft'] as const) {
    const { a, b, id } = await duel(mode);
    await p.db.read((sql) => sql('UPDATE profiles SET is_bot=true WHERE id=$1', [b.profile.id]));
    await p.store.resign(b.profile.id, id);
    const aa = await p.store.profile(a.actor),
      bb = await p.store.profile(b.actor);
    expect(aa.rating).toBe(1000);
    expect(aa.draftRating).toBe(1000);
    expect(bb.rating).toBe(1000);
    expect(bb.draftRating).toBe(1000);
    expect((await p.social.ladder(mode)).some((entry) => entry.id === a.profile.id)).toBe(false);
    expect((await p.store.view(a.profile.id, id)).ratingApplies).toBe(false);
  }
});
it('moderates all public channels, private messages and battle chat, with persistent mutes and expiry', async () => {
  const { a, b, id } = await duel();
  await p.social.friend(a.profile, b.profile.id, 'request');
  await p.social.friend(b.profile, a.profile.id, 'accept');
  await expect(p.social.post(a.profile, 'fuck!', 'blocked-general', 'general')).rejects.toThrow(
    /blocked/,
  );
  await expect(p.social.post(a.profile, 'enculé', 'blocked-trade', 'trade')).rejects.toThrow(
    /blocked/,
  );
  await expect(
    p.social.postFriend(a.profile, b.profile.id, 'connard', 'blocked-private'),
  ).rejects.toThrow(/10 minutes/);
  await expect(p.social.postBattle(a.profile, id, 'Good game!', 'muted-battle')).rejects.toThrow(
    /10 minutes/,
  );
  expect(await p.social.battleMessages(a.profile, id)).toEqual([]);
  const filter = new (await import('./chat-filter')).ChatFilter(p.db);
  await expect(filter.check(a.profile.id, 'Bonjour')).rejects.toThrow(/10 minutes/);
  await p.db.read((sql) =>
    sql('UPDATE chat_moderation_state SET muted_until=0,window_started=$1 WHERE profile_id=$2', [
      Date.now() - 600001,
      a.profile.id,
    ]),
  );
  await p.social.postBattle(a.profile, id, 'Bien joué !', 'allowed-battle');
  const outsider = await player();
  await expect(p.social.battleMessages(outsider.profile, id)).rejects.toThrow(/private/);
  const messages = await p.social.battleMessages(b.profile, id);
  expect(messages[0].body).toBe('Bien joué !');
  await expect(
    p.social.postBattle(a.profile, id, 'Bien joué !', 'allowed-battle'),
  ).resolves.toEqual({ id: messages[0].id });
  await expect(p.social.postBattle(a.profile, id, 'Other text', 'allowed-battle')).rejects.toThrow(
    /another message/,
  );
  const [row] = await p.db.read((sql) =>
    sql<{ n: number }>(
      "SELECT count(*)::int n FROM moderation_log WHERE action LIKE 'auto-chat-%'",
    ),
  );
  expect(row.n).toBeGreaterThanOrEqual(3);
});
it('blocks repeated spam across channels without blocking normal conversation', async () => {
  const a = await player();
  for (let n = 0; n < 2; n++) {
    await p.social.post(
      a.profile,
      'Selling a card',
      `repeat-test-${n}`,
      n === 0 ? 'general' : 'trade',
    );
    await p.db.read((sql) =>
      sql("UPDATE chat_messages SET created_at=now()-interval '4 seconds' WHERE profile_id=$1", [
        a.profile.id,
      ]),
    );
  }
  await expect(
    p.social.post(a.profile, 'Selling a card', 'repeat-test-3', 'lobbies'),
  ).rejects.toThrow(/blocked/);
  await expect(
    p.social.post(a.profile, 'Anyone for a duel?', 'conversation-ok', 'lobbies'),
  ).resolves.toHaveProperty('id');
});
it('preserves disconnect clocks through recovery instead of granting a new grace period', async () => {
  const { a, b, id } = await duel();
  await p.store.presence(b.profile.id, false);
  await ageDisconnect(id, 1, 60000);
  const read = async () =>
    (
      await p.db.read((sql) =>
        sql<{ disconnected_at: [number | null, number | null] }>(
          'SELECT disconnected_at FROM matches WHERE id=$1',
          [id],
        ),
      )
    )[0].disconnected_at;
  const before = await read();
  await p.store.recoverPresence();
  expect((await read())[1]).toBe(before[1]);
  await ageDisconnect(id, 1, 120001);
  await p.store.recoverPresence();
  expect((await p.store.view(a.profile.id, id)).winner).toBe(0);
});
it('allows guests to chat only with their human opponent while keeping public chat registered-only', async () => {
  const a = await player(false),
    b = await player(false),
    outsider = await player(false);
  const lobby = await p.store.createLobby(a.profile, { mode: 'custom', allowBots: false });
  const { matchId } = await p.store.joinLobby(b.profile, lobby.lobbyId!);
  await p.social.postBattle(a.profile, matchId!, 'Hello opponent', 'guest-battle-message');
  expect((await p.social.battleMessages(b.profile, matchId!))[0].body).toBe('Hello opponent');
  await expect(p.social.post(a.profile, 'Hello public', 'guest-public-message')).rejects.toThrow(
    /Register/,
  );
  await expect(
    p.social.postBattle(outsider.profile, matchId!, 'Hello', 'outsider-private-message'),
  ).rejects.toThrow(/private/);
  await p.store.resign(a.profile.id, matchId!);
});
it('keeps Elo unchanged after a full nine-move bot duel, while still paying normal currency', async () => {
  const { a, b, id } = await duel('ranked');
  await p.db.read((sql) => sql('UPDATE profiles SET is_bot=true WHERE id=$1', [b.profile.id]));
  for (let n = 0; n < 9; n++) {
    const [row] = await p.db.read((sql) =>
      sql<{ state: GameState; version: number }>('SELECT state,version FROM matches WHERE id=$1', [
        id,
      ]),
    );
    const move = legalMoves(row.state)[0];
    await p.store.move(
      move.player === 0 ? a.profile.id : b.profile.id,
      id,
      move.cardId,
      move.cell,
      row.version,
    );
  }
  const done = await p.store.view(a.profile.id, id);
  expect(done.status).toBe('complete');
  expect(done.prismReward).toBeGreaterThan(0);
  expect((await p.store.profile(a.actor)).rating).toBe(1000);
  expect((await p.store.profile(b.actor)).rating).toBe(1000);
});
it('recognizes a valid HTTP move as activity during a temporary socket outage', async () => {
  const { a, b, id } = await duel();
  const [row] = await p.db.read((sql) =>
    sql<{ state: GameState; version: number }>('SELECT state,version FROM matches WHERE id=$1', [
      id,
    ]),
  );
  const move = legalMoves(row.state)[0],
    current = move.player === 0 ? a : b;
  p.store.isOnline = (id) => id !== current.profile.id;
  try {
    await p.store.presence(current.profile.id, false);
    await ageDisconnect(id, move.player, 90000);
    await p.store.move(current.profile.id, id, move.cardId, move.cell, row.version);
    const [after] = await p.db.read((sql) =>
      sql<{ disconnected_at: [number, number] }>(
        'SELECT disconnected_at FROM matches WHERE id=$1',
        [id],
      ),
    );
    expect(after.disconnected_at[move.player]).toBeGreaterThan(Date.now() - 1000);
    expect((await p.store.view(a.profile.id, id)).status).toBe('playing');
    await p.store.resign(a.profile.id, id);
  } finally {
    p.store.isOnline = () => true;
  }
});
