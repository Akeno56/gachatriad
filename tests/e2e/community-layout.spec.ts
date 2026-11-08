import { test, expect } from '@playwright/test';
import { openStarterPacks, openSettings } from './helpers';
test('fits the home chat beside setup, shares channel selection with Lobbies and docks settings', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/cards');
  await openStarterPacks(page);
  await page.request.post('/api/tutorial/complete', { data: {} });
  await page.goto('/');
  const chat = page.locator('.main-chat'),
    setup = page.locator('.setup-panel'),
    deck = page.locator('.title-roster');
  await expect(chat).toBeVisible();
  await expect(chat.locator('.chat-user-list')).toContainText('Guest');
  const cb = (await chat.boundingBox())!,
    sb = (await setup.boundingBox())!,
    db = (await deck.boundingBox())!;
  expect(cb.y).toBeGreaterThanOrEqual(db.y + db.height - 2);
  if (info.project.name === 'desktop') {
    expect(cb.x).toBeGreaterThan(sb.x + sb.width);
    expect(cb.y + cb.height).toBeLessThanOrEqual(900);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      900,
    );
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const credits = page.getByRole('link', { name: 'Credits', exact: true });
  await expect(credits).toBeInViewport();
  expect((await credits.boundingBox())!.y + (await credits.boundingBox())!.height).toBeLessThan(
    (await page.getByRole('button', { name: 'Friends and private chat' }).boundingBox())!.y,
  );
  await page.screenshot({ path: info.outputPath('home-channel-layout.png'), fullPage: true });
  await chat.getByRole('tab', { name: 'Trade', exact: true }).click();
  await page.getByRole('link', { name: 'Lobbies', exact: true }).click();
  await expect(page.locator('.main-chat')).toHaveClass(/chat-compact/);
  await expect(page.getByRole('tab', { name: 'Lobbies', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect((await page.locator('.main-chat').boundingBox())!.y).toBeLessThan(
    (await page.locator('.lobby-tools').boundingBox())!.y,
  );
  await expect(
    page.locator('.system-controls .server-control,.system-controls button[aria-label^="Music"]'),
  ).toHaveCount(0);
  await openSettings(page);
  await expect(page.getByRole('slider', { name: 'Music volume', exact: true })).toBeVisible();
  await page.getByRole('slider', { name: 'Music volume', exact: true }).press('Home');
  await page.reload();
  await openSettings(page);
  await expect(page.getByRole('slider', { name: 'Music volume', exact: true })).toHaveValue('0');
  expect((await page.locator('.settings-cog').boundingBox())!.x).toBeLessThan(20);
});
test('sorts the filtered collection independently by name, rarity and total stats', async ({
  page,
}) => {
  await page.goto('/collection');
  await openStarterPacks(page);
  const universe = page.getByLabel('Universe', { exact: true }),
    sort = page.getByLabel('Sort collection', { exact: true });
  await sort.selectOption('name-asc');
  const names = await page.locator('.catalog-grid .card-caption strong').allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  const options = await universe
    .locator('option')
    .evaluateAll((items) => items.map((item) => (item as HTMLOptionElement).value));
  for (const id of options.filter((id) => id !== 'all')) {
    await universe.selectOption(id);
    if ((await page.locator('.catalog-grid article').count()) > 0) break;
  }
  const filter = await universe.inputValue();
  await sort.selectOption('stats-desc');
  expect(await universe.inputValue()).toBe(filter);
  const totals = await page
    .locator('.catalog-grid .card-values')
    .evaluateAll((cards) =>
      cards.map((el) =>
        Array.from(el.querySelectorAll('.value')).reduce(
          (s, n) => s + (n.textContent === 'A' ? 10 : Number(n.textContent)),
          0,
        ),
      ),
    );
  expect(totals).toEqual([...totals].sort((a, b) => b - a));
  await universe.selectOption('all');
  await sort.selectOption('rarity-desc');
  const rarities = await page
    .locator('.catalog-grid .card-stars')
    .evaluateAll((cards) => cards.map((el) => el.textContent!.length));
  expect(rarities).toEqual([...rarities].sort((a, b) => b - a));
});
test('opens four mixed-source boosters automatically and keeps every result', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/boosters');
  await expect(page.locator('.account-control')).not.toHaveText('Connecting…');
  await page.locator('.account-control').click();
  await page.getByLabel('Player name').fill('Pack tester');
  await page
    .getByLabel('Email', { exact: true })
    .fill('packs-' + crypto.randomUUID() + '@test.invalid');
  await page.getByLabel('Password', { exact: true }).fill('booster-test-password-123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('.account-dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Claim daily booster', exact: true }).click();
  await page.getByRole('button', { name: 'Open 4 packs', exact: true }).click();
  await expect(page.getByRole('heading', { name: '20 cards added', exact: true })).toBeVisible({
    timeout: 60000,
  });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const profile = await (await page.request.get('/api/profile')).json();
  expect(
    Object.values(profile.inventory).reduce((sum: number, c: any) => sum + c.quantity, 0),
  ).toBe(20);
});

test('waits for artwork and advances automatically without manual reveal controls', async ({
  page,
}) => {
  await page.goto('/boosters');
  await expect(page.locator('.account-control')).not.toHaveText('Connecting…');
  await page.getByLabel('Boosters to open').selectOption('1');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/assets\/characters\/.*\/(?:portrait|listing)\.webp/, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.getByRole('button', { name: 'Open 1 packs', exact: true }).click();
    const pack = page.locator('.automatic-opening');
    await expect(pack).toHaveAttribute('data-phase', 'pack');
    await page.waitForTimeout(1000);
    await expect(pack.locator('.auto-revealed-card')).toHaveCount(0);
    release();
    await expect(pack.locator('.auto-revealed-card')).toBeVisible();
    await expect(pack).toHaveAttribute('data-position', '0');
    await expect(pack.getByRole('button', { name: /Reveal|Next card/ })).toHaveCount(0);
    await expect(pack).toHaveAttribute('data-position', '1');
    await pack.getByRole('button', { name: 'Close booster opening' }).click();
    const profile = await (await page.request.get('/api/profile')).json();
    expect(
      Object.values(profile.inventory).reduce((sum: number, c: any) => sum + c.quantity, 0),
    ).toBe(5);
  } finally {
    release();
  }
});

test('uses genuine old/new owner faces for Plus and Combo captures', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/cards');
  await openStarterPacks(page);
  await page.request.post('/api/tutorial/complete', { data: {} });
  await page.goto('/');
  await page.getByRole('button', { name: 'Combo lesson', exact: true }).click();
  await page.getByTestId('lesson-cell-1').click();
  const scenes = page.locator('.combo-lesson .capture-flip-scene');
  await expect(scenes).toHaveCount(4);
  await expect(page.locator('.combo-lesson .capture-flip-old .owned-cpu')).toHaveCount(4);
  await expect(page.locator('.combo-lesson .capture-flip-new .owned-player')).toHaveCount(4);
  const rotor = scenes.last().locator('.capture-flip-rotor');
  await expect(rotor).toHaveCSS('animation-name', 'capture-turn');
  const matrix = await rotor.evaluate((el) => getComputedStyle(el).transform);
  await expect.poll(() => rotor.evaluate((el) => getComputedStyle(el).transform)).not.toBe(matrix);
  await expect(page.locator('.combo-lesson .reason-combo')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('two-sided-capture.png') });
});
