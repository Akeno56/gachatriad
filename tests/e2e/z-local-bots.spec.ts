import { expect, test } from '@playwright/test';
test('populates labeled bots, joins a real bot duel, preserves guest progress and trades', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Shared local population needs one end-to-end run.');
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/lobbies');
  await expect(page.locator('.account-control')).not.toHaveText('Connecting…');
  if (await page.locator('.tutorial-dialog').isVisible()) {
    await page.getByRole('button', { name: /Continue tutorial/ }).click();
    await page.getByRole('button', { name: /Continue tutorial/ }).click();
    await page.getByRole('button', { name: 'I’m ready to play' }).click();
  }
  const populate = page.getByRole('button', { name: 'Populate with bots' });
  if (await populate.isVisible()) await populate.click();
  await expect(page.locator('.local-bots')).toContainText('10 labeled bots');
  await page.getByLabel('Mode', { exact: true }).selectOption('custom');
  await expect(page.locator('.lobby-row').filter({ hasText: '[BOT] Nova' })).toBeVisible();
  const before = (await page.request.get('/api/profile')).json();
  await page
    .locator('.lobby-row')
    .filter({ hasText: '[BOT] Nova' })
    .getByRole('button', { name: 'Join table' })
    .click();
  await expect(page.locator('.board-cell')).toHaveCount(9);
  await expect(page.locator('.cpu-heading')).toContainText('[BOT]');
  const id = new URL(page.url()).searchParams.get('match');
  expect(id).toBeTruthy();
  const rows = await (await page.request.get('/api/lobbies')).json();
  expect(
    rows.some((l: { matchId: string; players: number }) => l.matchId === id && l.players === 2),
  ).toBe(true);
  await expect(page.getByTestId('player-card').first()).toBeEnabled();
  await page.getByTestId('player-card').first().click();
  await page.locator('.board-cell.legal-cell').first().click();
  await expect
    .poll(async () => {
      const m = await (await page.request.get(`/api/matches/${id}`)).json();
      return m.game.history.length;
    })
    .toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: info.outputPath('bot-duel.png'), fullPage: true });
  await page.getByRole('button', { name: 'Leave match' }).click();
  await page.getByRole('button', { name: 'Forfeit match' }).click();
  await expect(page.locator('.result-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Review board' }).click();
  await page.locator('.account-control').click();
  await page.getByLabel('Player name').fill('Local playtester');
  await page.getByLabel('Email', { exact: true }).fill(`playtest-${Date.now()}@test.invalid`);
  await page.getByLabel('Password', { exact: true }).fill('local-test-password-123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('.account-dialog')).not.toBeVisible();
  const after = await (await page.request.get('/api/profile')).json();
  expect(after.id).toBe((await before).id);
  expect(after.registered).toBe(true);
  await page.goto('/market');
  await expect(page.locator('.trade-offer').first()).toBeVisible();
  await expect(page.locator('.trade-offer').first()).toContainText('[BOT]');
  await page.getByText('Post a trade offer', { exact: true }).click();
  const give = 'star-rail:march-7th',
    want = 'genshin:amber';
  await page.getByLabel('You offer', { exact: true }).selectOption(give);
  await page.getByLabel('You request', { exact: true }).selectOption(want);
  await page.getByRole('button', { name: 'Post offer', exact: true }).click();
  await expect
    .poll(
      async () => {
        const p = await (await page.request.get('/api/profile')).json();
        return p.inventory[want]?.quantity ?? 0;
      },
      { timeout: 25000 },
    )
    .toBeGreaterThanOrEqual(2);
  await page.getByRole('link', { name: 'Collection', exact: true }).click();
  await expect(page.locator('.saved-deck')).toContainText('unavailable card');
  await page.getByRole('button', { name: 'Auto build', exact: true }).click();
  await expect(page.locator('.saved-deck')).toContainText('Ready for battle.');
  await page.getByRole('link', { name: 'Achievements', exact: true }).click();
  await expect(
    page.locator('.achievement.is-unlocked').filter({ hasText: 'Card Player' }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('earned-achievements.png'), fullPage: true });
  expect(errors).toEqual([]);
});
