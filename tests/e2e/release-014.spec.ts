import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPlatform } from '../../apps/server/src/app';
import { legalMoves, applyMove, type GameState } from '../../packages/engine/src/index';
import { makePuzzle, puzzleDay, puzzleValue } from '../../apps/server/src/daily-puzzle';
import { bestPuzzleMove } from '../../packages/shared/src/puzzle';
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

test('rotates a captured card for both players in Unranked with system reduced motion', async ({
  browser,
}, info) => {
  const host = await player(browser),
    guest = await player(browser);
  const players = [host, guest];
  try {
    await platform.store.createLobby(host.profile, { mode: 'casual', allowBots: false });
    const { matchId } = await platform.store.createLobby(guest.profile, {
      mode: 'casual',
      allowBots: false,
    });
    // Read the live starting decks so the fixture works whichever player starts.
    const [initial] = await platform.db.read((sql) =>
      sql<{ state: GameState; version: number }>('SELECT state,version FROM matches WHERE id=$1', [
        matchId,
      ]),
    );
    const opening = legalMoves(initial.state).find((move) => {
      const next = applyMove(initial.state, move);
      return legalMoves(next).some(
        (reply) => !!applyMove(next, reply).history.at(-1)?.captures.length,
      );
    })!;
    const afterOpening = applyMove(initial.state, opening);
    const reply = legalMoves(afterOpening).find(
      (move) => !!applyMove(afterOpening, move).history.at(-1)?.captures.length,
    )!;
    await platform.store.move(
      players[opening.player].profile.id,
      matchId!,
      opening.cardId,
      opening.cell,
      initial.version,
    );
    await Promise.all(
      players.map(async ({ page, context }) => {
        await context.addInitScript(() => localStorage.setItem('triad-effects', 'off'));
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(`/?match=${matchId}`);
        await expect(
          page.getByTestId(`cell-${opening.cell}`).locator('.playing-card'),
        ).toBeVisible();
      }),
    );
    const attacker = players[reply.player].page;
    const card = afterOpening.hands[reply.player].find(({ id }) => id === reply.cardId)!;
    await attacker.getByTestId('player-card').filter({ hasText: card.name }).click();
    const flips = Promise.all(
      players.map(async ({ page }) => {
        const cell = page.getByTestId(`cell-${opening.cell}`);
        const rotor = cell.locator('.capture-flip-rotor');
        await expect(rotor).toHaveCSS('animation-name', 'battle-card-turn');
        const rotation = await rotor.evaluate((element) => {
          const animations = element
            .getAnimations({ subtree: true })
            .filter(
              (animation) =>
                animation instanceof CSSAnimation && animation.animationName.startsWith('battle-'),
            );
          const times = animations.map((animation) => animation.currentTime);
          const sample = (time: number) => {
            for (const animation of animations) animation.currentTime = time;
            const rect = element.getBoundingClientRect();
            return {
              width: rect.width,
              bounds: {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                center: rect.left + rect.width / 2,
              },
              oldFace: getComputedStyle(element.querySelector('.capture-flip-old')!).visibility,
              newFace: getComputedStyle(element.querySelector('.capture-flip-new')!).visibility,
            };
          };
          const first = sample(30);
          const edge = sample(300);
          const last = sample(570);
          const resting = sample(0).bounds;
          const cellBounds = element.closest('.board-cell')!.getBoundingClientRect();
          const staysInCell = Array.from({ length: 21 }, (_, i) => sample(i * 30).bounds).every(
            (bounds) =>
              Math.abs(bounds.center - resting.center) < 0.5 &&
              Math.abs(bounds.top - resting.top) < 0.5 &&
              Math.abs(bounds.bottom - resting.bottom) < 0.5 &&
              bounds.left >= cellBounds.left - 0.5 &&
              bounds.right <= cellBounds.right + 0.5 &&
              bounds.top >= cellBounds.top - 0.5 &&
              bounds.bottom <= cellBounds.bottom + 0.5,
          );
          animations.forEach((animation, i) => {
            animation.currentTime = times[i];
          });
          return { first, last, edgeRatio: edge.width / first.width, staysInCell };
        });
        expect(rotation.first).toMatchObject({ oldFace: 'visible', newFace: 'hidden' });
        expect(rotation.last).toMatchObject({ oldFace: 'hidden', newFace: 'visible' });
        expect(rotation.edgeRatio).toBeLessThan(0.2);
        expect(rotation.staysInCell).toBe(true);
        if (page === attacker && info.project.name === 'desktop')
          await page.screenshot({ path: info.outputPath('live-capture-flip.png') });
        await expect(cell.locator('.playing-card')).toHaveCount(1);
        await expect(cell.locator('.playing-card')).toHaveClass(
          page === attacker ? /owned-player/ : /owned-cpu/,
        );
      }),
    );
    await attacker.getByTestId(`cell-${reply.cell}`).click();
    await flips;
    await attacker.getByRole('button', { name: 'Game settings', exact: true }).click();
    const setting = attacker.getByRole('checkbox', { name: 'Animate capture flips', exact: true });
    await expect(setting).toBeChecked();
    await setting.uncheck();
    await attacker.reload();
    await expect(attacker.locator('.game-shell')).not.toHaveClass(/capture-flips-enabled/);
    await attacker.getByRole('button', { name: 'Game settings', exact: true }).click();
    await expect(setting).not.toBeChecked();
  } finally {
    await host.context.close();
    await guest.context.close();
  }
});

