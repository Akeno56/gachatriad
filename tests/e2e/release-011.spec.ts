import { test, expect, type Browser, type Page } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPlatform } from '../../apps/server/src/app';
let platform: Awaited<ReturnType<typeof createPlatform>>,
  origin: string,
  serial = 0;
test.beforeAll(async () => {
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = await mkdtemp(resolve('.cache/pw-011-'));
  try {
    platform = await createPlatform(resolve('.'), { memory: true, timers: false });
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
  }
  await platform.bots.set(false);
  await platform.security.action('127.0.0.1', 'allow-shared', 'Isolated browser test');
  await platform.app.listen({ port: 0, host: '127.0.0.1' });
  origin = `http://127.0.0.1:${(platform.app.server.address() as { port: number }).port}`;
  platform.store.isOnline = () => true;
});
test.afterAll(async () => {
  await platform?.app.close();
});
async function player(browser: Browser) {
  const n = ++serial;
  const response = await platform.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    remoteAddress: `198.19.1.${n}`,
    payload: {
      name: `Release player ${n}`,
      email: `release-ui-${n}@test.invalid`,
      password: 'release-ui-password-123',
    },
  });
  expect(response.statusCode, response.body).toBe(200);
  const actor = { ...response.json().user, isAnonymous: false },
    token = String(response.headers['set-auth-token']);
  let profile = await platform.store.profile(actor);
  for (const pack of await platform.store.economy.list(profile.id))
    await platform.store.economy.open(profile.id, pack.id);
  await platform.store.completeTutorial(profile.id);
  await platform.store.acknowledgeRanked(profile.id);
  profile = await platform.store.profile(actor);
  const mobile = test.info().project.name === 'mobile';
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:3000',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  await context.addInitScript(
    ({ origin, token }) => {
      localStorage.setItem('triad-server', origin);
      localStorage.setItem(`triad-session:${origin}`, token);
    },
    { origin, token },
  );
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return ['http:', 'https:'].includes(url.protocol) &&
      !['127.0.0.1', 'localhost'].includes(url.hostname)
      ? route.abort()
      : route.continue();
  });
  const page = await context.newPage();
  return { actor, profile, context, page };
}
test('buys a currency sale and completes a card exchange through Market', async ({
  browser,
}, info) => {
  test.setTimeout(90000);
  const seller = await player(browser),
    buyer = await player(browser);
  try {
    await platform.db.read((sql) =>
      sql('UPDATE profiles SET prisms=1000 WHERE id=$1', [buyer.profile.id]),
    );
    const sold = seller.profile.deck[0],
      offered = seller.profile.deck[1],
      wanted = buyer.profile.deck.find((id) => id !== offered)!;
    await seller.page.goto('/market');
    await expect(seller.page.getByRole('link', { name: 'Market', exact: true })).toBeVisible();
    await seller.page.getByText('Post an offer', { exact: true }).click();
    await seller.page
      .getByRole('combobox', { name: 'Offer type', exact: true })
      .selectOption('sale');
    await seller.page.getByRole('combobox', { name: 'You offer', exact: true }).selectOption(sold);
    await seller.page.getByLabel('Price in Stellar Prisms', { exact: true }).fill('236');
    await seller.page.getByRole('button', { name: 'Post offer', exact: true }).click();
    await expect(seller.page.locator('.market-payment')).toContainText('236');
    await seller.page
      .getByRole('combobox', { name: 'Offer type', exact: true })
      .selectOption('exchange');
    await seller.page
      .getByRole('combobox', { name: 'You offer', exact: true })
      .selectOption(offered);
    await seller.page
      .getByRole('combobox', { name: 'You request', exact: true })
      .selectOption(wanted);
    await seller.page.getByRole('button', { name: 'Post offer', exact: true }).click();
    await expect(seller.page.locator('.trade-offer')).toHaveCount(2);
    await seller.page.screenshot({
      path: info.outputPath('market-sales-exchanges.png'),
      fullPage: true,
    });
    await buyer.page.goto('/market');
    await buyer.page
      .getByRole('combobox', { name: 'Listing type', exact: true })
      .selectOption('sale');
    await buyer.page.getByLabel('Minimum price', { exact: true }).fill('236');
    await buyer.page.getByLabel('Maximum price', { exact: true }).fill('236');
    await expect(buyer.page.locator('.trade-offer')).toHaveCount(1);
    await buyer.page.getByRole('button', { name: 'Review purchase', exact: true }).click();
    await buyer.page.getByRole('button', { name: 'Confirm purchase', exact: true }).click();
    await expect.poll(async () => (await platform.store.profile(buyer.actor)).prisms).toBe(764);
    expect((await platform.store.profile(seller.actor)).prisms).toBe(236);
    await buyer.page.getByLabel('Minimum price', { exact: true }).fill('');
    await buyer.page.getByLabel('Maximum price', { exact: true }).fill('');
    await buyer.page
      .getByRole('combobox', { name: 'Listing type', exact: true })
      .selectOption('exchange');
    await buyer.page.getByRole('button', { name: 'Review exchange', exact: true }).click();
    await buyer.page.getByRole('button', { name: 'Confirm exchange', exact: true }).click();
    await expect.poll(async () => (await platform.trades.list()).length).toBe(0);
    await seller.page.evaluate(() => localStorage.setItem('triad-language', 'fr'));
    await seller.page.reload();
    await expect(seller.page.getByRole('heading', { name: 'Marché', exact: true })).toBeVisible();
    await expect(seller.page.getByText('Publier une offre', { exact: true })).toBeVisible();
  } finally {
    await seller.context.close();
    await buyer.context.close();
  }
});
test('shows the exact Ranked rating delta and Season 0 W/L at the result', async ({
  browser,
}, info) => {
  const a = await player(browser),
    b = await player(browser);
  try {
    await platform.store.createLobby(a.profile, { mode: 'ranked', allowBots: false });
    const { matchId } = await platform.store.createLobby(b.profile, {
      mode: 'ranked',
      allowBots: false,
    });
    await platform.store.resign(b.profile.id, matchId!);
    await a.page.goto(`/?match=${matchId}`);
    await b.page.goto(`/?match=${matchId}`);
    const win = a.page.getByRole('region', { name: 'Season result', exact: true }),
      loss = b.page.getByRole('region', { name: 'Season result', exact: true });
    await expect(win).toContainText('1016');
    await expect(win).toContainText('(+16)');
    await expect(win).toContainText('1W 0L');
    await expect(win).toContainText('Season 0');
    await expect(loss).toContainText('984');
    await expect(loss).toContainText('(-16)');
    await expect(loss).toContainText('0W 1L');
    await a.page.screenshot({ path: info.outputPath('season-zero-result.png') });
    await a.page.evaluate(() => localStorage.setItem('triad-language', 'fr'));
    await a.page.reload();
    await expect(a.page.locator('.rated-result')).toContainText('1V 0D');
    await expect(a.page.locator('.rated-result')).toContainText('Saison 0');
    const result = await platform.store.view(a.profile.id, matchId!);
    await platform.store.claimCard(a.profile.id, matchId!, result.trade.choices[0].id);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
test('uses custom presets in Lobbies and fits more readable cards in the compact menus', async ({
  browser,
}, info) => {
  const a = await player(browser),
    page = a.page;
  try {
    await page.goto('/lobbies');
    await expect(page.locator('.queue-options button')).toHaveCount(4);
    await expect(
      page.locator('.queue-options').getByRole('button', { name: /^Ranked|^Draft/ }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole('combobox', { name: 'Mode', exact: true })
        .locator('option[value="ranked"],option[value="draft"]'),
    ).toHaveCount(0);
    await page.getByRole('button', { name: /^All Open rules/ }).click();
    await expect(page.locator('.lobby-create')).toBeVisible();
    expect((await platform.store.profile(a.actor)).waitingLobbyId).toBeNull();
    await page.screenshot({ path: info.outputPath('custom-presets.png'), fullPage: true });
    const mobile = info.project.name === 'mobile';
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto('/cards');
    await expect(page.locator('.catalog-grid .playing-card').first()).toBeVisible();
    const boxes = await page.locator('.catalog-grid .playing-card').evaluateAll((nodes) =>
      nodes.map((n) => {
        const b = n.getBoundingClientRect();
        return { y: b.y, height: b.height };
      }),
    );
    expect(boxes.filter((b) => Math.abs(b.y - boxes[0].y) < 2).length).toBeGreaterThanOrEqual(
      mobile ? 2 : 6,
    );
    expect(boxes[0].height).toBeLessThanOrEqual(mobile ? 232 : 272);
    await page.screenshot({ path: info.outputPath('compact-cards.png'), fullPage: true });
    await page.goto('/collection');
    expect(
      (await page.locator('.deck-preview .playing-card').first().boundingBox())!.height,
    ).toBeLessThanOrEqual(182);
    await page.screenshot({ path: info.outputPath('compact-collection.png'), fullPage: true });
    await page.goto('/boosters');
    await expect(page.locator('.booster-tile-art').first()).toBeVisible();
    expect(
      (await page.locator('.booster-tile-art').first().boundingBox())!.height,
    ).toBeLessThanOrEqual(222);
    await page.goto('/profile');
    await expect(page.locator('.profile-portrait')).toBeVisible();
    expect((await page.locator('.profile-portrait').boundingBox())!.height).toBeLessThanOrEqual(
      mobile ? 170 : 210,
    );
  } finally {
    await a.context.close();
  }
});
