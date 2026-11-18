import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPlatform } from '../../apps/server/src/app';
import { applyMove, createGame, legalMoves, STANDARD } from '../../packages/engine/src/index';
import { randomUUID } from 'node:crypto';
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
          name: `Journey tester ${n}`,
          email: `release017-${n}@test.invalid`,
          password: 'isolated-release017-password',
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
async function readyWeek(c: Awaited<ReturnType<typeof player>>) {
  let state = createGame([c.cards.slice(0, 5), c.cards.slice(0, 5)], STANDARD, () => 0);
  while (state.status !== 'complete') state = applyMove(state, legalMoves(state)[0]);
  for (const mode of ['solo', 'custom', 'solo'])
    await platform.db.read((sql) =>
      sql(
        "INSERT INTO matches(id,mode,player0,state,decks,rules,status,winner,is_draw,completed_at,settlement_done) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,'complete',0,false,now(),true)",
        [
          randomUUID(),
          mode,
          c.profile.id,
          JSON.stringify(state),
          JSON.stringify([c.profile.deck, c.profile.deck]),
          JSON.stringify(STANDARD),
        ],
      ),
    );
  const saved = await platform.app.inject({
    method: 'POST',
    url: '/api/deck-loadouts',
    headers: { authorization: `Bearer ${c.token}` },
    payload: { name: 'Weekly hand', cards: c.profile.deck },
  });
  expect(saved.statusCode).toBe(200);
  await platform.store.economy.grant(
    c.profile.id,
    'boosters',
    2,
    randomUUID(),
    'Weekly browser test',
  );
  for (const pack of await platform.store.economy.list(c.profile.id))
    if (!pack.openedAt) await platform.store.economy.open(c.profile.id, pack.id);
  c.profile = await platform.store.profile(c.actor);
}

