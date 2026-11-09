import { chromium, expect } from '@playwright/test';
const panel = 'http://127.0.0.1:3040';
const browser = await chromium.launch();
let page;
try {
  const admin = await browser.newPage();
  await admin.goto(panel);
  await expect(admin.locator('#status')).toHaveText('TEST SERVER · PC');
  let state = await (await fetch(panel + '/state')).json();
  expect(state.localTest).toBe(true);
  expect(state.managedExternal).toBe(false);
  expect(state.config.gamePort).toBe(3101);
  expect(state.config.frontendURL).toBe('https://akeno56.github.io/gachatriad/');
  if (!state.running)
    await admin.getByRole('button', { name: 'Start server', exact: true }).click();
  await expect.poll(async () => (await (await fetch(panel + '/state')).json()).running).toBe(true);
  await expect(admin.getByRole('button', { name: 'Start public link', exact: true })).toBeEnabled({
    timeout: 20000,
  });
  const context = await browser.newContext(),
    external = [],
    local = [];
  await context.addInitScript(() => localStorage.setItem('triad-server', 'https://gachatriad.com'));
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !['127.0.0.1', 'localhost'].includes(url.hostname)
    ) {
      external.push(url.origin);
      return route.abort();
    }
    if (url.port === '3101') local.push(url.pathname);
    return route.continue();
  });
  page = await context.newPage();
  await page.goto('http://127.0.0.1:3100/?server=https%3A%2F%2Fgachatriad.com');
  await expect(page.locator('.account-control')).toHaveText('Login/Register');
  await expect(page.locator('.starter-welcome')).toBeVisible();
  expect(local.some((path) => path.startsWith('/api/profile'))).toBe(true);
  expect(external).toEqual([]);
  await page.goto('http://127.0.0.1:3100/cards/');
  await page.locator('.account-control').click();
  const name = `Preview admin ${Date.now()}`;
  await page.getByLabel('Player name', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(`preview-${Date.now()}@test.invalid`);
  await page.getByLabel('Password', { exact: true }).fill('preview-only-password-123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('.account-control')).toHaveText('Logout');
  admin.on('dialog', (dialog) => dialog.accept());
  await expect(admin.locator('#moderationUsers tr').filter({ hasText: name })).toBeVisible();
  await admin
    .locator('#moderationUsers tr')
    .filter({ hasText: name })
    .getByRole('button', { name: 'Make admin', exact: true })
    .click();
  const backend = 'http://127.0.0.1:3101/api';
  const targetContext = await browser.newContext();
  try {
    const signup = await targetContext.request.post(backend + '/auth/sign-up/email', {
      data: {
        name: 'Preview collection',
        email: `target-${Date.now()}@test.invalid`,
        password: 'preview-only-password-123',
      },
    });
    expect(signup.status(), await signup.text()).toBe(200);
    const target = await (await targetContext.request.get(backend + '/profile')).json();
    for (const pack of await (await targetContext.request.get(backend + '/boosters')).json())
      await targetContext.request.post(backend + `/boosters/${pack.id}/open`, { data: {} });
    await page.goto(`http://127.0.0.1:3100/profile/?id=${target.id}`);
    await expect(
      page.getByRole('heading', { name: 'Administrator review', exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole('tab', { name: 'Collection', exact: true }).click();
    await expect(page.locator('.admin-collection-grid .playing-card').first()).toBeVisible();
    expect(
      (await page.locator('.admin-collection-grid .playing-card').first().boundingBox()).height,
    ).toBeGreaterThan(200);
    await page
      .locator('.admin-player-review')
      .screenshot({ path: '.cache/alpha-profile-review.png' });
    await page.getByRole('tab', { name: 'Battle history', exact: true }).click();
    await expect(page.locator('.admin-player-review')).toContainText('0 completed games');
  } finally {
    await targetContext.close();
  }
  for (const pack of await (await page.request.get(backend + '/boosters')).json())
    if (!pack.openedAt)
      await page.request.post(backend + `/boosters/${pack.id}/open`, { data: {} });
  await page.request.post(backend + '/tutorial/complete', { data: {} });
  const solo = await page.request.post(backend + '/solo', {
    data: { difficulty: 'easy', rules: { allOpen: true, same: false, plus: false, combo: false } },
  });
  expect(solo.status(), await solo.text()).toBe(200);
  const { matchId } = await solo.json();
  await page.goto(`http://127.0.0.1:3100/?match=${matchId}`);
  await expect(page.getByRole('button', { name: 'Admin: instant win', exact: true })).toBeVisible();
  await page.screenshot({ path: '.cache/alpha-desktop-battle.png' });
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Admin: instant win', exact: true }).click();
  await expect
    .poll(
      async () => (await (await page.request.get(backend + `/matches/${matchId}`)).json()).status,
    )
    .toBe('complete');
  expect(external).toEqual([]);
  await admin.screenshot({ path: '.cache/local-test-panel.png', fullPage: true });
  await admin.getByRole('button', { name: 'Shut down server', exact: true }).click();
  await expect.poll(async () => (await (await fetch(panel + '/state')).json()).running).toBe(false);
  console.log(
    'Separate test panel passed: 3040/3101/3100, local admin promotion, another profile collection/history, admin instant win, no production requests despite saved/query production URLs.',
  );
} finally {
  await browser.close();
}
