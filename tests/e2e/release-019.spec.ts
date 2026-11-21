import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPlatform } from '../../apps/server/src/app';
import {
  applyMove,
  createGame,
  legalMoves,
  STANDARD,
  scores,
  type GameState,
} from '../../packages/engine/src/index';
import { randomUUID } from 'node:crypto';
import { CARDS, ALL_CARDS } from '../../packages/shared/src/index';
import { ProfileCustomizations } from '../../apps/server/src/customization';
import { translate } from '../../apps/web/lib/translate';
let platform: Awaited<ReturnType<typeof createPlatform>>,
  origin: string,
  serial = 0;
test.beforeAll(async () => {
  const old = process.env.DATA_DIR;
  process.env.DATA_DIR = await mkdtemp(resolve('.cache/pw-014-'));
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
async function player(browser: Browser, registered = true) {
  const n = ++serial;
  const r = await platform.app.inject({
    method: 'POST',
    url: registered ? '/api/auth/sign-up/email' : '/api/auth/sign-in/anonymous',
    remoteAddress: `198.19.14.${n}`,
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: registered
      ? {
          name: `Journey tester ${n}`,
          email: `release019-${n}@test.invalid`,
          password: 'isolated-release019-password',
        }
      : {},
  });
  expect(r.statusCode, r.body).toBe(200);
  const actor = { ...r.json().user, isAnonymous: !registered },
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

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function french(page: Page) {
  await page.getByRole('button', { name: 'Language: English', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Français', exact: true }).click();
}
async function centeredSeason(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const offset = await page.locator('.season-seal').evaluate((el) => {
    const diamond = el.querySelector('polygon')!.getBBox();
    const number = el.querySelector('text')!.getBBox();
    return {
      x: number.x + number.width / 2 - diamond.x - diamond.width / 2,
      y: number.y + number.height / 2 - diamond.y - diamond.height / 2,
    };
  });
  expect(Math.abs(offset.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(offset.y)).toBeLessThanOrEqual(2);
}

const base = process.env.PREVIEW_BASE_PATH ?? '';
test('saves a wishlist card, buys a private market response, and swaps a weekly objective', async ({
  browser,
}, info) => {
  const buyer = await player(browser),
    seller = await player(browser);
  const card = seller.cards[0];
  try {
    await platform.db.tx(async (sql) => {
      await sql('UPDATE profiles SET prisms=500 WHERE id=$1', [buyer.profile.id]);
      await sql(
        'UPDATE inventory SET quantity=greatest(quantity,2) WHERE profile_id=$1 AND card_id=$2',
        [seller.profile.id, card.id],
      );
    });
    await platform.trades.create(await platform.store.identity(seller.actor), card.id, null, 122);
    await buyer.page.goto(`${base}/cards/`);
    await buyer.page.getByRole('searchbox', { name: 'Find a card' }).fill(card.name);
    const star = buyer.page.getByRole('button', { name: `Wishlist ${card.name}`, exact: true });
    await star.click();
    await expect(star).toHaveAttribute('aria-pressed', 'true');
    await buyer.page.getByRole('link', { name: 'Wishlist', exact: true }).click();
    const wish = buyer.page.locator('.collection-market-card').filter({ hasText: card.name });
    await expect(wish.getByText('Card shop · ◇ 100')).toBeVisible();
    if (info.project.name === 'desktop') {
      for (const [width, height] of [
        [1280, 720],
        [1366, 768],
        [1920, 1080],
      ]) {
        await buyer.page.setViewportSize({ width, height });
        await fits(buyer.page);
        await expect(wish).toBeInViewport({ ratio: 1 });
        await buyer.page.screenshot({ path: info.outputPath(`wishlist-${width}.png`) });
      }
      await buyer.page.setViewportSize({ width: 1280, height: 720 });
    }
    await wish.getByRole('button', { name: 'View listings (1)' }).click();
    await expect(buyer.page.locator('.trade-offer')).toHaveCount(1);
    await buyer.page.getByRole('tab', { name: 'Wishlist', exact: true }).click();
    await wish.getByRole('button', { name: 'Post request' }).click();
    await expect(wish.getByText('Request open')).toBeVisible();
    await seller.page.goto(`${base}/market/?tab=requests`);
    const request = seller.page.locator('.collection-market-card').filter({ hasText: card.name });
    await request.getByRole('button', { name: 'Respond to request' }).click();
    const response = seller.page.getByRole('dialog', { name: 'Respond to request' });
    await response.getByRole('spinbutton', { name: 'Price in Stellar Prisms' }).fill('93');
    await response.getByRole('button', { name: 'Send offer' }).click();
    await expect(request.getByRole('button', { name: 'Cancel response' })).toBeVisible();
    await buyer.page.getByRole('tab', { name: 'Requests', exact: true }).click();
    await buyer.page.getByRole('button', { name: 'Review purchase' }).click();
    const purchase = buyer.page.getByRole('dialog', { name: 'Review purchase' });
    await expect(purchase).toContainText('93 Stellar Prisms');
    await purchase.getByRole('button', { name: 'Confirm purchase' }).click();
    await expect(
      buyer.page.getByText('No open requests. Post one from your wishlist.'),
    ).toBeVisible();
    expect((await platform.store.profile(buyer.actor)).prisms).toBe(407);
    await buyer.page.goto(`${base}/journey/`);
    await buyer.page.getByRole('button', { name: 'Swap objective', exact: true }).click();
    const swap = buyer.page.getByRole('dialog', { name: 'Swap objective' });
    await swap.getByRole('combobox', { name: 'Replace', exact: true }).selectOption('puzzle');
    await swap.getByRole('combobox', { name: 'New objective' }).selectOption('practice');
    await swap.getByRole('button', { name: 'Confirm swap' }).click();
    await expect(buyer.page.locator('.weekly-objective')).toHaveCount(6);
    await expect(buyer.page.locator('[data-objective=practice]')).toBeVisible();
    await expect(buyer.page.getByText('Weekly swap used')).toBeVisible();
    await french(buyer.page);
    await expect(buyer.page.getByText('Remplacement hebdomadaire utilisé')).toBeVisible();
    await buyer.page.goto(`${base}/market/?tab=wishlist`);
    await expect(buyer.page.getByRole('tab', { name: 'Liste de souhaits' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      buyer.page.getByRole('button', { name: 'Retirer de la liste de souhaits' }),
    ).toBeVisible();
    await fits(buyer.page);
  } finally {
    await buyer.context.close();
    await seller.context.close();
  }
});
async function unlock(c: Awaited<ReturnType<typeof player>>) {
  for (const id of ['first-duel', 'first-win', 'combo'])
    await platform.db.read((sql) =>
      sql(
        'INSERT INTO achievement_unlocks(profile_id,achievement_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [c.profile.id, id],
      ),
    );
}
test('saves a themed profile and shows only its public showcase to another player in EN/FR', async ({
  browser,
}, info) => {
  const c = await player(browser),
    visitor = await player(browser),
    errors: string[] = [];
  c.page.on('pageerror', (e) => errors.push(e.message));
  visitor.page.on('pageerror', (e) => errors.push(e.message));
  try {
    await unlock(c);
    await platform.db.read((sql) =>
      sql("INSERT INTO achievement_unlocks(profile_id,achievement_id) VALUES($1,'rated-100')", [
        c.profile.id,
      ]),
    );
    const holo = ALL_CARDS.find((card) => card.baseCardId === c.cards[0].id)!;
    await platform.db.read((sql) =>
      sql(
        'INSERT INTO inventory(profile_id,card_id,quantity) VALUES($1,$2,1) ON CONFLICT(profile_id,card_id) DO UPDATE SET quantity=inventory.quantity+1',
        [c.profile.id, holo.id],
      ),
    );
    await c.page.goto(`${base}/profile/`);
    await c.page.getByRole('button', { name: 'Customize profile', exact: true }).click();
    const editor = c.page.getByRole('dialog', { name: 'Customize profile', exact: true });
    const chooseCard = editor.getByRole('button', { name: 'Choose profile card', exact: true });
    const picker = c.page.getByRole('dialog', { name: 'Choose profile card', exact: true });
    await chooseCard.click();
    const search = picker.getByRole('searchbox', { name: 'Search portraits' });
    await search.fill('no-such-portrait');
    await expect(picker.getByRole('status')).toHaveText('No portraits match your search.');
    await search.fill('');
    await c.page.keyboard.press('Escape');
    await expect(chooseCard).toBeFocused();
    await expect(chooseCard).toContainText('Default emblem');
    await chooseCard.click();
    await search.fill(`${holo.name} holo`);
    const option = picker.locator('.profile-portrait-option').filter({ hasText: 'Holo +1 Top' });
    await expect(option.locator('img')).toBeVisible();
    await expect
      .poll(() => option.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await option.click();
    await expect(picker).not.toBeVisible();
    await expect(chooseCard).toContainText(holo.name);
    await editor
      .getByRole('combobox', { name: 'Equipped title', exact: true })
      .selectOption('card-player');
    await editor.getByLabel('Bio', { exact: true }).fill('Bonjour <b>Triad</b> ♢');
    await editor
      .getByRole('combobox', { name: 'Featured format', exact: true })
      .selectOption('shared-draft');
    await editor.getByRole('tab', { name: 'Showcases', exact: true }).click();
    const showcase = c.page.getByRole('dialog', { name: 'Choose showcase card', exact: true });
    const cardSearch = showcase.getByRole('searchbox', { name: 'Search cards', exact: true });
    const holoTop = showcase.locator('.profile-showcase-option').filter({
      has: c.page.locator('.value-0.holo-bonus-value'),
    });
    for (const [index, featured] of [holo, c.cards[1], c.cards[2]].entries()) {
      const slot = editor.getByRole('button', { name: `Showcase card ${index + 1}`, exact: true });
      await slot.click();
      if (index === 1) {
        await cardSearch.fill(`${holo.name} holo`);
        await expect(holoTop).toHaveCount(0);
      }
      await cardSearch.fill(featured.name + (featured.finish === 'holo' ? ' holo' : ''));
      const standard = showcase.locator('.profile-showcase-option').filter({
        has: c.page.getByText(featured.name, { exact: true }),
        hasNot: c.page.locator('.holo-card'),
      });
      const preview = index === 0 ? holoTop : standard;
      await expect(preview.locator('.card-values .value')).toHaveCount(4);
      await expect
        .poll(() => preview.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);
      await preview.click();
      await expect(slot).toBeFocused();
      await expect(slot).toContainText(featured.name);
    }
    await editor
      .getByRole('combobox', { name: 'Showcase achievement 1', exact: true })
      .selectOption('combo');
    await editor.getByRole('tab', { name: 'Portrait frames', exact: true }).click();
    await expect(
      editor.getByRole('button', { name: 'Regalia portrait frame', exact: true }),
    ).toHaveAttribute('aria-disabled', 'true');
    await expect(
      editor.getByRole('button', { name: 'Classic portrait frame', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await editor.getByRole('button', { name: 'Jade portrait frame', exact: true }).click();
    await c.page.screenshot({
      path: `.cache/release019-frames-${info.project.name}.png`,
      fullPage: true,
    });
    await editor.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(editor).not.toBeVisible();
    await expect(c.page.locator('.profile-portrait .player-avatar')).toHaveClass(/frame-jade/);
    await expect(c.page.locator('.profile-bio')).toHaveText('Bonjour <b>Triad</b> ♢');
    await expect(c.page.locator('.profile-bio b')).toHaveCount(0);
    await expect(c.page.locator('.profile-showcase-cards .playing-card')).toHaveCount(3);
    await expect(c.page.locator('.profile-showcase-cards .holo-card')).toHaveCount(1);
    await c.page.reload();
    await expect(c.page.locator('.profile-portrait .player-avatar')).toHaveClass(/frame-jade/);
    await c.page.screenshot({
      path: `.cache/release019-profile-${info.project.name}.png`,
      fullPage: true,
    });
    await visitor.page.goto(`${base}/profile/?id=${c.profile.id}`);
    await expect(visitor.page.locator('.profile-showcase-cards .playing-card')).toHaveCount(3);
    await expect(
      visitor.page.getByRole('button', { name: 'Customize profile', exact: true }),
    ).toHaveCount(0);
    await expect(visitor.page.getByRole('link', { name: 'Replays', exact: true })).toHaveCount(0);
    await visitor.page.locator('.profile-showcase-cards>button').first().click();
    await expect(visitor.page.locator('dialog.card-detail')).toBeVisible();
    await expect(visitor.page.locator('dialog.card-detail')).toContainText('Holo bonus');
    await visitor.page.getByRole('button', { name: 'Close card detail', exact: true }).click();
    await french(visitor.page);
    if (info.project.name === 'mobile')
      await visitor.page.setViewportSize({ width: 320, height: 740 });
    await fits(visitor.page);
    await visitor.page.screenshot({
      path: `.cache/release019-public-fr-${info.project.name}.png`,
      fullPage: true,
    });
    const saved = (await new ProfileCustomizations(platform.db).view(c.profile.id)).settings;
    expect(saved.featuredCards).toEqual([holo.id, c.cards[1].id, c.cards[2].id]);
    expect(saved.featuredAchievements).toEqual(['combo']);
    expect(saved.featuredMode).toBe('shared-draft');
    expect(errors).toEqual([]);
  } finally {
    await c.context.close();
    await visitor.context.close();
  }
});
test('browses achievement categories and features an earned achievement', async ({
  browser,
}, info) => {
  const c = await player(browser),
    errors: string[] = [];
  c.page.on('pageerror', (e) => errors.push(e.message));
  try {
    await unlock(c);
    await c.page.goto(`${base}/achievements/`);
    await expect(c.page.locator('.achievement-row')).toHaveCount(16);
    await c.page
      .getByRole('navigation', { name: 'Achievement categories' })
      .getByRole('button', { name: /Techniques/ })
      .click();
    await expect(c.page.locator('.achievement-row')).toHaveCount(3);
    await c.page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('earned');
    await expect(c.page.locator('.achievement-row')).toHaveCount(1);
    await c.page.locator('.achievement-row').click();
    let failed = false;
    await c.page.route('**/api/profile/customization', (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      if (!failed) {
        failed = true;
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'That action could not be completed.' }),
        });
      }
      return route.continue();
    });
    await c.page.getByRole('button', { name: 'Feature on profile', exact: true }).click();
    await expect(c.page.locator('.achievement-detail-content [role="alert"]')).toHaveText(
      'That action could not be completed.',
    );
    if (info.project.name === 'desktop')
      await expect(
        c.page.getByRole('button', { name: 'Feature on profile', exact: true }),
      ).toBeInViewport({ ratio: 1 });
    await c.page.getByRole('button', { name: 'Feature on profile', exact: true }).click();
    await expect(
      c.page.getByRole('button', { name: 'Remove from showcase', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await c.page.getByRole('button', { name: 'Remove from showcase', exact: true }).click();
    await expect(
      c.page.getByRole('button', { name: 'Feature on profile', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    if (info.project.name === 'mobile')
      await c.page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await french(c.page);
    if (info.project.name === 'mobile') await c.page.setViewportSize({ width: 320, height: 740 });
    await c.page.locator('.achievement-row').click();
    await fits(c.page);
    await c.page.screenshot({
      path: `.cache/release019-achievements-fr-${info.project.name}.png`,
      fullPage: true,
    });
    const saved = await new ProfileCustomizations(platform.db).view(c.profile.id);
    expect(saved.settings.frameId).toBe('classic');
    expect(saved.settings.featuredAchievements).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await c.context.close();
  }
});
test('protects unsaved profile edits, recovers stale saves and keeps guest customization after registration', async ({
  browser,
}, info) => {
  const c = await player(browser, false);
  try {
    await c.page.goto(`${base}/profile/`);
    await c.page.getByRole('button', { name: 'Customize profile', exact: true }).click();
    const editor = c.page.getByRole('dialog', { name: 'Customize profile', exact: true });
    await editor.getByLabel('Bio', { exact: true }).fill('A saved guest profile.');
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    const warning = c.page.getByRole('dialog', { name: 'Unsaved profile changes', exact: true });
    await expect(warning).toBeVisible();
    await warning.getByRole('button', { name: 'Keep editing', exact: true }).click();
    let blocked = false;
    await c.page.route('**/api/profile/customization', (route) => {
      if (route.request().method() === 'POST' && !blocked) {
        blocked = true;
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Your profile changed. Reload before saving.' }),
        });
      }
      return route.continue();
    });
    await editor.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(editor.getByLabel('Bio', { exact: true })).toHaveValue('A saved guest profile.');
    await expect(editor.locator('[role="alert"]')).toContainText('Your profile changed.');
    await editor.getByRole('button', { name: 'Reload saved profile', exact: true }).click();
    await warning.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await expect(editor.getByLabel('Bio', { exact: true })).toHaveValue('');
    await editor.getByLabel('Bio', { exact: true }).fill('A saved guest profile.');
    await editor.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(editor).not.toBeVisible();
    await c.page
      .getByRole('button', { name: 'Register to keep this profile', exact: true })
      .click();
    const account = c.page.locator('.account-dialog[open]');
    await account.getByLabel('Player name', { exact: true }).fill('New portrait player');
    await account
      .getByLabel('Email', { exact: true })
      .fill(`portrait-guest-${randomUUID()}@test.invalid`);
    await account.getByLabel('Password', { exact: true }).fill('portrait-player-password');
    await account.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(account).toHaveCount(0);
    await expect(c.page.locator('.profile-header h2')).toHaveText('New portrait player');
    await expect(c.page.locator('.profile-bio')).toHaveText('A saved guest profile.');
    await c.page.getByRole('button', { name: 'Customize profile', exact: true }).click();
    await expect(editor.getByLabel('Bio', { exact: true })).toHaveValue('A saved guest profile.');
    await editor.getByLabel('Bio', { exact: true }).fill('Not saved');
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await warning.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await expect(editor).not.toBeVisible();
    await c.page.getByRole('button', { name: 'Customize profile', exact: true }).click();
    await expect(editor.getByLabel('Bio', { exact: true })).toHaveValue('A saved guest profile.');
  } finally {
    await c.context.close();
  }
});