test('links the tavern to readable weekly objectives and a persistent bilingual journal', async ({
  browser,
}, info) => {
  const c = await player(browser);
  try {
    await c.page.goto(`${base}/`);
    await expect(c.page.locator('.tavern-sign')).toBeVisible();
    if (info.project.name === 'desktop') {
      await c.page.setViewportSize({ width: 1280, height: 720 });
      await expect(c.page.locator('.main-chat .chat-compose')).toBeInViewport({ ratio: 1 });
    }
    await fits(c.page);
    await c.page.locator('.tavern-journey-link').click();
    await expect(c.page.locator('.weekly-objective')).toHaveCount(6);
    await expect(
      c.page.getByRole('button', { name: 'Claim weekly reward', exact: true }),
    ).toBeDisabled();
    await expect(c.page.locator('.season-banner')).toContainText('The First Gathering');
    await centeredSeason(c.page);
    await expect(c.page.locator('.weekly-count')).toContainText('0 / 5');
    await c.page.screenshot({ path: info.outputPath('weekly-en.png'), fullPage: true });
    await c.page.getByRole('tab', { name: 'Progress', exact: true }).click();
    await expect(c.page.locator('.journal-chapter')).toHaveCount(8);
    await expect(c.page.locator('.journal-chapter.is-complete')).toHaveCount(2);
    const saved = await platform.app.inject({
      method: 'POST',
      url: '/api/deck-loadouts',
      headers: { authorization: `Bearer ${c.token}` },
      payload: { name: 'Journal hand', cards: c.profile.deck },
    });
    expect(saved.statusCode).toBe(200);
    await platform.app.inject({
      method: 'DELETE',
      url: `/api/deck-loadouts/${saved.json().id}`,
      headers: { authorization: `Bearer ${c.token}` },
      payload: { revision: 1 },
    });
    await c.page.getByRole('button', { name: 'Refresh progress', exact: true }).click();
    await expect(c.page.locator('.journal-chapter.is-complete')).toHaveCount(3);
    await french(c.page);
    if (info.project.name === 'mobile') await c.page.setViewportSize({ width: 320, height: 844 });
    await expect(c.page.locator('.journey-page-heading h1')).toHaveText('Journal');
    await fits(c.page);
    const banner = (await c.page.locator('.season-banner').boundingBox())!;
    const seasonLink = (await c.page.locator('.season-banner > a').boundingBox())!;
    expect(seasonLink.x).toBeGreaterThanOrEqual(banner.x);
    expect(seasonLink.x + seasonLink.width).toBeLessThanOrEqual(banner.x + banner.width);
    await c.page.evaluate(() => scrollTo(0, 0));
    await c.page.screenshot({ path: info.outputPath('journal-fr.png'), fullPage: true });
    await c.page.getByRole('tab', { name: 'Progression', exact: true }).focus();
    await c.page.keyboard.press('Home');
    await expect(c.page.getByRole('tab', { name: 'Cette semaine', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await c.page.screenshot({ path: info.outputPath('weekly-fr.png'), fullPage: true });
    await expect(c.page.locator('.season-records article')).toHaveCount(3);
    await fits(c.page);
    await c.page.getByRole('link', { name: 'Retour au jeu', exact: true }).click();
    await expect(c.page.locator('.tavern-sign')).toBeVisible();
    expect(new URL(c.page.url()).pathname).toBe(`${base}/`);
    await c.page.goto(`${base}/ladder/`);
    await expect(c.page.locator('.season-banner')).toBeVisible();
    await centeredSeason(c.page);
    await c.page.screenshot({ path: info.outputPath('ladder-season-fr.png'), fullPage: true });
  } finally {
    await c.context.close();
  }
});

test('recovers a failed reward claim and pays once without changing cards or rating', async ({
  browser,
}, info) => {
  const c = await player(browser);
  try {
    await readyWeek(c);
    await c.page.goto(`${base}/journey/`);
    const claim = c.page.getByRole('button', { name: 'Claim weekly reward', exact: true });
    await expect(claim).toBeEnabled();
    await c.page.route('**/api/journey/weekly/claim', (route) => route.abort());
    await claim.click();
    await expect(c.page.locator('.journey-error')).toBeVisible();
    await expect(claim).toBeEnabled();
    await c.page.unroute('**/api/journey/weekly/claim');
    await claim.click();
    await expect(c.page.locator('.weekly-claimed')).toHaveText('Reward claimed');
    await expect(c.page.locator('.journey-notice')).toContainText('Weekly reward claimed');
    await c.page.reload();
    await expect(c.page.locator('.weekly-claimed')).toHaveText('Reward claimed');
    const after = await platform.store.profile(c.actor);
    expect(after.prisms).toBe(c.profile.prisms + 150);
    expect(after.deck).toEqual(c.profile.deck);
    expect(after.inventory).toEqual(c.profile.inventory);
    expect(after.rating).toBe(c.profile.rating);
    await c.page.screenshot({ path: info.outputPath('weekly-claimed.png'), fullPage: true });
  } finally {
    await c.context.close();
  }
});

test('lets guests explore and register without losing their objective progress', async ({
  browser,
}) => {
  const c = await player(browser, false);
  try {
    await readyWeek(c);
    await c.page.goto(`${base}/journey/`);
    await c.page.getByRole('button', { name: 'Register to claim', exact: true }).click();
    const account = c.page.locator('.account-dialog[open]');
    await account.getByLabel('Player name', { exact: true }).fill('New traveller');
    await account
      .getByLabel('Email', { exact: true })
      .fill(`journey-guest-${randomUUID()}@test.invalid`);
    await account.getByLabel('Password', { exact: true }).fill('new-traveller-password');
    await account.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(account).toHaveCount(0);
    await expect(
      c.page.getByRole('button', { name: 'Claim weekly reward', exact: true }),
    ).toBeEnabled();
    await expect(c.page.locator('.weekly-count')).toContainText('5 / 5');
    await expect(c.page.locator('.weekly-claimed')).toHaveCount(0);
  } finally {
    await c.context.close();
  }
});

test('recovers a progress request and does not poll on every profile update', async ({
  browser,
}) => {
  const c = await player(browser);
  try {
    await c.page.route('**/api/journey', (route) => route.abort());
    await c.page.goto(`${base}/journey/`);
    await expect(c.page.locator('.journey-error')).toBeVisible();
    await c.page.unroute('**/api/journey');
    let loads = 0,
      profiles = 0;
    c.page.on('request', (r) => {
      if (r.url().endsWith('/api/journey')) loads++;
      if (r.url().endsWith('/api/profile')) profiles++;
    });
    await c.page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(c.page.locator('.weekly-objective')).toHaveCount(6);
    await expect(c.page.locator('.journey-error')).toHaveCount(0);
    expect(loads).toBe(1);
    await expect.poll(() => platform.store.isOnline?.(c.profile.id)).toBe(true);
    await platform.app.inject({
      method: 'POST',
      url: '/api/deck',
      headers: { authorization: `Bearer ${c.token}` },
      payload: { cards: c.profile.deck },
    });
    await expect.poll(() => profiles).toBeGreaterThan(0);
    expect(loads).toBe(1);
  } finally {
    await c.context.close();
  }
});
