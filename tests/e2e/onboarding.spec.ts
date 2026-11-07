import { expect, test } from '@playwright/test';
test('requires the first-duel tutorial, accepts the rulebook, and remembers completion', async ({
  page,
}) => {
  await page.goto('/');
  const tutorial = page.locator('.tutorial-dialog');
  await expect(tutorial).toBeVisible();
  const response = await page.request.post('/api/solo', { data: {} });
  expect(response.status()).toBe(428);
  await tutorial.getByRole('link', { name: 'Read the rulebook instead' }).click();
  await expect(page.getByRole('heading', { name: 'Battle manual', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'I’ve read the rules · Unlock duels' }).click();
  await expect(page.locator('.rulebook-onboarding')).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start match' })).toBeEnabled();
  await expect(tutorial).toHaveCount(0);
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Credits', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.credits-button')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Collection', exact: true })).toBeVisible();
  await page.reload();
  await expect(tutorial).toHaveCount(0);
});
test('restores music-on status after reload and resumes on the next gesture', async ({ page }) => {
  await page.goto('/cards');
  await expect(page.locator('.account-control')).not.toHaveText('Connecting…');
  await page.getByRole('button', { name: 'Music off', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('audio[data-bgm-track="0"]')
        .evaluate((audio: HTMLAudioElement) => audio.currentTime),
    )
    .toBeGreaterThan(0.1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Music on', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Find a card').click();
  await expect
    .poll(() =>
      page
        .locator('audio[data-bgm-track="0"]')
        .evaluate((audio: HTMLAudioElement) => audio.currentTime),
    )
    .toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Music on', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Music off', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
test('explains guest trading, filters offers and opens registration from the notice', async ({
  page,
}) => {
  await page.goto('/market');
  await expect(page.locator('.guest-market-notice')).toContainText('guest');
  const populate = page.getByRole('button', { name: 'Populate with bots' });
  if (await populate.isVisible()) await populate.click();
  await expect(page.locator('.trade-offer').first()).toBeVisible();
  await expect(page.locator('.trade-offer').first().locator('.eligibility-note')).toContainText(
    'account',
  );
  await page.getByLabel('Show', { exact: true }).selectOption('available');
  await expect(page.locator('.trade-offer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.getByLabel('Offered rarity', { exact: true }).selectOption('5');
  const cards = page.locator('.trade-pair>div:first-child .playing-card');
  for (let i = 0; i < (await cards.count()); i++)
    await expect(cards.nth(i)).toHaveClass(/rarity-5/);
  await page.getByRole('button', { name: 'Register or sign in', exact: true }).click();
  await expect(page.locator('.account-dialog')).toBeVisible();
});
test('saves a public profile card and removes artwork inspection from Collection', async ({
  page,
}) => {
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  const select = page.getByLabel('Profile card', { exact: true });
  await expect(select.locator('option').nth(1)).toBeAttached();
  const value = await select.locator('option').nth(1).getAttribute('value');
  await select.selectOption(value!);
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.locator('.profile-portrait .playing-card')).toBeVisible();
  await page.reload();
  await expect(page.locator('.profile-portrait .playing-card')).toBeVisible();
  await page.goto('/collection');
  await expect(page.getByRole('heading', { name: 'Collection', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Inspect artwork/ })).toHaveCount(0);
});
test('requires Closed, Same, Plus and Combo for custom Trade One and keeps added rules', async ({
  page,
}) => {
  await page.goto('/cards');
  await expect(page.locator('.account-control')).not.toHaveText('Connecting…');
  await page.request.post('/api/tutorial/complete', { data: {} });
  const signup = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin: 'http://127.0.0.1:3000' },
    data: {
      name: 'Rule tester',
      email: `rules-${Date.now()}@test.invalid`,
      password: 'rules-test-password-123',
    },
  });
  expect(signup.status()).toBe(200);
  await page.goto('/lobbies');
  await page.getByRole('button', { name: 'Create custom lobby' }).click();
  const trade = page.getByLabel('Trade One', { exact: true });
  await expect(trade).toBeDisabled();
  await page.getByLabel('Visibility', { exact: true }).selectOption('closed');
  await page.getByLabel('Same', { exact: true }).check();
  await page.getByLabel('Plus', { exact: true }).check();
  await expect(trade).toBeDisabled();
  await page.getByLabel('Combo', { exact: true }).check();
  await expect(trade).toBeEnabled();
  await trade.check();
  await page.getByLabel('Elemental', { exact: true }).check();
  await page.getByLabel('Random deck', { exact: true }).check();
  await expect(trade).toBeChecked();
  await page.getByLabel('Plus', { exact: true }).uncheck();
  await expect(trade).toBeDisabled();
  await expect(trade).not.toBeChecked();
  await page.getByLabel('Plus', { exact: true }).check();
  await expect(trade).not.toBeChecked();
  await trade.check();
  await page.getByLabel('Visibility', { exact: true }).selectOption('allOpen');
  await expect(trade).toBeDisabled();
  await expect(trade).not.toBeChecked();
});
