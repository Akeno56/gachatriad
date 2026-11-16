import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPlatform } from '../../apps/server/src/app';
import { legalMoves, applyMove } from '../../packages/engine/src/index';
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
async function player(browser: Browser) {
  const n = ++serial;
  const r = await platform.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    remoteAddress: `198.19.14.${n}`,
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: {
      name: `Release tester ${n}`,
      email: `release014-${n}@test.invalid`,
      password: 'isolated-release014-password',
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

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function french(page: Page) {
  await page.getByRole('button', { name: 'Language: English' }).click();
  await page.getByRole('menuitemradio', { name: 'Français', exact: true }).click();
}
test('aligns the three profile ratings in English and narrow French', async ({ browser }, info) => {
  const c = await player(browser);
  try {
    await c.page.goto('/profile');
    const ratings = c.page.locator('.profile-stats > div');
    await expect(ratings).toHaveCount(7);
    const first = await ratings.nth(0).boundingBox();
    for (let n = 1; n < 3; n++)
      expect(Math.abs((await ratings.nth(n).boundingBox())!.y - first!.y)).toBeLessThan(2);
    await fits(c.page);
    await c.page.screenshot({ path: info.outputPath('profile-ratings-en.png'), fullPage: true });
    await french(c.page);
    if (info.project.name === 'mobile') await c.page.setViewportSize({ width: 320, height: 844 });
    await expect(c.page.locator('.profile-stats')).toContainText('Elo du Draft partagé');
    await fits(c.page);
    expect(
      await ratings.evaluateAll((items) =>
        items.every((item) => item.scrollWidth <= item.clientWidth),
      ),
    ).toBe(true);
    for (const number of await ratings.locator('strong').all()) {
      expect(await number.evaluate((item) => getComputedStyle(item).whiteSpace)).toBe('nowrap');
      expect(await number.evaluate((item) => item.scrollWidth <= item.clientWidth)).toBe(true);
    }
    await c.page.screenshot({ path: info.outputPath('profile-ratings-fr.png'), fullPage: true });
  } finally {
    await c.context.close();
  }
});
test('solves the daily puzzle through the UI, saves one reward and shows the French leaderboard', async ({
  browser,
}, info) => {
  const c = await player(browser);
  try {
    const before = (await platform.store.profile(c.actor)).prisms;
    await c.page.goto('/puzzle');
    await c.page.getByRole('button', { name: 'Reveal today’s puzzle', exact: true }).click();
    await expect(c.page.locator('.puzzle-board button')).toHaveCount(9);
    await fits(c.page);
    await c.page.screenshot({ path: info.outputPath('daily-puzzle-en.png'), fullPage: true });
    for (let step = 0; step < 2; step++) {
      const m = await platform.puzzles.view(c.profile.id, true, c.actor.id);
      const move = legalMoves(m.state!)
        .map((move) => ({ move, value: puzzleValue(applyMove(m.state!, move)) }))
        .sort((a, b) => b.value - a.value)[0].move;
      const index = m.state!.hands[0].findIndex((card) => card.id === move.cardId);
      await c.page.locator('.puzzle-hand').first().locator('button').nth(index).click();
      const response = c.page.waitForResponse(
        (r) => r.url().endsWith('/puzzles/daily/move') && r.request().method() === 'POST',
      );
      await c.page.getByTestId(`puzzle-cell-${move.cell}`).click();
      expect((await response).status()).toBe(200);
      await expect(c.page.locator('.puzzle-table [role="status"]')).toHaveText(
        step === 0 ? 'Choose a card from your hand.' : 'Puzzle solved!',
      );
    }
    await expect(c.page.locator('.puzzle-outcome')).toContainText(
      'Today’s reward has been claimed.',
    );
    expect((await platform.store.profile(c.actor)).prisms - before).toBe(100);
    await expect(c.page.locator('.puzzle-leaderboard tbody')).toContainText(c.profile.name);
    await c.page.reload();
    await expect(c.page.locator('.puzzle-outcome')).toContainText(
      'Today’s reward has been claimed.',
    );
    await french(c.page);
    await expect(c.page.locator('.puzzle-page h1')).toHaveText('Énigme Triad du jour');
    if (info.project.name === 'mobile') await c.page.setViewportSize({ width: 320, height: 844 });
    await fits(c.page);
    await c.page.screenshot({
      path: info.outputPath('daily-puzzle-solved-fr.png'),
      fullPage: true,
    });
    await c.page.locator('.puzzle-outcome .outline-button').click();
    await expect(c.page.locator('.puzzle-hand').first().locator('button')).toHaveCount(2);
    expect((await platform.store.profile(c.actor)).prisms - before).toBe(100);
  } finally {
    await c.context.close();
  }
});
test('offers both ranked Draft queues, handles shared picks and displays separate ladder tabs', async ({
  browser,
}, info) => {
  test.setTimeout(90000);
  const a = await player(browser),
    b = await player(browser);
  try {
    await a.page.goto('/');
    await expect(
      a.page.getByRole('button', { name: 'Start Draft (Ranked)', exact: true }),
    ).toBeVisible();
    await a.page.getByRole('button', { name: 'Start Shared Draft (Ranked)', exact: true }).click();
    const dialog = a.page.getByRole('dialog', { name: 'Shared Draft rules · Ranked' });
    await expect(dialog).toContainText('20 different cards');
    await dialog.getByRole('button', { name: 'Join Shared Draft queue', exact: true }).click();
    await expect(a.page.locator('.queue-status')).toContainText('Shared Draft');
    await fits(a.page);
    await a.page.screenshot({ path: info.outputPath('shared-draft-queue-en.png'), fullPage: true });
    const { matchId } = await platform.store.createLobby(b.profile, { mode: 'shared-draft' });
    await a.page.goto(`/?match=${matchId}`);
    await b.page.goto(`/?match=${matchId}`);
    await expect(a.page.locator('.draft-pack-track > span')).toHaveCount(4);
    await a.page.getByRole('button', { name: 'Skip opening animation', exact: true }).click();
    await b.page.getByRole('button', { name: 'Skip opening animation', exact: true }).click();
    await expect(a.page.locator('.shared-pool button')).toHaveCount(20);
    await expect(b.page.locator('.shared-pool button')).toHaveCount(20);
    const offered = a.page.locator('.shared-pool button').first();
    expect(
      (await offered.boundingBox())!.height -
        (await offered.locator('.playing-card').boundingBox())!.height,
    ).toBeLessThanOrEqual(24);
    for (let n = 0; n < 10; n++) {
      const m = await platform.store.view(a.profile.id, matchId!);
      const person = m.sharedDraft!.turn === 0 ? a : b;
      await expect(person.page.locator('.shared-pick-status strong')).toHaveText('Your pick');
      await person.page.locator('.shared-pool button:enabled').first().click();
      const confirm = person.page.getByRole('button', { name: 'Confirm pick', exact: true });
      if (n === 0) {
        await confirm.scrollIntoViewIfNeeded();
        const box = (await confirm.boundingBox())!,
          launcher = (await person.page.locator('.social-launcher').boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(launcher.y);
        await person.page.screenshot({ path: info.outputPath('shared-confirm-en.png') });
      }
      await confirm.click();
      if (n === 1) {
        await expect(a.page.locator('.shared-pool .is-taken')).toHaveCount(2);
        await a.page.reload();
        await expect(a.page.locator('.shared-pool .is-taken')).toHaveCount(2);
        await fits(a.page);
        await a.page.screenshot({ path: info.outputPath('shared-picks-en.png'), fullPage: true });
      }
      if (n < 9)
        await expect
          .poll(
            async () =>
              (await platform.store.view(a.profile.id, matchId!)).sharedDraft!.picks.flat().length,
          )
          .toBe(n + 1);
    }
    await expect(a.page.locator('.board')).toBeVisible();
    await fits(a.page);
    await platform.store.resign(b.profile.id, matchId!);
    await a.page.goto('/ladder');
    await expect(a.page.locator('.ladder-tabs button')).toHaveCount(3);
    await a.page.getByRole('tab', { name: 'Shared Draft', exact: true }).click();
    await expect(a.page.locator('.ladder-table tbody')).toContainText(a.profile.name);
    await a.page.getByRole('tab', { name: 'Draft', exact: true }).click();
    await expect(a.page.locator('.ladder-table tbody')).not.toContainText(a.profile.name);
    await french(a.page);
    if (info.project.name === 'mobile') await a.page.setViewportSize({ width: 320, height: 844 });
    await expect(a.page.getByRole('tab', { name: 'Draft partagé', exact: true })).toBeVisible();
    await fits(a.page);
    await a.page.screenshot({ path: info.outputPath('ladder-fr.png'), fullPage: true });
    await a.page.goto('/');
    await a.page
      .getByRole('button', { name: 'Lancer un Draft partagé (Classé)', exact: true })
      .click();
    await expect(a.page.locator('.mode-rules-dialog[open]')).toContainText(
      'Règles du Draft partagé',
    );
    await expect(a.page.locator('#queue-rules-title')).toBeInViewport();
    await fits(a.page);
    await a.page.screenshot({ path: info.outputPath('shared-draft-rules-fr.png'), fullPage: true });
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
