import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { resolve } from 'node:path';
import { createPlatform } from './app';
import { STANDARD } from '@gacha-triad/engine';
let p: Awaited<ReturnType<typeof createPlatform>>,
  serial = 0;
beforeAll(async () => {
  vi.stubEnv('LOCAL_CONTROL_SECRET', 'alpha-isolated-secret');
  vi.stubEnv('ALLOW_SHARED_TEST_NETWORK', 'false');
  p = await createPlatform(resolve('.'), { memory: true, timers: false });
  p.store.isOnline = () => true;
});
afterAll(async () => {
  await p.app.close();
  vi.unstubAllEnvs();
});
async function signup(ip: string, extra: Record<string, string> = {}) {
  const n = ++serial;
  return p.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    remoteAddress: ip,
    headers: { origin: 'http://127.0.0.1:3000', ...extra },
    payload: {
      name: `Alpha ${n}`,
      email: `alpha-${n}@test.invalid`,
      password: 'alpha-security-password-123',
    },
  });
}
async function account(ip: string) {
  const r = await signup(ip);
  expect(r.statusCode, r.body).toBe(200);
  const token = String(r.headers['set-auth-token']),
    user = r.json().user;
  const actor = { id: user.id, name: user.name, isAnonymous: false };
  let profile = await p.store.profile(actor);
  for (const pack of await p.store.economy.list(profile.id))
    await p.store.economy.open(profile.id, pack.id);
  await p.store.completeTutorial(profile.id);
  await p.store.acknowledgeRanked(profile.id);
  profile = await p.store.profile(actor);
  return { token, actor, profile, ip };
}
it('enforces one account per IP atomically and ignores forged client IP headers', async () => {
  const results = await Promise.all([signup('198.51.100.10'), signup('198.51.100.10')]);
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 403]);
  expect(
    (
      await signup('198.51.100.10', {
        'x-forwarded-for': '203.0.113.5',
        'x-gacha-client-ip': '203.0.113.6',
      })
    ).statusCode,
  ).toBe(403);
  expect((await signup('2001:db8:1234::1')).statusCode).toBe(200);
  expect((await signup('2001:db8:1234::abcd')).statusCode).toBe(403);
  await p.security.action('198.51.100.10', 'allow-shared', 'Household exception');
  expect((await signup('198.51.100.10')).statusCode).toBe(200);
  await p.security.action('198.51.100.10', 'restrict-shared', '');
  expect((await signup('198.51.100.10')).statusCode).toBe(403);
});
it('blocks IPs for accounts and guests, and keeps network controls private', async () => {
  const a = await account('198.51.100.11');
  await p.security.action(a.ip, 'block', 'Test restriction');
  const headers = { authorization: `Bearer ${a.token}` };
  expect(
    (await p.app.inject({ url: '/api/profile', remoteAddress: a.ip, headers })).statusCode,
  ).toBe(403);
  expect(
    (
      await p.app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/anonymous',
        remoteAddress: a.ip,
        payload: {},
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await p.app.inject({
        method: 'POST',
        url: '/api/local-control/network',
        remoteAddress: '198.51.100.12',
        payload: { network: a.ip, action: 'unblock' },
      })
    ).statusCode,
  ).toBe(404);
  await p.security.action(a.ip, 'unblock', '');
  expect(
    (await p.app.inject({ url: '/api/profile', remoteAddress: a.ip, headers })).statusCode,
  ).toBe(200);
});
it('hides rated tables, rejects direct joins, blocks same-network rated pairing and disables rematches', async () => {
  const a = await account('198.51.100.20'),
    b = await account('198.51.100.21');
  const lobby = await p.store.createLobby(a.profile, { mode: 'ranked', allowBots: false });
  expect((await p.store.lobbies()).some((l) => l.id === lobby.lobbyId)).toBe(false);
  const r = await p.app.inject({
    method: 'POST',
    url: `/api/lobbies/${lobby.lobbyId}/join`,
    remoteAddress: b.ip,
    headers: { authorization: `Bearer ${b.token}` },
    payload: {},
  });
  expect(r.statusCode).toBe(403);
  await p.security.remember(b.actor.id, a.ip);
  const own = await p.store.createLobby(b.profile, { mode: 'ranked', allowBots: false });
  expect(own.matchId).toBeNull();
  await p.store.cancelLobby(b.profile.id, own.lobbyId!);
  await p.security.action(a.ip, 'allow-shared', '');
  const joined = await p.store.createLobby(b.profile, { mode: 'ranked', allowBots: false });
  expect(joined.matchId).toBeTruthy();
  await p.store.resign(a.profile.id, joined.matchId!);
  await expect(p.store.rematch(b.profile.id, joined.matchId!)).rejects.toThrow(/matchmaking/);
});
it('guards admin instant wins and review data; test wins preserve Elo and currency', async () => {
  const a = await account('198.51.100.30'),
    b = await account('198.51.100.31'),
    outsider = await account('198.51.100.32');
  await p.db.read((sql) => sql('INSERT INTO server_admins(auth_user_id) VALUES($1)', [a.actor.id]));
  const headers = (token: string) => ({ authorization: `Bearer ${token}` });
  const lobby = await p.store.createLobby(a.profile, { mode: 'custom', allowBots: false });
  const { matchId } = await p.store.joinLobby(b.profile, lobby.lobbyId!);
  expect(
    (
      await p.app.inject({
        method: 'POST',
        url: `/api/matches/${matchId}/admin-win`,
        remoteAddress: b.ip,
        headers: headers(b.token),
        payload: {},
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await p.app.inject({
        method: 'POST',
        url: `/api/matches/${matchId}/admin-win`,
        remoteAddress: a.ip,
        headers: headers(a.token),
        payload: {},
      })
    ).statusCode,
  ).toBe(200);
  const done = await p.store.view(a.profile.id, matchId!);
  expect(done).toMatchObject({ status: 'complete', winner: 0, endReason: 'admin test result' });
  expect((await p.store.profile(a.actor)).prisms).toBe(a.profile.prisms);
  expect((await p.store.profile(a.actor)).rating).toBe(a.profile.rating);
  for (const mode of ['solo', 'draft', 'ranked'] as const) {
    const next =
      mode === 'solo'
        ? { matchId: await p.store.solo(a.profile.id, 'easy', STANDARD) }
        : await (async () => {
            await p.store.createLobby(a.profile, { mode, allowBots: false });
            return p.store.createLobby(b.profile, { mode, allowBots: false });
          })();
    await p.store.adminWin(a.profile.id, next.matchId!);
    expect((await p.store.view(a.profile.id, next.matchId!)).status).toBe('complete');
    expect((await p.store.view(a.profile.id, next.matchId!)).ratingApplies).toBe(false);
    expect((await p.store.profile(a.actor)).rating).toBe(a.profile.rating);
    if (mode === 'ranked') {
      const result = await p.store.view(a.profile.id, next.matchId!);
      await p.store.claimCard(a.profile.id, next.matchId!, result.trade.choices[0].id);
    }
  }
  for (const suffix of ['history', 'collection']) {
    expect(
      (
        await p.app.inject({
          url: `/api/admin/players/${b.profile.id}/${suffix}`,
          remoteAddress: b.ip,
          headers: headers(b.token),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await p.app.inject({
          url: `/api/admin/players/${b.profile.id}/${suffix}`,
          remoteAddress: a.ip,
          headers: headers(a.token),
        })
      ).statusCode,
    ).toBe(200);
  }
  await p.store.rebuildDeck(b.profile.id);
  const l = await p.store.createLobby(b.profile, { mode: 'custom', allowBots: false });
  const second = await p.store.joinLobby(outsider.profile, l.lobbyId!);
  await expect(p.store.adminWin(a.profile.id, second.matchId!)).rejects.toThrow(/private/);
  await p.store.resign(b.profile.id, second.matchId!);
});
it('summarizes repeated opponents and consecutive wins separately by rated mode', async () => {
  const a = await account('198.51.100.40'),
    b = await account('198.51.100.41');
  await p.db.read(async (sql) => {
    for (let i = 0; i < 14; i++)
      await sql(
        `INSERT INTO matches(id,mode,player0,player1,decks,rules,status,winner,completed_at,settlement_done)
      VALUES($1,'ranked',$2,$3,'[[],[]]','{}','complete',0,now()+$4::int*interval '1 second',true)`,
        [`audit-${i}`, a.profile.id, b.profile.id, i],
      );
  });
  const history = await p.review.history(a.profile.id);
  expect(history.total).toBe(14);
  expect(history.pairs[0]).toMatchObject({
    games: 14,
    wins: 14,
    losses: 0,
    longest_win_streak: 14,
  });
  expect((await p.review.history(b.profile.id)).pairs[0]).toMatchObject({
    games: 14,
    wins: 0,
    losses: 14,
    longest_win_streak: 0,
  });
  expect(JSON.stringify(history)).not.toContain('198.51.100');
});
