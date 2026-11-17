import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPlatform } from '../../apps/server/src/app';
import { CARDS } from '../../packages/shared/src/index';
let platform: Awaited<ReturnType<typeof createPlatform>>,
  origin: string,
  serial = 0;
test.beforeAll(async () => {
  const old = process.env.DATA_DIR;
  process.env.DATA_DIR = await mkdtemp(resolve('.cache/pw-013-'));
  try {
    platform = await createPlatform(resolve('.'), { memory: true, timers: false });
  } finally {
    if (old === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = old;
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
  const r = await platform.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    remoteAddress: `198.19.13.${n}`,
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: {
      name: `Polish tester ${n}`,
      email: `polish-${n}@test.invalid`,
      password: 'isolated-polish-password',
    },
  });
  expect(r.statusCode, r.body).toBe(200);
  const actor = { ...r.json().user, isAnonymous: false },
    token = String(r.headers['set-auth-token']);
  let profile = await platform.store.profile(actor);
  for (const pack of await platform.store.economy.list(profile.id))
    await platform.store.economy.open(profile.id, pack.id);
  await platform.store.completeTutorial(profile.id);
  const cards = CARDS.filter((card) => card.rarity === 1).slice(0, 6);
  for (const card of cards)
    await platform.db.read((sql) =>
      sql(
        'INSERT INTO inventory(profile_id,card_id,quantity) VALUES($1,$2,1) ON CONFLICT(profile_id,card_id) DO UPDATE SET quantity=inventory.quantity+1',
        [profile.id, card.id],
      ),
    );
  await platform.store.saveDeck(
    profile.id,
    cards.slice(0, 5).map((card) => card.id),
  );
  profile = await platform.store.profile(actor);
  const mobile = test.info().project.name === 'mobile';
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:3000',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 },
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
    return /^https?:$/.test(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)
      ? route.abort()
      : route.continue();
  });
  const page = await context.newPage();
  page.on('dialog', (dialog) => {
    if (dialog.type() === 'beforeunload') void dialog.accept();
    else void dialog.dismiss();
  });
  return { actor, token, profile, cards, page, context };
}
async function navigate(page: Page, href: string) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible()) {
    if ((await menu.getAttribute('aria-expanded')) !== 'true') await menu.click();
  }
  await page
    .locator(`#main-navigation a[href="${href}"], #main-navigation a[href="${href}/"]`)
    .first()
    .click();
}
test('protects unsaved decks, recovers after reload, and discards only when requested', async ({
  browser,
}, info) => {
  const c = await player(browser);
  try {
    await c.page.goto('/cards');
    await c.page.goto('/decks');
    await expect(c.page.locator('.builder-hand-slots .playing-card')).toHaveCount(5);
    await c.page.locator('.builder-remove-card').first().click();
    await expect(c.page.locator('.builder-hand-status')).toContainText('Unsaved changes');
    await navigate(c.page, '/cards');
    const warning = c.page.getByRole('dialog', { name: 'Unsaved deck changes' });
    await expect(warning).toBeVisible();
    await expect(
      warning.getByRole('button', { name: 'Save and leave', exact: true }),
    ).toBeEnabled();
    await warning.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(c.page).toHaveURL(/decks/);
    await c.page.reload();
    await expect(c.page.locator('.builder-hand-slots .playing-card')).toHaveCount(4);
    await expect(c.page.locator('.builder-hand-status')).toContainText('Unsaved changes');
    expect((await platform.store.profile(c.actor)).deck).toEqual(c.profile.deck);
    await c.page.goBack();
    await expect(c.page).toHaveURL(/cards/);
    await c.page.goForward();
    await expect(c.page.locator('.builder-hand-slots .playing-card')).toHaveCount(4);
    await expect(c.page.locator('.builder-hand-status')).toContainText('Unsaved changes');
    await navigate(c.page, '/cards');
    await expect(warning).toBeVisible();
    await c.page.screenshot({ path: info.outputPath('unsaved-deck.png'), caret: 'initial' });
    await warning.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await expect(c.page).toHaveURL(/cards/);
    await navigate(c.page, '/decks');
    await expect(c.page.locator('.builder-hand-slots .playing-card')).toHaveCount(5);
    await expect(c.page.locator('.builder-hand-status')).not.toContainText('Unsaved changes');
  } finally {
    await c.context.close();
  }
});
test('keeps a failed save in the editor, then saves once before leaving', async ({ browser }) => {
  const c = await player(browser);
  try {
    await c.page.goto('/decks');
    await expect(c.page.locator('.builder-hand-slots .playing-card')).toHaveCount(5);
    await c.page.locator('.builder-remove-card').first().click();
    await c.page.getByRole('searchbox', { name: 'Find a card', exact: true }).fill(c.cards[5].name);
    await c.page
      .locator('.builder-card-library article')
      .filter({
        has: c.page.getByRole('button', { name: `Inspect ${c.cards[5].name}`, exact: true }),
      })
      .getByRole('button', { name: 'Add to deck', exact: true })
      .click();
    await navigate(c.page, '/cards');
    const warning = c.page.getByRole('dialog', { name: 'Unsaved deck changes' });
    await c.page.route('**/api/deck-loadouts', (route) => route.abort());
    await warning.getByRole('button', { name: 'Save and leave', exact: true }).click();
    await expect(warning.getByRole('alert')).not.toBeEmpty();
    await expect(c.page).toHaveURL(/decks/);
    expect((await platform.store.profile(c.actor)).deck).toEqual(c.profile.deck);
    await c.page.unroute('**/api/deck-loadouts');
    let saves = 0;
    c.page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/deck-loadouts')) saves++;
    });
    await warning.getByRole('button', { name: 'Save and leave', exact: true }).click();
    await expect(c.page).toHaveURL(/cards/);
    expect(saves).toBe(1);
    expect((await platform.store.profile(c.actor)).deck).toEqual(c.profile.deck);
    const result = await platform.app.inject({
      url: '/api/deck-loadouts',
      headers: { authorization: `Bearer ${c.token}` },
    });
    expect(result.json().loadouts[0].cards).toEqual([...c.profile.deck.slice(1), c.cards[5].id]);
  } finally {
    await c.context.close();
  }
});
test('remembers card pagination, scroll and market filters across tabs', async ({ browser }) => {
  const c = await player(browser);
  try {
    await c.page.goto('/cards');
    await expect(c.page.locator('.catalog-grid article')).toHaveCount(24);
    await c.page.getByRole('button', { name: 'Next →', exact: true }).click();
    await expect(c.page.locator('.library-paging > span')).toHaveText(/^2\//);
    await c.page.evaluate(() => scrollTo(0, 600));
    await expect.poll(() => c.page.evaluate(() => scrollY)).toBe(600);
    await navigate(c.page, '/market');
    await expect(c.page.locator('.market-count')).not.toContainText('Loading');
    await c.page.getByLabel('Listing type', { exact: true }).selectOption('sale');
    await c.page.locator('.market-filter-panel summary').click();
    await c.page.getByLabel('Minimum price', { exact: true }).fill('236');
    await navigate(c.page, '/cards');
    await expect(c.page.locator('.library-paging > span')).toHaveText(/^2\//);
    await expect.poll(() => c.page.evaluate(() => scrollY)).toBe(600);
    await navigate(c.page, '/market');
    await expect(c.page.getByLabel('Listing type', { exact: true })).toHaveValue('sale');
    await c.page.locator('.market-filter-panel summary').click();
    await expect(c.page.getByLabel('Minimum price', { exact: true })).toHaveValue('236');
    await expect(c.page.locator('.filter-count')).toHaveText('1');
  } finally {
    await c.context.close();
  }
});
test('ignores a delayed battle response after returning to the menu', async ({ browser }) => {
  const c = await player(browser);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let intercepted!: () => void;
  const held = new Promise<void>((resolve) => {
    intercepted = resolve;
  });
  try {
    const result = await platform.app.inject({
      method: 'POST',
      url: '/api/solo',
      headers: { authorization: `Bearer ${c.token}` },
      payload: {},
    });
    expect(result.statusCode, result.body).toBe(200);
    const { matchId } = result.json();
    await platform.store.resign(c.profile.id, matchId);
    await c.page.goto(`/?match=${matchId}`);
    await c.page.getByRole('button', { name: 'Review board', exact: true }).click();
    await c.page.route(`**/api/matches/${matchId}`, async (route) => {
      const response = await route.fetch();
      intercepted();
      await gate;
      await route.fulfill({ response });
    });
    await platform.app.inject({
      method: 'POST',
      url: '/api/profile/avatar',
      headers: { authorization: `Bearer ${c.token}` },
      payload: { cardId: null },
    });
    await held;
    await c.page.getByRole('button', { name: 'Return to menu', exact: true }).click();
    await expect(c.page.locator('.game-title')).toBeVisible();
    const delivered = c.page.waitForResponse(
      (response) => new URL(response.url()).pathname === `/api/matches/${matchId}`,
    );
    release();
    await (await delivered).finished();
    await c.page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(c.page.locator('.board-cell')).toHaveCount(0);
    await expect(c.page.locator('.game-title')).toBeVisible();
  } finally {
    release();
    await c.context.close();
  }
});

test('keeps filters chosen while the account is still connecting', async ({ browser }) => {
  const c = await player(browser);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = false;
  await c.page.route('**/api/profile', async (route) => {
    if (!held) {
      held = true;
      await gate;
    }
    await route.continue();
  });
  try {
    await c.page.goto('/cards');
    await c.page.getByLabel('Sort by', { exact: true }).selectOption('stats');
    await c.page.getByLabel('Universe', { exact: true }).selectOption('star-rail');
    release();
    await expect(c.page.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
    await expect(c.page.getByLabel('Sort by', { exact: true })).toHaveValue('stats');
    await expect(c.page.getByLabel('Universe', { exact: true })).toHaveValue('star-rail');
  } finally {
    release();
    await c.context.close();
  }
});

test('shows release notes and all navigation destinations on mobile in French', async ({
  browser,
}, info) => {
  const c = await player(browser);
  try {
    await c.page.goto('/');
    await expect(c.page.locator('.title-card')).toHaveCount(5);
    await c.page.getByRole('button', { name: 'Language: English', exact: true }).click();
    await c.page.getByRole('menuitemradio', { name: 'Français', exact: true }).click();
    await c.page
      .getByRole('button', { name: 'Lire les notes de mise à jour', exact: true })
      .click();
    await expect(c.page.getByRole('dialog', { name: 'Nouveautés' })).toContainText('0.1.6');
    await c.page.getByRole('button', { name: 'Retour au jeu', exact: true }).click();
    const menu = c.page.getByRole('button', { name: 'Menu', exact: true });
    if (await menu.isVisible()) {
      await menu.click();
      await expect(c.page.locator('#main-navigation a:visible')).toHaveCount(9);
      const social = (await c.page.locator('.social-launcher').boundingBox())!;
      expect(social.width).toBe(46);
      await c.page.screenshot({
        path: info.outputPath('mobile-navigation-fr.png'),
        caret: 'initial',
      });
      await c.page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
    }
    expect(await c.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await c.context.close();
  }
});

test('fits the narrow admin profile and keeps album names readable in both languages', async ({
  browser,
}) => {
  const c = await player(browser);
  try {
    await platform.moderation.action(c.profile.id, 'promote', 'Isolated layout audit');
    await c.page.setViewportSize({ width: 320, height: 844 });
    await c.page.goto('/profile');
    for (const language of ['en', 'fr']) {
      await c.page.evaluate(
        (language) => localStorage.setItem('triad-language', language),
        language,
      );
      await c.page.reload();
      const review = c.page.locator('.admin-player-review');
      await expect(
        review.getByRole('heading', {
          name: language === 'fr' ? 'Examen administrateur' : 'Administrator review',
        }),
      ).toBeVisible();
      await expect(review.locator('thead').last()).toContainText(
        language === 'fr' ? 'Date' : 'When',
      );
      expect(await c.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      await c.page.goto('/cards');
      await expect(c.page.locator('.catalog-grid article')).toHaveCount(24);
      expect(
        await c.page
          .locator('.album-card-info h2')
          .evaluateAll((names) => names.every((name) => name.scrollWidth <= name.clientWidth + 1)),
      ).toBe(true);
      await c.page.goto('/profile');
    }
  } finally {
    await c.context.close();
  }
});
