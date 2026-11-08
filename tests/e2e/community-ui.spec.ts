import { expect, test } from '@playwright/test';
import { openStarterPacks } from './helpers';
test('shows public chat in Play, compact lobby checkboxes, and unselectable inspected artwork', async ({
  page,
}, info) => {
  await page.goto('/cards');
  await openStarterPacks(page);
  await page.request.post('/api/tutorial/complete', { data: {} });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Main chat', exact: true })).toBeVisible();
  await expect(page.getByLabel('Main chat message', { exact: true })).toBeDisabled();
  await expect(page.locator('.party-caption')).toHaveCount(0);
  await page.locator('.title-card').first().click();
  const card = page.locator('.card-detail .playing-card');
  await expect(card).toBeVisible();
  const bounds = (await card.boundingBox())!;
  await page.mouse.move(bounds.x + 15, bounds.y + 15);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 10, bounds.y + bounds.height - 10, { steps: 10 });
  await page.mouse.up();
  await card.locator('.card-values span').first().dblclick();
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('');
  await page.getByRole('button', { name: 'Close card detail' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const overlay = page.locator('.crt-overlay');
  await expect(overlay).toHaveCSS('animation-name', 'crt-scroll');
  const position = await overlay.evaluate((el) => getComputedStyle(el).backgroundPosition);
  await expect
    .poll(() => overlay.evaluate((el) => getComputedStyle(el).backgroundPosition))
    .not.toBe(position);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(overlay).toHaveCSS('animation-name', 'crt-scroll');
  await page.goto('/lobbies');
  const check = page.getByLabel('Allow bots to join my lobby / queue', { exact: true });
  const size = (await check.boundingBox())!;
  expect(size.width).toBeLessThanOrEqual(22);
  expect(size.height).toBeLessThanOrEqual(22);
  await page.getByText('Allow bots to join my lobby / queue', { exact: true }).click();
  await expect(check).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('compact-checkbox.png'), fullPage: true });
});
test('automatically loops Same, Plus and Combo at half speed without playback controls', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-11-08T10:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-08T10:00:01Z'));
  await page.goto('/rules');
  await expect(page.locator('.rule-animation:not(.visibility-example)')).toHaveCount(3);
  await expect(page.locator('.rule-animation button')).toHaveCount(0);
  await page.clock.runFor(3900);
  await expect(page.locator('.visibility-example')).toHaveAttribute('data-visibility', '0');
  await expect(page.locator('.visibility-mini.is-revealed')).toHaveCount(10);
  for (const demo of await page.locator('.rule-animation:not(.visibility-example)').all())
    await expect(demo).toHaveAttribute('data-step', '0');
  await page.clock.runFor(200);
  await expect(page.locator('.visibility-example')).toHaveAttribute('data-visibility', '1');
  await expect(page.locator('.visibility-mini.is-revealed')).toHaveCount(8);
  for (const demo of await page.locator('.rule-animation:not(.visibility-example)').all())
    await expect(demo).toHaveAttribute('data-step', '1');
  await page.clock.runFor(3000);
  for (const demo of await page.locator('.rule-animation:not(.visibility-example)').all())
    await expect(demo).toHaveAttribute('data-step', '2');
  await page.clock.runFor(4000);
  await expect(page.locator('.visibility-example')).toHaveAttribute('data-visibility', '2');
  await expect(page.locator('.visibility-mini.is-revealed')).toHaveCount(5);
  for (const demo of await page.locator('.rule-animation:not(.visibility-example)').all())
    await expect(demo).toHaveAttribute('data-step', '3');
  await page.clock.runFor(4000);
  await expect(page.locator('.demo-same')).toHaveAttribute('data-step', '0');
  await expect(page.locator('.demo-plus')).toHaveAttribute('data-step', '0');
  await expect(page.locator('.demo-combo')).toHaveAttribute('data-step', '4');
  expect(await page.locator('.demo-combo .demo-cell[data-owner="0"]').count()).toBe(7);
  await page.screenshot({ path: info.outputPath('rule-animations.png'), fullPage: true });
  await page.clock.runFor(4000);
  await expect(page.locator('.demo-combo')).toHaveAttribute('data-step', '0');
});
test('registration waits for an in-flight guest refresh and keeps its profile', async ({
  page,
}) => {
  await page.goto('/cards');
  await openStarterPacks(page);
  const before = await (await page.request.get('/api/profile')).json();
  let release!: () => void,
    entered!: () => void,
    hold = true,
    signups = 0;
  const blocked = new Promise<void>((resolve) => {
      entered = resolve;
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  page.on('request', (r) => {
    if (r.url().includes('/auth/sign-up/email')) signups++;
  });
  await page.route('**/api/profile', async (route) => {
    if (hold) {
      hold = false;
      entered();
      await gate;
    }
    await route.continue();
  });
  await blocked;
  await page.locator('.account-control').click();
  await page.getByLabel('Player name').fill('Refresh safe player');
  await page
    .getByLabel('Email', { exact: true })
    .fill(`refresh-${crypto.randomUUID()}@test.invalid`);
  await page.getByLabel('Password', { exact: true }).fill('refresh-safe-password-123');
  const response = page.waitForResponse((r) => r.url().includes('/auth/sign-up/email'));
  let signupBeforeRelease = -1;
  try {
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.locator('.account-dialog button.primary-button')).toHaveText('Connecting…');
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    signupBeforeRelease = signups;
  } finally {
    release();
  }
  expect((await response).status()).toBe(200);
  expect(signupBeforeRelease).toBe(0);
  await expect(page.locator('.account-control')).toHaveText('Logout');
  const after = await (await page.request.get('/api/profile')).json();
  expect(after.id).toBe(before.id);
  expect(after.inventory).toEqual(before.inventory);
  expect(after.registered).toBe(true);
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Login/Register', exact: true })).toBeVisible();
  const signedOut = await (await page.request.get('/api/profile')).json();
  expect(signedOut.registered).toBe(false);
  expect(signedOut.id).not.toBe(after.id);
});
test('automatic pack reveals prevent selecting card text and artwork', async ({ page }) => {
  await page.goto('/boosters');
  await expect(page.locator('.account-control')).not.toHaveText('Connecting…');
  await page.getByLabel('Boosters to open').selectOption('1');
  await page.getByRole('button', { name: 'Open 1 packs', exact: true }).click();
  const pack = page.locator('.automatic-opening');
  await expect(pack.locator('.auto-revealed-card')).toBeVisible();
  await pack.locator('.auto-opening-stage h3').dblclick();
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('');
  await expect(pack.getByRole('heading', { name: '5 cards added' })).toBeVisible({
    timeout: 20000,
  });
  await pack.locator('.auto-results-grid .card-values span').first().dblclick();
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('');
});
