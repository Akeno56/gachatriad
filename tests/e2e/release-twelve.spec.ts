import { test, expect, type Page } from '@playwright/test';
import { openStarterPacks } from './helpers';
import { TRAINING_STEPS } from '../../packages/shared/src/training-duel';
import { applyMove, legalMoves } from '../../packages/engine/src/index';
async function prepared(page: Page, registered = false) {
  await page.goto('/boosters');
  await expect(page.locator('.account-control')).not.toHaveText('Connecting…');
  if (registered) {
    const r = await page.request.post('/api/auth/sign-up/email', {
      headers: { origin: new URL(page.url()).origin },
      data: {
        name: 'Release tester',
        email: `v12-${crypto.randomUUID()}@test.invalid`,
        password: 'release-test-password-123',
      },
    });
    expect(r.status(), await r.text()).toBe(200);
  }
  await openStarterPacks(page);
  await page.request.post('/api/tutorial/complete', { data: {} });
  await page.reload();
}

test('disables rematch and clears a pending request when the opponent leaves the result', async ({
  page,
}, info) => {
  await prepared(page);
  const context = await page
    .context()
    .browser()!
    .newContext({ baseURL: new URL(page.url()).origin });
  const other = await context.newPage();
  try {
    await prepared(other);
    const created = await page.request.post('/api/lobbies', {
      data: {
        mode: 'custom',
        allowBots: false,
        tradeRule: 'none',
        rules: { allOpen: true, same: true, plus: true, combo: true },
      },
    });
    expect(created.status(), await created.text()).toBe(200);
    const { lobbyId } = await created.json();
    const joined = await other.request.post(`/api/lobbies/${lobbyId}/join`, { data: {} });
    expect(joined.status(), await joined.text()).toBe(200);
    const { matchId } = await joined.json();
    await page.goto(`/?match=${matchId}`);
    await other.goto(`/?match=${matchId}`);
    await expect(page.locator('.board-cell')).toHaveCount(9);
    await expect(other.locator('.board-cell')).toHaveCount(9);
    expect(
      (await other.request.post(`/api/matches/${matchId}/resign`, { data: {} })).status(),
    ).toBe(200);
    await expect(page.getByRole('button', { name: 'Rematch', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Rematch', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Rematch requested', exact: true }),
    ).toBeDisabled();
    await other.getByRole('link', { name: 'Lobby list', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Rematch', exact: true })).toBeDisabled();
    await expect(page.locator('.rematch-status')).toContainText('left this match');
    await expect(page.locator('.rematch-status')).not.toContainText('Waiting');
    expect(
      (await page.request.post(`/api/matches/${matchId}/rematch`, { data: {} })).status(),
    ).toBe(409);
    await page.screenshot({ path: info.outputPath('departed-rematch-disabled.png') });
  } finally {
    await context.close();
  }
});
test('welcomes a new player with centered starters, then automatically reveals all fifteen cards', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: 'Your first hand starts here' });
  await expect(welcome).toBeVisible();
  await expect(page.locator('.title-roster,.main-chat,.matchmaking-panel')).toHaveCount(0);
  const box = (await welcome.boundingBox())!,
    v = page.viewportSize()!;
  expect(Math.abs(box.x + box.width / 2 - v.width / 2)).toBeLessThan(3);
  expect(Math.abs(box.y + box.height / 2 - v.height / 2)).toBeLessThan(3);
  await page.screenshot({ path: info.outputPath('starter-welcome.png'), fullPage: true });
  await welcome.getByRole('link', { name: 'Open my 3 Starter boosters' }).click();
  const opening = page.locator('.automatic-opening');
  await expect(opening).toBeVisible();
  await expect(opening).toContainText('Booster 1/3');
  await expect(opening.locator('.auto-revealed-card')).toBeVisible();
  await expect(
    opening.getByRole('button', { name: /Next card|Reveal all|Reveal card|Open booster/ }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      opening
        .locator('.auto-revealed-card img')
        .evaluateAll(
          (imgs: HTMLImageElement[]) =>
            imgs.length > 0 && imgs.every((img) => img.complete && img.naturalWidth > 0),
        ),
    )
    .toBe(true);
  await page.screenshot({ path: info.outputPath('automatic-starter-reveal.png') });
  await expect(opening.getByRole('heading', { name: '15 cards added' })).toBeVisible({
    timeout: 45000,
  });
  const p = await (await page.request.get('/api/profile')).json();
  expect(p.starterBoosters).toBe(0);
  expect(p.deck).toHaveLength(5);
  const packs = await (await page.request.get('/api/boosters')).json();
  expect(packs.every((pack: any) => pack.cards.every((c: any) => c.rarity <= 4))).toBe(true);
  await page.screenshot({ path: info.outputPath('starter-results.png') });
  await opening.getByRole('button', { name: 'Continue', exact: true }).click();
  if (info.project.name === 'desktop') {
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      900,
    );
  }
});
test('fits the two purchasable booster types and keeps branding accessible in the sticky header', async ({
  page,
}, info) => {
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 1366, height: 768 });
  await prepared(page);
  await expect(page.locator('.booster-type-tile')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Starter Booster', exact: true })).toHaveCount(0);
  for (const suffix of ['i', 'ii']) {
    await expect(
      page.locator(`.booster-tile-art img[src$="gacha-universe-${suffix}.webp"]`),
    ).toBeVisible();
  }
  await expect(
    page.getByRole('heading', { name: 'Gacha Universe I Booster', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Gacha Universe II Booster', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Complete duels to earn Stellar Prisms/)).toHaveCount(0);
  if (info.project.name === 'desktop')
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      768,
    );
  await page.screenshot({ path: info.outputPath('compact-booster-hall.png'), fullPage: true });
  await page.goto('/cards');
  await page.evaluate(() => scrollTo(0, 700));
  await expect.poll(async () => (await page.locator('.system-bar').boundingBox())!.y).toBe(0);
  await expect(page.getByRole('link', { name: 'Gacha Triad home' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read update notes' })).toBeVisible();
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', /triad-logo.webp/);
});
test('remembers hidden rules separately and provides a ranked Draft queue', async ({ page }) => {
  await prepared(page, true);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Play a game', exact: true })).toBeVisible();
  await page.route('**/api/lobbies', (route) =>
    route.request().method() === 'POST'
      ? route.continue({
          postData: JSON.stringify({ ...route.request().postDataJSON(), allowBots: false }),
        })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Start match (Unranked)', exact: true }).click();
  const rules = page.getByRole('dialog', { name: 'Unranked rules', exact: true });
  await rules.getByLabel('Don’t show me again').check();
  await rules.getByRole('button', { name: 'Join Unranked queue' }).click();
  await page.getByRole('button', { name: 'Leave Unranked queue' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Start match (Unranked)', exact: true }).click();
  await expect(rules).toHaveCount(0);
  await expect(page.getByRole('timer')).toBeVisible();
  await page.getByRole('button', { name: 'Leave Unranked queue' }).click();
  await page.getByRole('button', { name: 'Start Draft (Ranked)', exact: true }).click();
  const draft = page.getByRole('dialog', { name: 'Draft rules · Ranked' });
  await expect(draft).toContainText('temporary');
  await draft.getByRole('button', { name: 'Join Draft queue' }).click();
  await expect(page.getByRole('button', { name: 'Leave Draft (Ranked) queue' })).toBeVisible();
  const profile = await (await page.request.get('/api/profile')).json();
  expect(profile.waitingLobby.mode).toBe('draft');
  await page.getByRole('button', { name: 'Leave Draft (Ranked) queue' }).click();
});
test('fits compact lobby tiles and filters multiple rules together', async ({ page }, info) => {
  await prepared(page);
  const profile = await (await page.request.get('/api/profile')).json();
  const defaults = {
    allOpen: false,
    threeOpen: true,
    same: false,
    plus: true,
    combo: true,
    elemental: true,
  };
  const rows = [
    { id: 'filter-a', name: 'Elemental Plus Combo', rules: defaults },
    { id: 'filter-b', name: 'Elemental Same', rules: { ...defaults, same: true } },
    { id: 'filter-c', name: 'No Elemental', rules: { ...defaults, elemental: false } },
  ].map((row, index) => ({
    ...row,
    hostId: 'filter-other',
    host: index === 2 ? 'LongLobbyHostNameThatMustWrapInsideTheCard' : 'Filter tester',
    mode: 'custom',
    tradeRule: 'none',
    allowBots: false,
    players: index === 2 ? 2 : 1,
    status: index === 2 ? 'playing' : 'waiting',
    matchId: index === 2 ? 'filter-match' : null,
    createdAt: new Date().toISOString(),
  }));
  await page.route('**/api/lobbies', (route) => route.fulfill({ json: rows }));
  await page.goto('/lobbies');
  const tiles = page.locator('.lobby-row');
  await expect(tiles).toHaveCount(3);
  await expect(tiles.first().getByRole('button', { name: 'Join table' })).toBeVisible();
  await expect(tiles.last().getByRole('link', { name: 'Spectate' })).toBeVisible();
  if (info.project.name === 'desktop') {
    for (const [width, height, columns] of [
      [1280, 720, 2],
      [1366, 768, 2],
      [1920, 1080, 3],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => scrollTo(0, 0));
      const grid = await tiles.evaluateAll((elements) => {
        const top = elements[0].getBoundingClientRect().top;
        return {
          firstRow: elements.filter((tile) => tile.getBoundingClientRect().top === top).length,
          allFit: elements.every((tile) => tile.scrollWidth <= tile.clientWidth),
        };
      });
      expect(grid).toEqual({ firstRow: columns, allFit: true });
      for (let n = 0; n < rows.length; n++) await expect(tiles.nth(n)).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: info.outputPath(`lobby-grid-${width}.png`) });
    }
  }
  await page.getByRole('button', { name: 'Elemental: Any', exact: true }).click();
  await page.getByRole('button', { name: 'Same: Any', exact: true }).click();
  await page.getByRole('button', { name: 'Same: Required', exact: true }).click();
  await page.getByRole('button', { name: 'Plus: Any', exact: true }).click();
  await page.getByRole('button', { name: 'Combo: Any', exact: true }).click();
  await expect(page.locator('.lobby-row')).toHaveCount(1);
  await expect(page.locator('.lobby-row')).toContainText('Elemental Plus Combo');
  await page.getByRole('button', { name: 'Clear rules' }).click();
  await expect(page.locator('.lobby-row')).toHaveCount(3);
});
test('plays Same, Plus and Combo flips before a bundled bot reply', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await prepared(page);
  await page.evaluate(() => localStorage.setItem('triad-effects', 'off'));
  const solo = await (await page.request.post('/api/solo', { data: {} })).json();
  const original = await (await page.request.get(`/api/matches/${solo.matchId}`)).json();
  const lesson = TRAINING_STEPS[10];
  const botReply = legalMoves(lesson.after!).find(
    (move) => !applyMove(lesson.after!, move).history.at(-1)?.captures.length,
  )!;
  const view = (state: typeof lesson.before, version: number) => ({
    ...original,
    version,
    seat: 0,
    mode: 'solo',
    rules: state.rules,
    game: {
      ...state,
      hands: state.hands.map((hand) => hand.map((card) => ({ slotId: card.id, card }))),
    },
    score: [5, 5],
  });
  let fixture = view(lesson.before, 10000);
  await page.route(`**/api/matches/${solo.matchId}`, (route) => route.fulfill({ json: fixture }));
  await page.route(`**/api/matches/${solo.matchId}/move`, (route) => {
    fixture = view(applyMove(lesson.after!, botReply), 10002);
    return route.fulfill({ json: fixture });
  });
  try {
    await page.goto(`/?match=${solo.matchId}`);
    await expect(page.locator('.game-shell')).not.toHaveClass(/effects-animated/);
    await page
      .getByTestId('player-card')
      .filter({ hasText: lesson.before.hands[0].find((c) => c.id === lesson.move!.cardId)!.name })
      .click();
    const observed = page.evaluate(
      () =>
        new Promise<
          Array<{
            label: string;
            aboveBoard: boolean;
            owners: Array<string | null | undefined>;
            animation: string;
            flipAnimation?: string;
            edgeRatio?: number;
            startsAt: number;
            flipDelay: number | null;
          }>
        >((resolve) => {
          const see = document.querySelector('.duel-command')!;
          const board = document.querySelector('.board')!;
          const phases: Parameters<typeof resolve>[0] = [];
          const observer = new MutationObserver(() => {
            const splash = board.parentElement!.querySelector('.capture-splash');
            const rotor = board.querySelector('.capture-flip-rotor');
            const current = phases.at(-1);
            if (splash?.textContent && splash.textContent !== current?.label) {
              const label = see.querySelector('.capture-phase-label')!;
              phases.push({
                label: splash.textContent,
                aboveBoard:
                  label.getBoundingClientRect().bottom <= board.getBoundingClientRect().top,
                owners: [0, 3, 5].map((cell) =>
                  board.querySelector(`[data-testid="cell-${cell}"]`)?.getAttribute('data-owner'),
                ),
                animation: getComputedStyle(splash).animationName,
                startsAt: performance.now(),
                flipDelay: null,
              });
            } else if (!splash && current?.flipDelay === null && rotor) {
              current.flipDelay = performance.now() - current.startsAt;
              current.flipAnimation = getComputedStyle(rotor).animationName;
              const flip = rotor
                .getAnimations()
                .find(
                  (animation) =>
                    animation instanceof CSSAnimation &&
                    animation.animationName === 'battle-card-turn',
                );
              if (flip?.effect) {
                const time = flip.currentTime;
                const { delay = 0, duration } = flip.effect.getTiming();
                flip.currentTime = delay;
                const width = rotor.getBoundingClientRect().width;
                flip.currentTime = delay + Number(duration) / 2;
                current.edgeRatio = rotor.getBoundingClientRect().width / width;
                flip.currentTime = time;
              }
              if (current.label === 'COMBO') finish();
            }
          });
          const timeout = setTimeout(finish, 8000);
          function finish() {
            clearTimeout(timeout);
            observer.disconnect();
            resolve(phases);
          }
          observer.observe(document.querySelector('.arena-screen')!, {
            childList: true,
            subtree: true,
          });
        }),
    );
    await page.getByTestId('cell-4').click();
    await page.waitForFunction(() => document.querySelector('.capture-splash.splash-combo'));
    await page.screenshot({ path: info.outputPath('combo-splash.png') });
    const phases = await observed;
    expect(phases.map((phase) => phase.label)).toEqual(['SAME', 'PLUS', 'COMBO']);
    expect(phases.every((phase) => phase.aboveBoard)).toBe(true);
    for (const phase of phases) {
      expect(phase.animation).toBe('capture-splash');
      expect(phase.flipAnimation).toBe('battle-card-turn');
      expect(phase.edgeRatio).toBeLessThan(0.2);
      expect(phase.flipDelay).toBeGreaterThanOrEqual(700);
    }
    expect(phases[0].owners[0]).toBe('1');
    expect(phases[1].owners.slice(1)).toEqual(['0', '1']);
    expect(phases[2].owners).toEqual(['1', '0', '0']);
    const splash = page.locator('.capture-splash');
    await expect(splash).toHaveCount(0);
    for (const cell of [0, 2, 3, 5])
      await expect(page.getByTestId(`cell-${cell}`)).toHaveAttribute('data-owner', '0');
    await expect(page.getByTestId(`cell-${botReply.cell}`).locator('.owned-cpu')).toBeVisible();
  } finally {
    await page.request.post(`/api/matches/${solo.matchId}/resign`, { data: {} });
  }
});