test('keeps the complete home chat and composer inside the desktop viewport for guests and accounts', async ({
  browser,
}, info) => {
  test.skip(info.project.name === 'mobile', 'The narrow home layout scrolls normally.');
  test.setTimeout(90000);
  for (const registered of [true, false]) {
    const c = await player(browser, registered);
    const errors: string[] = [];
    c.page.on('pageerror', (error) => errors.push(error.message));
    try {
      await c.page.route('**/api/social', async (route) => {
        const response = await route.fetch();
        const data = await response.json();
        data.chat = Array.from({ length: 16 }, (_, n) => ({
          id: `viewport-chat-${n}`,
          playerId: c.profile.id,
          name: 'Tavern player',
          title: 'Challenger',
          avatar: c.cards[0],
          body: `Short message ${n + 1}.`,
          channel: 'general',
          createdAt: new Date().toISOString(),
        }));
        await route.fulfill({ response, json: data });
      });
      await c.page.goto('/');
      const chat = c.page.locator('.title-screen .main-chat');
      await expect(chat.locator('.chat-message')).toHaveCount(16);
      for (const language of ['en', 'fr']) {
        if (language === 'fr') await french(c.page);
        for (const [width, height] of [
          [1894, 926],
          [1920, 1080],
          [1440, 900],
          [1366, 768],
          [1280, 720],
        ]) {
          await c.page.setViewportSize({ width, height });
          await c.page.evaluate(() => scrollTo(0, 0));
          await expect
            .poll(async () => {
              const box = (await chat.boundingBox())!;
              return Math.abs(box.y + box.height - height + 76);
            })
            .toBeLessThan(2);
          await expect(chat).toBeInViewport({ ratio: 1 });
          await expect(chat.locator('.chat-compose')).toBeInViewport({ ratio: 1 });
          const submit = chat.locator('.chat-compose button');
          expect(
            await submit.evaluate((el) => {
              const box = el.getBoundingClientRect();
              const target = document.elementFromPoint(
                box.x + box.width / 2,
                box.y + box.height / 2,
              );
              return target === el || (!!target && el.contains(target));
            }),
          ).toBe(true);
          const log = chat.locator('.chat-messages');
          expect(await log.evaluate((el) => el.clientHeight)).toBeGreaterThanOrEqual(100);
          await log.evaluate((el) => {
            el.scrollTop = el.scrollHeight;
          });
          expect(await log.evaluate((el) => el.scrollTop > 0)).toBe(true);
          await fits(c.page);
          await c.page.screenshot({
            path: info.outputPath(
              `home-fit-${registered ? 'account' : 'guest'}-${width}-${height}-${language}.png`,
            ),
          });
        }
      }
      expect(errors).toEqual([]);
    } finally {
      await c.context.close();
    }
  }
});

