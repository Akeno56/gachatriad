import { beforeAll, afterAll, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createPlatform } from './app';
let p: Awaited<ReturnType<typeof createPlatform>>;
const origin = 'http://127.0.0.1:3000';
beforeAll(async () => {
  p = await createPlatform(resolve('.'), { memory: true, timers: false });
  await p.app.listen({ host: '127.0.0.1', port: 0 });
});
afterAll(async () => {
  await p?.app.close();
});
async function send(
  path: string,
  ip: string,
  body?: unknown,
  token?: string,
  extra: Record<string, string> = {},
) {
  return p.app.inject({
    method: body === undefined ? 'GET' : 'POST',
    url: '/api' + path,
    remoteAddress: ip,
    headers: {
      origin,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...extra,
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}
it('enforces server-side name lengths and does not cache private API responses', async () => {
  for (const [i, name] of ['', ' '.repeat(5), 'X'.repeat(33)].entries())
    expect(
      (
        await send('/auth/sign-up/email', `10.80.0.${i + 1}`, {
          name,
          email: `bad-${i}@test.invalid`,
          password: 'security-test-password-123',
        })
      ).statusCode,
    ).toBe(400);
  const anon = await send('/auth/sign-in/anonymous', '10.80.1.1', {});
  expect(anon.statusCode).toBe(200);
  const token = String(anon.headers['set-auth-token']);
  const profile = await send('/profile', '10.80.1.1', undefined, token);
  expect(profile.statusCode).toBe(200);
  expect(profile.headers['cache-control']).toBe('no-store');
  expect(profile.headers['x-content-type-options']).toBe('nosniff');
  expect((await send('/local-control/status', '10.80.1.1', undefined, token)).statusCode).toBe(404);
  expect(
    (
      await send(
        '/admin/grants',
        '10.80.1.1',
        {
          profileId: profile.json().id,
          kind: 'prisms',
          amount: 1000,
          requestId: 'forged-admin-grant',
        },
        token,
        { 'x-admin': 'true' },
      )
    ).statusCode,
  ).toBe(403);
  expect(
    (await send('/profile', '10.80.1.2', undefined, token, { origin: 'https://attacker.invalid' }))
      .headers['access-control-allow-origin'],
  ).not.toBe('https://attacker.invalid');
  expect(
    (await send('/boosters/daily', '10.80.1.1', {}, token, { origin: 'https://attacker.invalid' }))
      .statusCode,
  ).toBe(403);
});
it('rate-limits anonymous account creation despite spoofed auth-IP headers', async () => {
  for (let i = 0; i < 20; i++) {
    const r = await send('/auth/sign-in/anonymous', '10.81.0.1', {}, undefined, {
      'x-gacha-client-ip': `10.99.0.${i + 1}`,
    });
    expect(r.statusCode, r.body).toBe(200);
  }
  expect(
    (
      await send('/auth/sign-in/anonymous', '10.81.0.1', {}, undefined, {
        'x-gacha-client-ip': '8.8.8.8',
      })
    ).statusCode,
  ).toBe(429);
});
it('rejects unsigned sockets and limits each authenticated player to five connections', async () => {
  const require = createRequire(resolve('apps/web/package.json'));
  const { io } = require('socket.io-client') as {
    io: (
      url: string,
      options: unknown,
    ) => { disconnect: () => void; once: (event: string, callback: () => void) => void };
  };
  const response = await send('/auth/sign-in/anonymous', '10.82.0.1', {}),
    token = String(response.headers['set-auth-token']);
  const profile = (await send('/profile', '10.82.0.1', undefined, token)).json();
  const port = (p.app.server.address() as { port: number }).port,
    url = `http://127.0.0.1:${port}`;
  const sockets: ReturnType<typeof io>[] = [];
  async function connect(auth: Record<string, string>) {
    const socket = io(url, {
      auth,
      transports: ['websocket'],
      reconnection: false,
      timeout: 3000,
      extraHeaders: { origin },
    });
    sockets.push(socket);
    return new Promise<boolean>((resolve) => {
      socket.once('connect', () => resolve(true));
      socket.once('connect_error', () => resolve(false));
    });
  }
  try {
    expect(await connect({ token: 'unsigned-forged-token', profileId: profile.id })).toBe(false);
    const otherResponse = await send('/auth/sign-in/anonymous', '10.82.0.2', {}),
      otherToken = String(otherResponse.headers['set-auth-token']);
    const other = (await send('/profile', '10.82.0.2', undefined, otherToken)).json();
    expect(await connect({ token, profileId: other.id })).toBe(false);
    for (let i = 0; i < 5; i++) expect(await connect({ token, profileId: profile.id })).toBe(true);
    expect(await connect({ token, profileId: profile.id })).toBe(false);
    const social = (await send('/social', '10.82.0.1', undefined, token)).json();
    expect(social.onlinePlayers).toHaveLength(1);
    expect(Object.keys(social.onlinePlayers[0]).sort()).toEqual(['avatar', 'id', 'name', 'title']);
  } finally {
    for (const socket of sockets) socket.disconnect();
  }
});
it('limits repeated match/lobby creation independently from read polling', async () => {
  const response = await send('/auth/sign-in/anonymous', '10.83.0.1', {}),
    token = String(response.headers['set-auth-token']);
  for (let i = 0; i < 20; i++)
    expect((await send('/lobbies', '10.83.0.1', { mode: 'invalid-mode' }, token)).statusCode).toBe(
      400,
    );
  expect((await send('/lobbies', '10.83.0.1', { mode: 'invalid-mode' }, token)).statusCode).toBe(
    429,
  );
  expect((await send('/profile', '10.83.0.1', undefined, token)).statusCode).toBe(200);
});
