import { it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPlatform } from './app';
// @ts-expect-error local administration tool is a JavaScript entry point
import { createController } from '../../../tools/server-control/index.mjs';
it('manages users on an external service without starting a second database writer', async () => {
  const directory = await mkdtemp(resolve('.cache/external-admin-'));
  const previous = { secret: process.env.LOCAL_CONTROL_SECRET, data: process.env.DATA_DIR };
  process.env.LOCAL_CONTROL_SECRET = randomBytes(32).toString('hex');
  process.env.DATA_DIR = directory;
  let controller: any;
  const p = await createPlatform(resolve('.'), { memory: true, timers: false });
  try {
    await p.app.listen({ port: 0, host: '127.0.0.1' });
    const address = p.app.server.address();
    if (!address || typeof address === 'string') throw Error('No address');
    const signup = await p.app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { origin: 'http://127.0.0.1:3000' },
      payload: {
        name: 'Hosted player',
        email: 'hosted@test.invalid',
        password: 'hosted-private-test-password',
      },
    });
    expect(signup.statusCode).toBe(200);
    const cookie = signup.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const profile = (
      await p.app.inject({ method: 'GET', url: '/api/profile', headers: { cookie } })
    ).json();
    controller = await createController({
      dataDir: directory,
      port: 3160,
      previewPort: 3162,
      gamePort: address.port,
      managedExternal: true,
    });
    const state = await controller.state();
    expect(state).toMatchObject({ running: false, external: true, managedExternal: true });
    expect(state.previewURL).toBe('');
    expect(state.moderation.users.some((u: any) => u.id === profile.id)).toBe(true);
    expect(profile.isAdmin).toBe(false);
    const html = await (await fetch(controller.url)).text();
    const token = html.match(/const token = '([^']+)'/)?.[1];
    expect(token).toBeTruthy();
    const post = (path: string, body: unknown = {}) =>
      fetch(controller.url + path, {
        method: 'POST',
        headers: {
          origin: controller.url,
          'x-control-token': token!,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    const promote = await post('/moderation', { profileId: profile.id, action: 'promote' });
    expect(promote.status, await promote.text()).toBe(200);
    expect(
      (await p.app.inject({ method: 'GET', url: '/api/profile', headers: { cookie } })).json()
        .isAdmin,
    ).toBe(true);
    const grant = await post('/grant', {
      profileId: profile.id,
      kind: 'prisms',
      amount: 150,
      requestId: randomUUID(),
    });
    expect(grant.status, await grant.text()).toBe(200);
    expect(
      (await p.app.inject({ method: 'GET', url: '/api/profile', headers: { cookie } })).json()
        .prisms,
    ).toBe(150);
    const start = await post('/start');
    expect(start.status).toBe(400);
    expect(await start.text()).toContain('service manager');
    await controller.close();
    controller = null;
    expect((await p.app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
  } finally {
    await controller?.close();
    await p.app.close();
    if (previous.secret === undefined) delete process.env.LOCAL_CONTROL_SECRET;
    else process.env.LOCAL_CONTROL_SECRET = previous.secret;
    if (previous.data === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous.data;
  }
});
