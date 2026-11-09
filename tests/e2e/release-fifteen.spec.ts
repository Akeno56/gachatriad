import { test, expect } from '@playwright/test';
import { openStarterPacks, startPractice } from './helpers';
test('fits the arena in the viewport with visible chat and clear timeout rules', async ({
  page,
}, info) => {
  await page.goto('/');
  await openStarterPacks(page);
  await page.request.post('/api/tutorial/complete', { data: {} });
  await startPractice(page);
  await expect(page.locator('.board-cell')).toHaveCount(9);
  const sizes =
    info.project.name === 'mobile'
      ? [{ width: 390, height: 844 }]
      : [
          { width: 1920, height: 1080 },
          { width: 1366, height: 768 },
          { width: 1280, height: 720 },
        ];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const board = document.querySelector('.board')!.getBoundingClientRect(),
            last = document
              .querySelector('.player-hand .hand-card:last-child')!
              .getBoundingClientRect();
          return (
            board.bottom <= innerHeight - 20 &&
            board.top >= 0 &&
            last.bottom <= innerHeight - 20 &&
            document.documentElement.scrollHeight <= innerHeight + 2
          );
        });
      })
      .toBe(true);
  }
  await expect(page.locator('.turn-policy')).toContainText('auto-play once');
  if (info.project.name === 'mobile') await page.getByRole('button', { name: /^Chat/ }).click();
  await expect(page.getByRole('region', { name: 'Battle chat', exact: true })).toBeVisible();
  await expect(
    page.locator('.arena-chat-tabs').getByRole('tab', { name: 'General', exact: true }),
  ).toBeVisible();
  await page.locator('.arena-chat-tabs').getByRole('tab', { name: 'Battle', exact: true }).click();
  await expect(
    page.getByText('Bots cannot reply. Use General or Friends to chat with players.'),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('fitted-arena.png') });
});
test('spectates public matches with both hands hidden and live board updates', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  await page.goto('/');
  await openStarterPacks(page);
  await page.request.post('/api/tutorial/complete', { data: {} });
  const second = await browser.newContext(),
    watchContext = await browser.newContext();
  try {
    const b = await second.newPage();
    await b.goto('/');
    await openStarterPacks(b);
    await b.request.post('/api/tutorial/complete', { data: {} });
    const lobby = await (
      await page.request.post('/api/lobbies', {
        data: { mode: 'custom', rules: { allOpen: false }, allowBots: false },
      })
    ).json();
    const join = await b.request.post(`/api/lobbies/${lobby.lobbyId}/join`, { data: {} });
    expect(join.ok(), await join.text()).toBe(true);
    const { matchId } = await join.json();
    const watch = await watchContext.newPage();
    await watch.goto(`/?spectate=${matchId}`);
    await expect(watch.locator('.spectator-screen .board-cell')).toHaveCount(9);
    await expect(watch.locator('.spectator-screen .card-back')).toHaveCount(10);
    await expect(watch.getByRole('button', { name: 'Leave match', exact: true })).toHaveCount(0);
    await expect(watch.locator('.starter-welcome')).not.toBeVisible();
    const view = await (await page.request.get(`/api/matches/${matchId}`)).json();
    const own = view.game.turn === view.seat ? page : b;
    const next = await (await own.request.get(`/api/matches/${matchId}`)).json();
    const cardId = next.game.hands[next.seat][0].card.id;
    const move = await own.request.post(`/api/matches/${matchId}/move`, {
      data: { cardId, cell: 0, version: next.version },
    });
    expect(move.ok(), await move.text()).toBe(true);
    await expect(watch.locator('[data-testid="cell-0"] .playing-card')).toBeVisible();
    expect(
      (await watch.request.post(`/api/matches/${matchId}/resign`, { data: {} })).status(),
    ).toBe(403);
    expect((await watch.request.get(`/api/matches/${matchId}/chat`)).status()).toBe(403);
    await watch.screenshot({ path: info.outputPath('spectator-board.png') });
    await page.request.post(`/api/matches/${matchId}/resign`, { data: {} });
  } finally {
    await second.close();
    await watchContext.close();
  }
});
test('uses clean Ranked and Draft ladder tabs', async ({ page }) => {
  await page.goto('/ladder');
  await expect(page.getByRole('tab', { name: 'Ranked', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Draft', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Draft', exact: true })).toBeVisible();
  await expect(page.getByText(/Registered human players with at least one/)).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Leaderboard' })).toHaveCount(0);
});
test('shows Alpha branding and sorts Cards independently from universe filters', async ({
  page,
}, info) => {
  await page.goto('/cards');
  await expect(page.locator('.system-brand strong')).toHaveText('Gacha Triad');
  await expect(page.locator('.system-brand small')).toHaveText('Alpha');
  await expect(page.locator('.system-brand img')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Universe', exact: true }).selectOption('star-rail');
  await page.getByRole('combobox', { name: 'Sort by', exact: true }).selectOption('stats');
  await expect(page.locator('.album-card-info h2').first()).toHaveText('Aha');
  const values = await page
    .locator('.catalog-grid .card-values')
    .evaluateAll((nodes) =>
      nodes.map((node) =>
        Array.from(node.querySelectorAll('span')).reduce(
          (sum, n) => sum + (n.textContent === 'A' ? 10 : Number(n.textContent)),
          0,
        ),
      ),
    );
  expect(values).toEqual([...values].sort((a, b) => b - a));
  await expect(page.locator('.card-buy-button').first()).toContainText('2500');
  await page.getByRole('combobox', { name: 'Sort by', exact: true }).selectOption('rarity');
  await expect(page.getByRole('combobox', { name: 'Universe', exact: true })).toHaveValue(
    'star-rail',
  );
  await expect(page.getByRole('button', { name: 'Admin: instant win', exact: true })).toHaveCount(
    0,
  );
  for (const rarity of ['1', '2', '3']) {
    await page.getByRole('combobox', { name: 'Rarity', exact: true }).selectOption(rarity);
    for (const finish of ['standard', 'holo']) {
      await page.getByRole('combobox', { name: 'Finish', exact: true }).selectOption(finish);
      const sides = await page.locator('.catalog-grid .card-values .value').allTextContents();
      expect(sides.length).toBeGreaterThan(0);
      expect(
        sides.every(
          (value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 8,
        ),
      ).toBe(true);
    }
  }
  await page.screenshot({ path: info.outputPath('cards-sort-alpha.png') });
});
