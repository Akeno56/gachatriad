import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { resolve } from 'node:path';
import { createPlatform } from './app';
import { STANDARD, legalMoves, type GameState } from '@gacha-triad/engine';
let p: Awaited<ReturnType<typeof createPlatform>>,
  serial = 0;
beforeAll(async () => {
  vi.stubEnv('LOCAL_CONTROL_SECRET', 'isolated-v15-host-secret');
  p = await createPlatform(resolve('.'), { memory: true, timers: false });
  p.store.isOnline = () => true;
});
afterAll(async () => {
  await p.app.close();
  vi.unstubAllEnvs();
});
async function player() {
  const id = `spectator-test-${++serial}`,
    name = `Viewer ${serial}`;
  await p.db.read((sql) =>
    sql(
      'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt","isAnonymous") VALUES($1,$2,$3,false,now(),now(),false)',
      [id, name, `${id}@test.invalid`],
    ),
  );
  const actor = { id, name, isAnonymous: false },
    profile = await p.store.profile(actor);
  for (const pack of await p.store.economy.list(profile.id))
    await p.store.economy.open(profile.id, pack.id);
  await p.store.completeTutorial(profile.id);
  return p.store.profile(actor);
}
async function duel(rules = { ...STANDARD }) {
  const a = await player(),
    b = await player(),
    watcher = await player();
  const { lobbyId } = await p.store.createLobby(a, { mode: 'custom', rules, allowBots: false });
  const { matchId } = await p.store.joinLobby(b, lobbyId!);
  return { a, b, watcher, id: matchId!, lobbyId: lobbyId! };
}
async function raw(id: string) {
  return (
    await p.db.read((sql) =>
      sql<{ state: GameState; version: number }>('SELECT state,version FROM matches WHERE id=$1', [
        id,
      ]),
    )
  )[0];
}
async function play(id: string, a: string, b: string) {
  const row = await raw(id),
    move = legalMoves(row.state)[0];
  await p.store.move(row.state.turn === 0 ? a : b, id, move.cardId, move.cell, row.version);
}
async function timeout(id: string) {
  await p.db.read((sql) => sql('UPDATE matches SET deadline=$1 WHERE id=$2', [Date.now() - 1, id]));
  await p.store.tick();
}
it('auto-plays once after 60 seconds and forfeits the next missed turn of the same player', async () => {
  const { a, b, id } = await duel();
  const start = await p.store.view(a.id, id),
    seat = start.game!.turn;
  expect(start.deadline! - Date.now()).toBeGreaterThan(58000);
  await timeout(id);
  let view = await p.store.view(a.id, id);
  expect(view.status).toBe('playing');
  expect(view.game!.history).toHaveLength(1);
  expect(view.missedTurns?.[seat]).toBe(1);
  await play(id, a.id, b.id);
  await timeout(id);
  view = await p.store.view(a.id, id);
  expect(view.status).toBe('complete');
  expect(view.winner).toBe(1 - seat);
  expect(view.endReason).toBe('two consecutive missed turns');
  expect(view.game!.history).toHaveLength(2);
});
it('resets the missed-turn warning after a genuine manual move', async () => {
  const { a, b, id } = await duel();
  const seat = (await raw(id)).state.turn;
  await timeout(id);
  await play(id, a.id, b.id);
  await play(id, a.id, b.id);
  expect((await p.store.view(a.id, id)).missedTurns?.[seat]).toBe(0);
  await play(id, a.id, b.id);
  await timeout(id);
  expect((await p.store.view(a.id, id)).status).toBe('playing');
});
it('redacts both hands for spectators and never exposes private draft pools or settlement actions', async () => {
  for (const visibility of ['closed', 'threeOpen', 'allOpen']) {
    const { a, b, watcher, id } = await duel({
      ...STANDARD,
      threeOpen: visibility === 'threeOpen',
      allOpen: visibility === 'allOpen',
    });
    const view = await p.store.view(watcher.id, id, true);
    expect(view.spectator).toBe(true);
    expect(view.draftPool).toEqual([]);
    expect(view.trade.choices).toEqual([]);
    expect(view.trade.canClaim).toBe(false);
    expect(view.chatAvailable).toBe(false);
    expect(view.game!.hands.map((hand) => hand.filter((c) => c.card).length)).toEqual(
      visibility === 'closed' ? [0, 0] : visibility === 'threeOpen' ? [3, 3] : [5, 5],
    );
    expect('revealed' in view.game!).toBe(false);
    await expect(p.store.view(watcher.id, id)).rejects.toThrow(/private/);
    const state = await raw(id),
      move = legalMoves(state.state)[0];
    await expect(
      p.store.move(watcher.id, id, move.cardId, move.cell, state.version),
    ).rejects.toThrow(/private/);
    await expect(p.store.resign(watcher.id, id)).rejects.toThrow(/private/);
    await expect(p.social.battleMessages(watcher, id)).rejects.toThrow(/private/);
    await p.store.resign(a.id, id);
  }
});
it('keeps invitation-only matches private while allowing the host low-detail monitor', async () => {
  const { a, watcher, id, lobbyId } = await duel();
  await p.db.read((sql) =>
    sql('UPDATE lobbies SET invited_profile=$1 WHERE id=$2', [watcher.id, lobbyId]),
  );
  await expect(p.store.view(watcher.id, id, true)).rejects.toThrow(/spectators/);
  await p.db.read((sql) =>
    sql('UPDATE lobbies SET spectatable=false,invited_profile=NULL WHERE id=$1', [lobbyId]),
  );
  await expect(p.store.view(watcher.id, id, true)).rejects.toThrow(/spectators/);
  expect((await p.store.view('', id, true, true)).spectator).toBe(true);
  expect((await p.app.inject({ url: `/api/local-control/battle/${id}` })).statusCode).toBe(404);
  const result = await p.app.inject({
    url: `/api/local-control/battle/${id}`,
    headers: { 'x-local-control': 'isolated-v15-host-secret' },
  });
  expect(result.statusCode, result.body).toBe(200);
  expect(
    result.json().game.hands.every((h: { card: unknown }[]) => h.every((c) => c.card === null)),
  ).toBe(true);
  await p.store.resign(a.id, id);
});
it('does not expose either player draft pool to spectators', async () => {
  const a = await player(),
    b = await player(),
    watcher = await player();
  const { lobbyId } = await p.store.createLobby(a, { mode: 'draft', allowBots: false });
  const { matchId } = await p.store.joinLobby(b, lobbyId!);
  const view = await p.store.view(watcher.id, matchId!, true);
  expect(view.status).toBe('drafting');
  expect(view.game).toBeNull();
  expect(view.draftPool).toEqual([]);
  expect('pools' in view).toBe(false);
  expect('decks' in view).toBe(false);
  await p.store.resign(a.id, matchId!);
});
