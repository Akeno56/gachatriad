import { test, expect, type Page } from '@playwright/test';
import { openStarterPacks } from './helpers';
import { TRAINING_STEPS } from '../../packages/shared/src/training-duel';
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
test('fits the three booster types on desktop and uses the supplied logo in the sticky header', async ({
  page,
}, info) => {
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 1366, height: 768 });
  await prepared(page);
  await expect(page.locator('.booster-type-tile')).toHaveCount(3);
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
  await expect(page.locator('.system-brand img')).toHaveAttribute('src', /triad-logo.webp/);
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
  const profile = await (await page.request.get('/api/profile')).json();
  expect(profile.waitingLobby.mode).toBe('draft');
  await page.getByRole('button', { name: 'Leave Draft (Ranked) queue' }).click();
});
test('filters multiple required and excluded lobby rules together', async ({ page }) => {
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
  ].map((row) => ({
    ...row,
    hostId: 'filter-other',
    host: 'Filter tester',
    mode: 'custom',
    tradeRule: 'none',
    allowBots: false,
    players: 1,
    status: 'waiting',
    matchId: null,
    createdAt: new Date().toISOString(),
  }));
  await page.route('**/api/lobbies', (route) => route.fulfill({ json: rows }));
  await page.goto('/lobbies');
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
test('resolves Same then Plus then Combo with centered splashes and staged owners', async ({
  page,
}, info) => {
  await prepared(page);
  const solo = await (await page.request.post('/api/solo', { data: {} })).json();
  const original = await (await page.request.get(`/api/matches/${solo.matchId}`)).json();
  const lesson = TRAINING_STEPS[10];
  const view = (state: typeof lesson.before, version: number) => ({
    ...original,
    version,
    seat: 0,
    mode: 'custom',
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
    fixture = view(lesson.after!, 10001);
    return route.fulfill({ json: fixture });
  });
  try {
    await page.goto(`/?match=${solo.matchId}`);
    await page
      .getByTestId('player-card')
      .filter({ hasText: lesson.before.hands[0].find((c) => c.id === lesson.move!.cardId)!.name })
      .click();
    await page.getByTestId('cell-4').click();
    const splash = page.locator('.capture-splash');
    await expect(splash).toHaveText('SAME');
    await expect(page.getByTestId('cell-0')).toHaveAttribute('data-owner', '1');
    await expect(splash).toHaveText('PLUS');
    await expect(page.getByTestId('cell-3')).toHaveAttribute('data-owner', '0');
    await expect(page.getByTestId('cell-5')).toHaveAttribute('data-owner', '1');
    await expect(splash).toHaveText('COMBO');
    await expect(page.getByTestId('cell-5')).toHaveAttribute('data-owner', '0');
    await expect(page.getByTestId('cell-0')).toHaveAttribute('data-owner', '1');
    const box = (await splash.boundingBox())!,
      v = page.viewportSize()!;
    expect(Math.abs(box.x + box.width / 2 - v.width / 2)).toBeLessThan(3);
    await page.screenshot({ path: info.outputPath('combo-splash.png') });
    await expect(splash).toHaveCount(0);
    for (const cell of [0, 2, 3, 5])
      await expect(page.getByTestId(`cell-${cell}`)).toHaveAttribute('data-owner', '0');
  } finally {
    await page.request.post(`/api/matches/${solo.matchId}/resign`, { data: {} });
  }
});