async function french(page: Page) {
  await page.getByRole('button', { name: 'Language: English' }).click();
  await page.getByRole('menuitemradio', { name: 'Français', exact: true }).click();
}
test('highlights the current navigation page with exported trailing-slash URLs', async ({
  browser,
}) => {
  const c = await player(browser);
  try {
    for (const route of [
      '/',
      '/cards',
      '/lobbies',
      '/collection',
      '/market',
      '/boosters',
      '/ladder',
      '/rules',
      '/profile',
      '/achievements',
    ]) {
      await c.page.goto(route === '/' ? '/' : `${route}/`);
      const active = c.page.locator('.system-bar a[aria-current="page"]');
      await expect(active).toHaveCount(1);
      await expect(active).toHaveAttribute('href', route === '/' ? '/' : `${route}/`);
    }
    await french(c.page);
    await c.page.reload();
    await expect(c.page.locator('.system-bar a[aria-current="page"]')).toHaveAttribute(
      'href',
      '/achievements/',
    );
  } finally {
    await c.context.close();
  }
});

test('skips booster animations while waiting for the saved batch and grants its cards only once', async ({
  browser,
}, info) => {
  const c = await player(browser);
  let release = () => {};
  try {
    await platform.store.economy.grant(
      c.profile.id,
      'boosters',
      2,
      crypto.randomUUID(),
      'test-fixture',
    );
    const before = await platform.store.profile(c.actor);
    let calls = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await c.page.route('**/api/boosters/open-batch', async (route) => {
      calls++;
      await gate;
      await route.continue();
    });
    await c.page.goto('/boosters');
    await c.page.getByRole('button', { name: 'Open 2 packs', exact: true }).click();
    const opening = c.page.locator('.automatic-opening');
    await opening.getByRole('button', { name: 'Skip opening animation', exact: true }).click();
    await expect(
      opening.getByRole('button', { name: 'Skip opening animation', exact: true }),
    ).toBeDisabled();
    await expect(opening).not.toHaveAttribute('data-phase', 'summary');
    release();
    await expect(opening).toHaveAttribute('data-phase', 'summary');
    await expect(opening.locator('h2')).toHaveText('10 cards added');
    expect(calls).toBe(1);
    await c.page.waitForTimeout(1800);
    await expect(opening).toHaveAttribute('data-phase', 'summary');
    await c.page.screenshot({
      path: info.outputPath('skipped-booster-results.png'),
      fullPage: true,
    });
    await opening.getByRole('button', { name: 'Continue', exact: true }).click();
    await c.page.reload();
    const after = await platform.store.profile(c.actor);
    const quantity = (inventory: typeof after.inventory) =>
      Object.values(inventory).reduce((total, card) => total + card.quantity, 0);
    expect(quantity(after.inventory) - quantity(before.inventory)).toBe(10);
    expect(after.prisms).toBe(before.prisms);
    await expect(c.page.locator('.automatic-opening')).toHaveCount(0);
    expect(calls).toBe(1);
    await platform.store.economy.grant(
      c.profile.id,
      'boosters',
      1,
      crypto.randomUUID(),
      'test-fixture',
    );
    await c.page.reload();
    await french(c.page);
    await c.page.locator('.booster-type-tile .primary-button').first().click();
    await expect(opening).toHaveAttribute('data-phase', 'reveal');
    await opening
      .getByRole('button', { name: 'Passer l’animation d’ouverture', exact: true })
      .click();
    await expect(opening).toHaveAttribute('data-phase', 'summary', { timeout: 1000 });
    await c.page.screenshot({
      path: info.outputPath('skipped-booster-results-fr.png'),
      fullPage: true,
    });
    await opening.locator('.result-actions .primary-button').click();
    const final = await platform.store.profile(c.actor);
    expect(quantity(final.inventory) - quantity(before.inventory)).toBe(15);
    expect(final.prisms).toBe(before.prisms);
    expect(calls).toBe(2);
  } finally {
    release();
    await c.context.close();
  }
});

