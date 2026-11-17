import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPlatform } from '../../apps/server/src/app';
import {
  legalMoves,
  applyMove,
  seededRandom,
  winner,
  type GameState,
  type Move,
} from '../../packages/engine/src/index';
import { puzzleValue } from '../../apps/server/src/daily-puzzle';
import { CARDS } from '../../packages/shared/src/index';
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
          name: `Release tester ${n}`,
          email: `release014-${n}@test.invalid`,
          password: 'isolated-release014-password',
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

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function french(page: Page) {
  await page.getByRole('button', { name: 'Language: English', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Français', exact: true }).click();
}

test('saves, replaces, copies and activates named decks without changing inventory', async ({
  browser,
}, info) => {
  const c = await player(browser);
  try {
    await c.page.goto('/decks');
    const name = c.page.getByRole('textbox', { name: 'Loadout name', exact: true });
    await expect(name).toBeEnabled();
    await expect(c.page.locator('.builder-hand-slots .playing-card')).toHaveCount(5);
    await name.fill('Corner guard');
    await c.page.getByRole('button', { name: 'Save loadout', exact: true }).click();
    await expect(
      c.page.getByRole('combobox', { name: 'Saved loadout', exact: true }),
    ).not.toHaveValue('');
    let after = await platform.store.profile(c.actor);
    expect(after.deck).toEqual(c.profile.deck);
    expect(after.activeLoadoutId).toBeNull();
    const chosen = c.cards[5];
    await c.page.getByRole('searchbox', { name: 'Find a card', exact: true }).fill(chosen.name);
    const article = c.page
      .locator('.builder-card-library article')
      .filter({ has: c.page.getByRole('button', { name: `Inspect ${chosen.name}`, exact: true }) });
    await article.getByRole('button', { name: 'Replace a card', exact: true }).click();
    const slot = c.page.locator('.builder-hand-slots .builder-slot-card').first();
    await expect(slot).toHaveAttribute(
      'aria-label',
      `Replace ${c.cards[0].name} with ${chosen.name}`,
    );
    await slot.click();
    await c.page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(c.page.locator('.builder-hand-slots .builder-slot-card').first()).toHaveAttribute(
      'aria-label',
      `Inspect ${c.cards[0].name}`,
    );
    await article.getByRole('button', { name: 'Replace a card', exact: true }).click();
    await slot.click();
    await c.page.getByRole('button', { name: 'Save & use', exact: true }).click();
    await expect(c.page.locator('.builder-hand-status')).toContainText('Active deck');
    after = await platform.store.profile(c.actor);
    expect(after.deck).toEqual([chosen.id, ...c.profile.deck.slice(1)]);
    expect(after.inventory).toEqual(c.profile.inventory);
    const activeId = after.activeLoadoutId;
    await c.page.reload();
    await expect(name).toHaveValue('Corner guard');
    await expect(c.page.getByRole('combobox', { name: 'Saved loadout', exact: true })).toHaveValue(
      activeId!,
    );
    await c.page.getByRole('button', { name: 'Make a copy', exact: true }).click();
    await name.fill('Second hand');
    await c.page.getByRole('button', { name: 'Save & use', exact: true }).click();
    await expect(c.page.locator('.builder-hand-status')).toContainText('Active deck');
    await c.page.getByRole('button', { name: 'Delete loadout', exact: true }).click();
    const dialog = c.page.locator('.builder-confirm-dialog[open]');
    await expect(dialog).toContainText('Second hand');
    await dialog.getByRole('button', { name: 'Delete loadout', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    after = await platform.store.profile(c.actor);
    expect(after.activeLoadoutId).toBeNull();
    expect(after.deck).toEqual([chosen.id, ...c.profile.deck.slice(1)]);
    expect(after.inventory).toEqual(c.profile.inventory);
    await c.page
      .getByRole('combobox', { name: 'Saved loadout', exact: true })
      .selectOption(activeId!);
    await expect(name).toHaveValue('Corner guard');
    await c.page.screenshot({ path: info.outputPath('deck-workshop-en.png'), fullPage: true });
    await c.page.getByRole('link', { name: 'Back to play', exact: true }).click();
    await expect(c.page.locator('.tavern-sign')).toBeVisible();
    await expect(c.page.locator('.deck-edit-link')).toHaveAttribute('href', /\/decks\/?$/);
  } finally {
    await c.context.close();
  }
});

test('preserves unsaved work, warns before switching and handles a concurrent saved edit', async ({
  browser,
}) => {
  const c = await player(browser);
  try {
    await c.page.goto('/decks');
    const name = c.page.getByRole('textbox', { name: 'Loadout name', exact: true });
    await expect(name).toBeEnabled();
    await name.fill('My draft');
    await c.page.reload();
    await expect(name).toHaveValue('My draft');
    await c.page.getByRole('button', { name: 'New loadout', exact: true }).click();
    let dialog = c.page.locator('.builder-confirm-dialog[open]');
    await expect(dialog).toContainText('Unsaved loadout changes');
    await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(name).toHaveValue('My draft');
    await c.page.getByRole('button', { name: 'New loadout', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save and switch', exact: true }).click();
    await expect(c.page.locator('.builder-hand-slots .playing-card')).toHaveCount(0);
    await expect(name).not.toHaveValue('My draft');
    const saved = (
      await platform.app.inject({
        url: '/api/deck-loadouts',
        headers: { authorization: `Bearer ${c.token}` },
      })
    ).json().loadouts[0];
    await c.page
      .getByRole('combobox', { name: 'Saved loadout', exact: true })
      .selectOption(saved.id);
    await name.fill('Local edits');
    const remote = await platform.app.inject({
      method: 'POST',
      url: `/api/deck-loadouts/${saved.id}`,
      headers: { origin: 'http://127.0.0.1:3000', authorization: `Bearer ${c.token}` },
      payload: { name: 'Remote version', revision: saved.revision },
    });
    expect(remote.statusCode).toBe(200);
    await c.page.getByRole('button', { name: 'Save loadout', exact: true }).click();
    await expect(c.page.locator('.builder-alert[role=alert]')).toContainText('changed elsewhere');
    await expect(name).toHaveValue('Local edits');
    await c.page.getByRole('button', { name: 'Load latest saved version', exact: true }).click();
    await expect(name).toHaveValue('Remote version');
    await c.page.getByRole('button', { name: 'New loadout', exact: true }).click();
    await expect(c.page.locator('.builder-hand-slots .playing-card')).toHaveCount(0);
    await name.fill('Incomplete');
    await c.page.getByRole('button', { name: 'Save loadout', exact: true }).click();
    await expect(c.page.getByRole('button', { name: 'Use this deck', exact: true })).toBeDisabled();
  } finally {
    await c.context.close();
  }
});

test('fits readable deck slots and the library controls in desktop and narrow French layouts', async ({
  browser,
}, info) => {
  const c = await player(browser);
  try {
    await c.page.goto('/decks');
    await expect(c.page.getByRole('textbox', { name: 'Loadout name', exact: true })).toBeEnabled();
    if (info.project.name === 'desktop')
      for (const [width, height] of [
        [1440, 900],
        [1280, 720],
      ]) {
        await c.page.setViewportSize({ width, height });
        await expect(c.page.locator('.builder-pagination')).toBeInViewport({ ratio: 1 });
        await expect
          .poll(() =>
            c.page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2),
          )
          .toBe(true);
        await expect(
          c.page.locator('.builder-hand-slots .builder-slot-card').last(),
        ).toBeInViewport({ ratio: 1 });
        const box = await c.page.locator('.builder-hand-slots .value').first().boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(20);
        await c.page.screenshot({ path: info.outputPath(`workshop-${width}-${height}.png`) });
      }
    await c.page.getByText('More filters', { exact: true }).click();
    await c.page.getByRole('combobox', { name: 'Card finish', exact: true }).selectOption('holo');
    const holoCount = await c.page.locator('.builder-card-library article').count();
    await expect(c.page.locator('.builder-card-library .holo-card')).toHaveCount(holoCount);
    await c.page.getByRole('button', { name: 'Reset extra filters', exact: true }).click();
    await c.page.keyboard.press('Escape');
    await expect(c.page.locator('.builder-filter-more')).not.toHaveAttribute('open', '');
    await c.page.getByRole('combobox', { name: 'Sort by', exact: true }).selectOption('right');
    const values = await c.page.locator('.builder-card-library .value-1').allTextContents();
    const numeric = values.map((value) => (value === 'A' ? 10 : Number(value)));
    expect(numeric).toEqual([...numeric].sort((a, b) => b - a));
    await c.page.getByRole('tab', { name: 'Deck outlook', exact: true }).click();
    await expect(c.page.locator('.deck-side-row')).toHaveCount(4);
    await c.page.getByText('Corner placement ideas', { exact: true }).click();
    await expect(c.page.locator('.placement-row')).toHaveCount(5);
    await french(c.page);
    if (info.project.name === 'mobile') await c.page.setViewportSize({ width: 320, height: 844 });
    await expect(c.page.locator('.builder-page-heading h1')).toHaveText('Atelier de decks');
    await fits(c.page);
    await c.page.evaluate(() => scrollTo(0, 0));
    await c.page.screenshot({ path: info.outputPath('workshop-analysis-fr.png'), fullPage: true });
    await c.page.getByRole('tab', { name: 'Vos cartes', exact: true }).click();
    await c.page
      .getByRole('searchbox', { name: 'Chercher une carte', exact: true })
      .fill('no-matching-builder-card');
    await expect(c.page.locator('.builder-empty-results')).toBeVisible();
    await c.page.getByRole('button', { name: 'Réinitialiser les filtres', exact: true }).click();
    await expect(c.page.locator('.builder-card-library article').first()).toBeVisible();
    await fits(c.page);
  } finally {
    await c.context.close();
  }
});
