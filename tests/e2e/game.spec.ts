import { expect, test, type Page } from '@playwright/test';
import { openStarterPacks } from './helpers';
async function ready(page: Page) {
  await page.goto('/');
  await page.locator('.account-control').filter({ hasNotText: 'Connecting…' }).waitFor();
  await openStarterPacks(page);
  if (await page.locator('.tutorial-dialog').isVisible()) {
    await page.getByRole('button', { name: /Continue tutorial/ }).click();
    await page.getByRole('button', { name: /Continue tutorial/ }).click();
    await page.getByRole('button', { name: 'I’m ready to play' }).click();
  }
  await expect(page.getByRole('button', { name: 'Start match' })).toBeEnabled();
}
async function playToEnd(page: Page) {
  for (let i = 0; i < 5; i++) {
    const result = page.locator('.result-panel');
    await expect(async () =>
      expect(
        (await result.isVisible()) || (await page.getByTestId('player-card').first().isEnabled()),
      ).toBe(true),
    ).toPass({ timeout: 15000 });
    if (await result.isVisible()) break;
    await page.getByTestId('player-card').first().click();
    await page.locator('.board-cell.legal-cell').first().click();
  }
  await expect(page.locator('.result-panel')).toBeVisible();
  await expect(page.locator('.board .playing-card')).toHaveCount(9);
  expect(
    Number(await page.locator('.your-score').innerText()) +
      Number(await page.locator('.cpu-score').innerText()),
  ).toBe(10);
  await expect(page.locator('.match-history li')).toHaveCount(9);
}
test.afterEach(async ({ page }) => {
  await page
    .evaluate(async () => {
      const response = await fetch('/api/profile');
      if (!response.ok) return;
      const p = await response.json();
      if (p.activeMatchId)
        await fetch(`/api/matches/${p.activeMatchId}/resign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
      if (p.waitingLobbyId) await fetch(`/api/lobbies/${p.waitingLobbyId}`, { method: 'DELETE' });
    })
    .catch(() => {});
});
for (const preset of ['unranked', 'standard', 'combo'])
  test(`plays a full ${preset} duel and reconnects`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await ready(page);
    await page.getByLabel('Rule preset').selectOption(preset);
    await page.getByRole('button', { name: 'Start match' }).click();
    await expect(page.locator('.board-cell')).toHaveCount(9);
    if (preset === 'standard') await expect(page.locator('.cpu-hand .card-values')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (info.project.name === 'desktop')
      expect((await page.locator('.board').boundingBox())!.width).toBeGreaterThanOrEqual(620);
    await page.reload();
    await expect(page.locator('.board-cell')).toHaveCount(9);
    await playToEnd(page);
    await page.screenshot({ path: info.outputPath(`completed-${preset}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Play again' }).click();
    await expect(page.locator('.result-panel')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
test('supports keyboard selection, artwork inspection and explicit forfeit', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start match' }).click();
  const first = page.getByTestId('player-card').first();
  await expect(first).toBeEnabled();
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.card-inspector').click();
  await expect(page.locator('.card-detail')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Leave match' }).click();
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await page.getByRole('button', { name: 'Leave match' }).click();
  await page.getByRole('button', { name: 'Forfeit match' }).click();
  await expect(page.locator('.result-panel h2')).toHaveText('Defeat');
});
test('shows owned and missing cards, previews Holo and removes Character Library', async ({
  page,
}, info) => {
  await ready(page);
  await page.goto('/cards');
  await page.getByLabel('Ownership', { exact: true }).selectOption('owned');
  await expect(page.locator('.catalog-grid article').first()).toHaveAttribute('data-owned', 'true');
  await page.getByLabel('Ownership', { exact: true }).selectOption('all');
  const inventory = (await (await page.request.get('/api/profile')).json()).inventory;
  await page.getByLabel('Find a card').fill('Amber');
  await page.getByLabel('Universe', { exact: true }).selectOption('genshin');
  await expect(page.locator('.catalog-grid article')).toHaveCount(1);
  await expect(page.locator('.catalog-grid article')).toHaveAttribute(
    'data-owned',
    inventory['genshin:amber']?.quantity ? 'true' : 'false',
  );
  await expect(page.getByText('Character library', { exact: false })).toHaveCount(0);
  await page.getByLabel('Finish', { exact: true }).selectOption('holo');
  await expect(page.locator('.catalog-grid article')).toHaveAttribute(
    'data-owned',
    inventory['genshin:amber::holo']?.quantity ? 'true' : 'false',
  );
  if (!inventory['genshin:amber::holo']?.quantity)
    await expect(page.locator('.card-unowned')).toHaveCount(1);
  await page.getByRole('button', { name: /Inspect Amber/ }).click();
  await expect(page.locator('.card-detail .holo-foil')).toBeVisible();
  const box = await page.locator('.card-detail').boundingBox(),
    viewport = page.viewportSize()!;
  expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(3);
  expect(Math.abs(box!.y + box!.height / 2 - viewport.height / 2)).toBeLessThan(3);
  await page.screenshot({ path: info.outputPath('holo-detail.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByLabel('Find a card').clear();
  await page.getByLabel('Universe', { exact: true }).selectOption('all');
  await page.getByLabel('Rarity', { exact: true }).selectOption('5');
  await expect(page.locator('.rarity-crown').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('demonstrates the approved-card Plus and two Combo captures', async ({ page }, info) => {
  await ready(page);
  await page.getByRole('button', { name: 'Combo lesson', exact: true }).click();
  for (const cell of [0, 3, 4, 5])
    await expect(page.getByTestId(`lesson-cell-${cell}`)).toHaveAttribute('data-owner', '1');
  await page.getByTestId('lesson-cell-1').click();
  for (const cell of [0, 3, 4, 5])
    await expect(page.getByTestId(`lesson-cell-${cell}`)).toHaveAttribute('data-owner', '0');
  await expect(page.locator('.combo-lesson .reason-combo')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('combo-lesson.png'), fullPage: true });
});
test('fits long card names at desktop and narrow phone widths', async ({ page }, info) => {
  await page.goto('/cards');
  await expect(page.locator('.account-control')).not.toHaveText('Connecting…');
  await page.getByLabel('Find a card').fill('Silver Wolf');
  const name = page.locator('.catalog-grid .card-caption strong').filter({ hasText: 'Lv. 999' });
  await expect(name).toBeVisible();
  for (const width of [info.project.name === 'desktop' ? 1440 : 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => name.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await page.screenshot({ path: info.outputPath('long-card-name.png'), fullPage: true });
});
test('plays the supplied MP3 through an end-to-start crossfade and preserves preferences', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Music on', exact: true }).click();
  await page.getByRole('button', { name: 'Music off', exact: true }).click();
  await expect
    .poll(() =>
      page.locator('audio[data-bgm-track="0"]').evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0.1);
  await page.locator('audio[data-bgm-track="0"]').evaluate((a: HTMLAudioElement) => {
    a.currentTime = a.duration - 3;
  });
  await expect
    .poll(() =>
      page.locator('audio[data-bgm-track="1"]').evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0.1);
  await expect
    .poll(() =>
      page.locator('audio[data-bgm-track="0"]').evaluate((a: HTMLAudioElement) => a.paused),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Music on', exact: true }).click();
  await page.getByRole('button', { name: 'Sound effects on', exact: true }).click();
  await page.getByRole('button', { name: 'CRT filter on', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'CRT filter off', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(
    page.getByRole('button', { name: 'Sound effects off', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
});
test('shows real lobbies, rule filters and a visible custom waiting room', async ({
  page,
}, info) => {
  await ready(page);
  await page.getByRole('link', { name: 'Lobbies', exact: true }).click();
  await page.getByRole('button', { name: 'Create custom lobby' }).click();
  const name = `QA ${info.project.name} ${Date.now()}`;
  await page.getByLabel('Lobby name').fill(name);
  await page.getByLabel('Visibility', { exact: true }).selectOption('allOpen');
  await page.getByLabel('Same', { exact: true }).check();
  await page.getByLabel('Plus', { exact: true }).check();
  await page.getByLabel('Random deck', { exact: true }).check();
  await page.getByRole('button', { name: 'Open lobby · 1/2' }).click();
  await expect(page.locator('.waiting-lobby')).toContainText(name);
  await page.getByLabel('Rule', { exact: true }).selectOption('random');
  await expect(page.locator('.lobby-row').filter({ hasText: name })).toContainText('1/2');
  await expect(page.locator('.lobby-row').filter({ hasText: name })).toContainText('All Open');
  await page.getByRole('button', { name: 'Close lobby' }).click();
  await expect(page.locator('.waiting-lobby')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('lobbies.png'), fullPage: true });
});
test('keeps album, deck, trading post and achievements usable on narrow screens', async ({
  page,
}, info) => {
  await ready(page);
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 950 });
    for (const route of ['/collection', '/market', '/achievements', '/credits', '/profile']) {
      await page.goto(route);
      await expect(page.locator('main h1').first()).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${route} at ${width}`,
      ).toBe(true);
    }
  }
  await page.screenshot({ path: info.outputPath('achievements.png'), fullPage: true });
});
