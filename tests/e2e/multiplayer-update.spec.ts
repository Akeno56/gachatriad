import { expect, test, type Browser } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPlatform } from '../../apps/server/src/app';
import { navigateTo } from './helpers';

let platform: Awaited<ReturnType<typeof createPlatform>>;
let origin: string;
let serial = 0;
test.beforeAll(async () => {
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = await mkdtemp(resolve('.cache/pw-multiplayer-'));
  try {
    platform = await createPlatform(resolve('.'), { memory: true, timers: false });
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
  }
  await platform.bots.set(false);
  await platform.app.listen({ port: 0, host: '127.0.0.1' });
  origin = `http://127.0.0.1:${(platform.app.server.address() as { port: number }).port}`;
});
test.afterAll(async () => {
  await platform?.app.close();
});

async function player(browser: Browser) {
  const n = ++serial;
  const remoteAddress = `198.19.23.${n}`;
  const signup = await platform.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    remoteAddress,
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: {
      name: `Multiplayer tester ${n}`,
      email: `multiplayer-${n}@test.invalid`,
      password: 'isolated-multiplayer-password',
    },
  });
  expect(signup.statusCode, signup.body).toBe(200);
  const token = String(signup.headers['set-auth-token']);
  const actor = { ...signup.json().user, isAnonymous: false };
  const profile = await platform.store.profile(actor);
  for (const pack of await platform.store.economy.list(profile.id))
    await platform.store.economy.open(profile.id, pack.id);
  await platform.store.rebuildDeck(profile.id);
  await platform.store.completeTutorial(profile.id);
  const mobile = test.info().project.name === 'mobile';
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:3000',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  await context.addInitScript(
    ({ origin, token }) => {
      localStorage.setItem('triad-server', origin);
      localStorage.setItem(`triad-session:${origin}`, token);
      localStorage.setItem('triad-music', 'off');
    },
    { origin, token },
  );
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  return {
    profile: await platform.store.profile(actor),
    context,
    page: await context.newPage(),
    async request(path: string, payload: Record<string, unknown>) {
      const result = await platform.app.inject({
        method: 'POST',
        url: `/api${path}`,
        payload,
        remoteAddress,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(result.statusCode, result.body).toBe(200);
      return result.json();
    },
  };
}

test('keeps a duel invitation after the toast and skips profile and board reads for battle chat', async ({
  browser,
}, info) => {
  const a = await player(browser);
  const b = await player(browser);
  try {
    await a.request('/friends/request', { playerId: b.profile.id });
    await b.request(`/friends/${a.profile.id}/accept`, {});
    await a.page.goto('/');
    await b.page.goto('/cards/');
    await expect(b.page.getByRole('button', { name: 'Logout' })).toBeVisible();
    await expect.poll(() => platform.store.isOnline?.(b.profile.id)).toBe(true);
    await a.request('/invites', { playerId: b.profile.id });
    const toast = b.page.locator('.duel-invite-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveCount(0);
    const shortcut = b.page.locator('.duel-invite-launcher');
    await expect(shortcut).toBeInViewport({ ratio: 1 });
    await navigateTo(b.page, 'Decks');
    await shortcut.click();
    const inbox = b.page.getByRole('region', { name: 'Duel invitations' });
    await expect(inbox).toContainText(a.profile.name);
    await b.page.screenshot({ path: info.outputPath('duel-inbox.png') });
    await inbox.getByRole('button', { name: 'Accept duel' }).click();
    await expect(b.page.getByTestId('cell-0')).toBeVisible();
    await expect(a.page.getByTestId('cell-0')).toBeVisible();
    await expect(shortcut).toHaveCount(0);
    if (info.project.name === 'mobile') await b.page.locator('.comms-mobile-toggle').click();
    const log = b.page.getByRole('log', { name: 'Battle chat messages' });
    await expect(log).toContainText('Only you and your opponent can read this chat.');
    const matchId = new URL(b.page.url()).searchParams.get('match')!;
    const reads: string[] = [];
    b.page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (request.method() === 'GET' && path.startsWith('/api/')) reads.push(path);
    });
    await a.request(`/matches/${matchId}/chat`, {
      message: 'Good luck!',
      requestId: 'multiplayer-private-chat-1',
    });
    await expect(log).toContainText('Good luck!');
    expect(reads).toContain(`/api/matches/${matchId}/chat`);
    expect(reads).not.toContain(`/api/matches/${matchId}`);
    expect(reads).not.toContain('/api/profile');
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test('finds a matched duel from the shared queue when its socket is unavailable', async ({
  browser,
}) => {
  const a = await player(browser);
  const b = await player(browser);
  try {
    await a.context.route('**/socket.io/**', (route) => route.abort());
    await a.context.routeWebSocket('**/socket.io/**', (socket) => socket.close());
    await a.request('/lobbies', { mode: 'casual', allowBots: false });
    await a.page.goto('/cards/');
    const dock = a.page.locator('.matchmaking-dock');
    await expect(dock).toContainText('Unranked');
    await a.page.route('**/api/profile', (route) =>
      route.fulfill({ status: 401, contentType: 'text/html', body: '<h1>Proxy restarting</h1>' }),
    );
    await a.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(dock).toContainText('Reconnecting…');
    await a.page.unroute('**/api/profile');
    await a.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(dock).toContainText('Searching for an opponent…');
    await expect(a.page.getByRole('button', { name: 'Logout' })).toBeVisible();
    await a.page.getByRole('button', { name: 'Language: English' }).click();
    await a.page.getByRole('menuitemradio', { name: 'Français' }).click();
    await expect(dock).toContainText('Annuler');
    await a.page.getByRole('button', { name: 'Langue : Français' }).click();
    await a.page.getByRole('menuitemradio', { name: 'English' }).click();
    const match = await b.request('/lobbies', { mode: 'casual', allowBots: false });
    expect(match.matchId).toBeTruthy();
    await expect(dock).toHaveCount(0, { timeout: 9000 });
    const reminder = a.page.getByRole('dialog', { name: 'You have an active battle' });
    await expect(reminder).toBeVisible();
    await reminder.getByRole('button', { name: 'Go back to the battle' }).click();
    await expect(a.page.getByTestId('cell-0')).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