test('keeps a saved server connection stable across page reloads', async ({ browser }) => {
  const c = await player(browser),
    errors: string[] = [];
  c.page.on('pageerror', (error) => errors.push(error.message));
  try {
    for (let n = 0; n < 2; n++) {
      if (n === 0) await c.page.goto('/puzzle');
      else await c.page.reload();
      await expect(c.page.locator('.account-control')).toHaveText('Logout');
      await expect(
        c.page.getByRole('button', { name: 'Reveal today’s puzzle', exact: true }),
      ).toBeEnabled();
    }
    expect(errors).toEqual([]);
  } finally {
    await c.context.close();
  }
});
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
      await expect(c.page.locator('.puzzle-turn-status')).toHaveText(
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
test('practises an archived puzzle and reveals the winning line on request', async ({
  browser,
}, info) => {
  const c = await player(browser);
  const day = puzzleDay(Date.now() - 86400000);
  const initial = makePuzzle(42);
  try {
    await platform.db.read((sql) =>
      sql('INSERT INTO daily_puzzles(day,initial_state) VALUES($1,$2::jsonb)', [
        day,
        JSON.stringify(initial),
      ]),
    );
    await c.page.goto('/puzzle');
    await c.page.getByRole('link', { name: 'Puzzle archive', exact: true }).click();
    await expect(c.page.locator('.puzzle-archive time')).toHaveCount(1);
    await c.page.locator(`a:has(time[datetime="${day}"])`).click();
    const cells = c.page.locator('.puzzle-cell .playing-card');
    const hand = c.page.locator('.puzzle-hand').first();
    await expect(cells).toHaveCount(6);
    const review = c.page.locator('.puzzle-first-move');
    await expect(review.locator('ol')).toBeHidden();
    const winning = bestPuzzleMove(initial)!;
    await hand
      .getByRole('button', {
        name: `Select ${initial.hands[0].find((card) => card.id === winning.cardId)!.name}`,
        exact: true,
      })
      .click();
    await c.page.getByTestId(`puzzle-cell-${winning.cell}`).click();
    await expect(cells).toHaveCount(8);
    const state = applyMove(initial, winning);
    const afterReply = applyMove(state, bestPuzzleMove(state)!);
    const last = bestPuzzleMove(afterReply)!;
    await hand.getByRole('button').click();
    await c.page.getByTestId(`puzzle-cell-${last.cell}`).click();
    await expect(c.page.locator('#practice-turn-status')).toHaveText('Victory');
    await c.page.getByRole('button', { name: 'Restart puzzle', exact: true }).click();
    await expect(cells).toHaveCount(6);
    await review.locator('summary').click();
    await expect(review.locator('li')).toHaveCount(3);
    await expect(review).toContainText('Best nonwinning opener');
    await expect(c.page.locator('.puzzle-leaderboard, .puzzle-reward')).toHaveCount(0);
    const before = (await platform.store.profile(c.actor)).prisms;
    expect(before).toBe(c.profile.prisms);
    await french(c.page);
    await expect(review.locator('summary')).toHaveText('Analyse du premier coup');
    if (info.project.name === 'desktop') {
      for (const [width, height] of [
        [1280, 720],
        [1366, 768],
        [1920, 1080],
      ]) {
        await c.page.setViewportSize({ width, height });
        await c.page.evaluate(() => scrollTo(0, 0));
        await fits(c.page);
        await expect(c.page.locator('.puzzle-board')).toBeInViewport({ ratio: 1 });
        await expect(c.page.locator('.puzzle-reserves')).toBeInViewport({ ratio: 1 });
        await c.page.screenshot({ path: info.outputPath(`archive-${width}.png`) });
      }
    } else await fits(c.page);
  } finally {
    await c.context.close();
  }
});
test('shows concise Ranked rules and plays, rematches, and requeues Ranked Random', async ({
  browser,
}, info) => {
  test.setTimeout(90_000);
  const a = await player(browser),
    b = await player(browser);
  const page = a.page;
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Start match (Ranked)', exact: true }).click();
    const ranked = page.getByRole('dialog', { name: 'Ranked rules', exact: true });
    await expect(ranked.locator('.queue-rule-badges span')).toHaveText([
      'Three Open',
      'Same',
      'Plus',
      'Combo',
      'Elemental',
    ]);
    await expect(ranked.locator('.queue-rule-list li')).toHaveCount(2);
    await ranked.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Start match (Unranked)', exact: true }).click();
    const casual = page.getByRole('dialog', { name: 'Unranked rules', exact: true });
    await expect(casual.locator('.queue-rule-badges span')).toHaveText([
      'Three Open',
      'Same',
      'Plus',
      'Combo',
    ]);
    await casual.getByRole('button', { name: 'Cancel', exact: true }).click();
    const start = page.getByRole('button', { name: 'Start match (Ranked Random)', exact: true });
    await start.click();
    const random = page.getByRole('dialog', { name: 'Ranked Random rules', exact: true });
    await expect(random.locator('.queue-rule-list li')).toHaveCount(3);
    await expect(random.locator('.queue-rule-badges span')).toHaveText([
      'Three Open',
      'Same',
      'Plus',
      'Combo',
      'Random',
      'Elemental',
    ]);
    if (info.project.name === 'desktop') {
      for (const [width, height] of [
        [1280, 720],
        [1366, 768],
        [1920, 1080],
      ]) {
        await page.setViewportSize({ width, height });
        await expect(random).toBeInViewport({ ratio: 1 });
        await expect(
          random.getByRole('button', { name: 'Join Ranked Random queue' }),
        ).toBeInViewport({ ratio: 1 });
        await fits(page);
        await page.screenshot({ path: info.outputPath(`ranked-random-en-${width}.png`) });
      }
    }
    await random.getByRole('button', { name: 'Join Ranked Random queue', exact: true }).click();
    await expect(
      page.getByRole('complementary', { name: 'Ranked Random matchmaking queue' }),
    ).toBeVisible();
    const { matchId } = await platform.store.createLobby(b.profile, { mode: 'ranked-random' });
    await page.goto(`/?match=${matchId}`);
    await expect(page.locator('.board.elemental-board .board-cell')).toHaveCount(9);
    await platform.store.resign(b.profile.id, matchId!);
    const result = page.locator('.result-v15[open]');
    await expect(result.locator('.rated-result')).toContainText('+16 Elo');
    await b.page.goto(`/?match=${matchId}`);
    await result.getByRole('button', { name: 'Rematch (no Elo)', exact: true }).click();
    await b.page
      .locator('.result-v15[open]')
      .getByRole('button', { name: 'Accept rematch', exact: true })
      .click();
    await expect
      .poll(async () => (await platform.store.view(a.profile.id, matchId!)).rematch.matchId)
      .not.toBeNull();
    const rematch = (await platform.store.view(a.profile.id, matchId!)).rematch.matchId!;
    await expect(page.locator('.board.elemental-board .board-cell')).toHaveCount(9);
    await platform.store.resign(b.profile.id, rematch);
    await expect(result.locator('.rated-result')).toContainText('No Elo change.');
    await result.getByRole('button', { name: 'Queue again', exact: true }).click();
    await page.getByRole('button', { name: 'Leave Ranked Random queue', exact: true }).click();
    await expect(start).toBeEnabled();
    await french(page);
    await page.setViewportSize(
      info.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 720 },
    );
    await page.getByRole('button', { name: 'Jouer (classé aléatoire)', exact: true }).click();
    const frenchRules = page.getByRole('dialog', {
      name: 'Règles du Classé aléatoire',
      exact: true,
    });
    await expect(frenchRules).toContainText(
      'Un deck valide est tiré de votre collection à chaque partie.',
    );
    await expect(frenchRules).toBeInViewport({ ratio: 1 });
    if (info.project.name === 'desktop') {
      const join = await frenchRules
        .getByRole('button', { name: 'Rejoindre la file' })
        .boundingBox();
      const cancel = await frenchRules.getByRole('button', { name: 'Annuler' }).boundingBox();
      expect(Math.abs(join!.y - cancel!.y)).toBeLessThan(2);
    }
    await fits(page);
    await page.screenshot({ path: info.outputPath('ranked-random-fr.png') });
    await page.goto('/ladder');
    await page.getByRole('tab', { name: 'Classé aléatoire', exact: true }).click();
    await expect(page.getByRole('tabpanel', { name: 'Classé aléatoire' })).toContainText('1016');
  } finally {
    await a.context.close();
    await b.context.close();
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
    await expect(dialog).toContainText('20 shared cards');
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
          social = (await person.page.locator('.system-bar .social-navigation').boundingBox())!;
        expect(social.y + social.height).toBeLessThanOrEqual(box.y);
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
    await expect(a.page.locator('.ladder-tabs').getByRole('tab')).toHaveText([
      'Ranked',
      'Ranked Random',
      'Draft',
      'Shared Draft',
    ]);
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

test('fits the puzzle board, both hands and a scrolling leaderboard at desktop zoom', async ({
  browser,
}, info) => {
  test.skip(
    info.project.name === 'mobile',
    'Desktop viewport budget; mobile workflows are covered separately.',
  );
  test.setTimeout(90000);
  const c = await player(browser);
  const errors: string[] = [];
  c.page.on('pageerror', (error) => errors.push(error.message));
  try {
    await c.page.goto('/puzzle');
    await c.page.getByRole('button', { name: 'Reveal today’s puzzle', exact: true }).click();
    await expect(c.page.locator('.puzzle-board button')).toHaveCount(9);
    const current = await platform.puzzles.view(c.profile.id, true, c.actor.id);
    await platform.db.tx(async (sql) => {
      for (let n = 0; n < 18; n++) {
        const id = `layout-puzzle-${c.profile.id}-${n}`;
        await sql("INSERT INTO profiles(id,name,default_deck) VALUES($1,$2,'[]')", [
          id,
          `Leaderboard long player ${n}`,
        ]);
        await sql(
          'INSERT INTO daily_puzzle_runs(day,profile_id,state,solved_at,solve_attempts,elapsed_ms,rewarded) VALUES($1,$2,$3::jsonb,now(),1,$4,true)',
          [current.day, id, JSON.stringify(current.state), 1000 + n * 137],
        );
      }
    });
    await c.page.getByRole('button', { name: 'Refresh leaderboard', exact: true }).click();
    await expect(c.page.locator('.puzzle-leaderboard tbody tr')).toHaveCount(
      current.leaderboard.length + 18,
    );
    for (const lang of ['en', 'fr']) {
      if (lang === 'fr') await french(c.page);
      for (const [width, height] of [
        [1920, 900],
        [1728, 852],
        [1366, 768],
        [1280, 720],
      ]) {
        await c.page.setViewportSize({ width, height });
        await c.page.evaluate(() => scrollTo(0, 0));
        const boxes = await c.page
          .locator('.puzzle-table, .puzzle-reserves, .puzzle-outcome, .puzzle-leaderboard')
          .evaluateAll((elements) =>
            elements.map((el) => ({
              cls: el.className,
              x: el.getBoundingClientRect().x,
              y: el.getBoundingClientRect().y,
              right: el.getBoundingClientRect().right,
              bottom: el.getBoundingClientRect().bottom,
            })),
          );
        for (const box of boxes) {
          expect(box.bottom, JSON.stringify({ width, height, box })).toBeLessThanOrEqual(
            height - 40,
          );
          expect(box.y).toBeGreaterThanOrEqual(0);
        }
        expect(boxes[1].x).toBeGreaterThanOrEqual(boxes[0].right);
        const board = (await c.page.locator('.puzzle-board').boundingBox())!,
          table = (await c.page.locator('.puzzle-table').boundingBox())!;
        expect(board.x - table.x).toBeLessThanOrEqual(18);
        expect(table.x + table.width - board.x - board.width).toBeLessThanOrEqual(18);
        expect((await c.page.locator('.puzzle-reward').boundingBox())!.height).toBeLessThanOrEqual(
          44,
        );
        expect(
          await c.page
            .locator('.puzzle-board .value')
            .evaluateAll((values) =>
              Math.min(...values.map((value) => value.getBoundingClientRect().height)),
            ),
        ).toBeGreaterThanOrEqual(20);
        expect(
          await c.page.locator('.puzzle-leaderboard-scroll').evaluate((el) => el.clientHeight),
        ).toBeGreaterThanOrEqual(65);
        expect(
          await c.page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2),
        ).toBe(true);
        await fits(c.page);
        await c.page.screenshot({
          path: info.outputPath(`puzzle-fit-${width}-${height}-${lang}.png`),
        });
      }
    }
    expect(
      await c.page
        .locator('.puzzle-leaderboard-scroll')
        .evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    await c.page.locator('.puzzle-hand').first().locator('button').first().click();
    await expect(c.page.locator('.puzzle-board .is-legal').first()).toBeEnabled();
    expect(errors).toEqual([]);
  } finally {
    await c.context.close();
  }
});

test('fits Shared Draft beside usable chat and preserves picks when sorting', async ({
  browser,
}, info) => {
  test.setTimeout(90000);
  const a = await player(browser),
    b = await player(browser),
    errors: string[] = [];
  a.page.on('pageerror', (error) => errors.push(error.message));
  try {
    await platform.store.createLobby(a.profile, { mode: 'shared-draft' });
    const { matchId } = await platform.store.createLobby(b.profile, { mode: 'shared-draft' });
    for (const c of [a, b])
      for (let step = 0; step < 20; step++)
        await platform.store.revealDraft(c.profile.id, matchId!, step);
    await platform.db.read((sql) =>
      sql('UPDATE matches SET shared_draft=$1::jsonb WHERE id=$2', [
        JSON.stringify({ first: 0 }),
        matchId,
      ]),
    );
    await platform.social.postBattle(
      await platform.store.identity(b.actor),
      matchId!,
      'I will draft another option. Which card do you want?',
      crypto.randomUUID(),
    );
    await a.page.goto(`/?match=${matchId}`);
    await expect(a.page.locator('.shared-pool button')).toHaveCount(20);
    const first = a.page.locator('.shared-pool button:enabled').first(),
      id = await first.getAttribute('data-card-id');
    await first.click();
    const sort = a.page.getByLabel('Order draft cards', { exact: true });
    for (const option of ['rarity', 'stats']) {
      await sort.selectOption(option);
      const numbers = await a.page
        .locator('.shared-pool button')
        .evaluateAll(
          (items, attr) => items.map((item) => Number(item.getAttribute(attr))),
          option === 'rarity' ? 'data-rarity' : 'data-total',
        );
      expect(numbers).toEqual([...numbers].sort((x, y) => y - x));
      await expect(a.page.locator(`.shared-pool button[data-card-id="${id}"]`)).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    }
    await sort.selectOption('name');
    await a.page.getByRole('button', { name: 'Inspect selected card', exact: true }).click();
    await expect(a.page.locator('.card-detail[open]')).toBeVisible();
    await a.page.keyboard.press('Escape');
    const names = await a.page
      .locator('.shared-pool button')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-card-name')!));
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y, 'en')));
    await a.page.getByRole('button', { name: 'Confirm pick', exact: true }).click();
    await expect(a.page.locator(`.shared-pool button[data-card-id="${id}"]`)).toBeDisabled();
    if (info.project.name === 'mobile') await a.page.locator('.comms-mobile-toggle').click();
    await expect(a.page.locator('.arena-comms [role="log"]')).toContainText(
      'I will draft another option.',
    );
    await a.page
      .locator('#battle-chat-message')
      .fill('You can take that card. I will choose the next one.');
    await a.page.locator('.arena-comms .chat-compose button').click();
    await expect(a.page.locator('.arena-comms [role="log"]')).toContainText(
      'You can take that card.',
    );
    if (info.project.name === 'mobile') {
      await a.page.locator('.comms-mobile-toggle').click();
      await french(a.page);
      await a.page.setViewportSize({ width: 320, height: 844 });
      await fits(a.page);
      await a.page.locator('.comms-mobile-toggle').click();
      await expect(a.page.locator('#battle-chat-message')).toBeVisible();
      const compose = await a.page.locator('.arena-comms .chat-compose').boundingBox();
      expect(compose!.y + compose!.height).toBeLessThanOrEqual(844 - 50);
      await a.page.screenshot({ path: info.outputPath('shared-chat-mobile-fr.png') });
      expect(errors).toEqual([]);
      return;
    }
    for (const lang of ['en', 'fr']) {
      if (lang === 'fr') await french(a.page);
      for (const [width, height] of [
        [1920, 900],
        [1728, 852],
        [1366, 768],
        [1280, 720],
      ]) {
        await a.page.setViewportSize({ width, height });
        await expect
          .poll(() =>
            a.page.evaluate(() => {
              const bar = document.querySelector('.system-bar')!.getBoundingClientRect().height;
              return Math.abs(
                parseFloat(document.documentElement.style.getPropertyValue('--battle-space')) -
                  (innerHeight - bar - 56),
              );
            }),
          )
          .toBeLessThan(1);
        await a.page.evaluate(() => scrollTo(0, 0));
        const boxes = await a.page.evaluate(() =>
          ['.match', '.arena-comms', '.shared-pick-confirm'].map((selector) => {
            const box = document.querySelector(selector)!.getBoundingClientRect();
            return { x: box.x, right: box.right, y: box.y, bottom: box.bottom };
          }),
        );
        expect(boxes[1].x).toBeGreaterThanOrEqual(boxes[0].right);
        for (const box of boxes)
          expect(box.bottom, JSON.stringify({ width, height, box })).toBeLessThanOrEqual(
            height - 40,
          );
        expect(
          await a.page
            .locator('.shared-pool .value')
            .evaluateAll((values) =>
              Math.min(...values.map((value) => value.getBoundingClientRect().height)),
            ),
        ).toBeGreaterThanOrEqual(20);
        const pickedSlot = await a.page
            .locator('.shared-hand-slot:has(.playing-card)')
            .first()
            .boundingBox(),
          pickedValues = await a.page
            .locator('.shared-hand-slot .card-values')
            .first()
            .boundingBox();
        expect(pickedValues!.x + pickedValues!.width / 2).toBeGreaterThan(
          pickedSlot!.x + pickedSlot!.width / 2,
        );
        expect(
          pickedSlot!.x + pickedSlot!.width - pickedValues!.x - pickedValues!.width,
        ).toBeLessThanOrEqual(8);
        expect(pickedValues!.y).toBeGreaterThan(pickedSlot!.y + 25);
        expect(pickedValues!.x + pickedValues!.width).toBeLessThanOrEqual(
          pickedSlot!.x + pickedSlot!.width,
        );
        expect(
          await a.page
            .locator('.shared-hand-slot .card-values')
            .first()
            .evaluate((el) => getComputedStyle(el).zIndex),
        ).toBe('4');
        const pool = await a.page.locator('.shared-pool').boundingBox();
        for (const button of await a.page.locator('.shared-pool button').all()) {
          const box = (await button.boundingBox())!;
          expect(box.y).toBeGreaterThanOrEqual(pool!.y - 1);
          expect(box.y + box.height).toBeLessThanOrEqual(pool!.y + pool!.height + 1);
        }
        expect(
          await a.page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2),
        ).toBe(true);
        await fits(a.page);
        await a.page.screenshot({
          path: info.outputPath(`shared-fit-${width}-${height}-${lang}.png`),
        });
      }
    }
    expect(errors).toEqual([]);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
