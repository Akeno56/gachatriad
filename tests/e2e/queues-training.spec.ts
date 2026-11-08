import { test, expect } from '@playwright/test';
import { openStarterPacks } from './helpers';

test('teaches a complete practice duel without changing real progress', async ({ page }, info) => {
  test.setTimeout(90000);
  await page.goto('/');
  await openStarterPacks(page);
  const before = await (await page.request.get('/api/profile')).json();
  const tutorial = page.locator('.guided-tutorial');
  await expect(tutorial).toBeVisible();
  for (let step = 0; step < 15; step++) {
    await expect(tutorial).toHaveAttribute('data-step', String(step));
    if (step === 1) {
      await tutorial.getByRole('button', { name: 'Closed', exact: true }).click();
      await expect(tutorial.locator('.rival-training-hand .card-back')).toHaveCount(5);
      await tutorial.getByRole('button', { name: 'Three Open', exact: true }).click();
      await expect(tutorial.locator('.rival-training-hand .card-back')).toHaveCount(2);
    }
    const choice = tutorial.locator('.training-choice:enabled');
    if (await choice.count()) {
      await choice.click();
      await tutorial.locator('.training-target').click();
    }
    if (step === 13)
      await tutorial
        .getByRole('button', { name: /^Practice taking/ })
        .first()
        .click();
    if (step === 14)
      await tutorial.getByRole('button', { name: 'Draw a training Random hand' }).click();
    await expect(tutorial).toHaveAttribute('data-ready', 'true');
    if (step === 10 || step === 11) {
      await tutorial
        .locator('.capture-flip-rotor')
        .evaluateAll((elements) =>
          Promise.all(
            elements.flatMap((el) => el.getAnimations().map((animation) => animation.finished)),
          ),
        );
      await page.screenshot({ path: info.outputPath(`training-step-${step}.png`), fullPage: true });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await tutorial
      .getByRole('button', { name: step === 14 ? 'I’m ready to play' : /Continue tutorial/ })
      .click();
  }
  await expect(tutorial).toHaveCount(0);
  const after = await (await page.request.get('/api/profile')).json();
  expect(after.tutorialCompleted).toBe(true);
  for (const key of ['inventory', 'prisms', 'played', 'rating', 'deck'])
    expect(after[key]).toEqual(before[key]);
  await page.reload();
  await expect(tutorial).toHaveCount(0);
});

test('confirms Unranked rules, preserves its queue timer after refresh and cancels with X', async ({
  page,
}, info) => {
  await page.goto('/');
  await openStarterPacks(page);
  await page.request.post('/api/tutorial/complete', { data: {} });
  await page.reload();
  await expect(page.getByLabel('Rule preset')).toHaveCount(0);
  await expect(page.getByText('Choose your rival', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play unranked', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Browse lobbies' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start match (Ranked)', exact: true }),
  ).toBeDisabled();
  // Keep this test's real waiting lobby human-only so a populated bot cannot race the timer assertion.
  await page.route('**/api/lobbies', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.continue({
      postData: JSON.stringify({ ...route.request().postDataJSON(), allowBots: false }),
    });
  });
  const start = page.getByRole('button', { name: 'Start match (Unranked)', exact: true });
  await start.click();
  const dialog = page.getByRole('dialog', { name: 'Unranked rules', exact: true });
  await expect(dialog).toContainText('Same · Plus · Combo');
  const b = (await dialog.boundingBox())!,
    v = page.viewportSize()!;
  expect(Math.abs(b.x + b.width / 2 - v.width / 2)).toBeLessThan(3);
  expect(Math.abs(b.y + b.height / 2 - v.height / 2)).toBeLessThan(3);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await (await page.request.get('/api/profile')).json()).waitingLobby).toBeNull();
  await start.click();
  await dialog.getByRole('button', { name: 'Join Unranked queue' }).click();
  const timer = page.getByRole('timer');
  await expect(timer).toHaveText(/In queue for : 00:0[1-9]/);
  const before = (await (await page.request.get('/api/profile')).json()).waitingLobby;
  expect(before.mode).toBe('casual');
  expect(before.invited).toBe(false);
  await page.reload();
  await expect(timer).toHaveText(/In queue for : \d+:\d+/);
  expect((await (await page.request.get('/api/profile')).json()).waitingLobby).toEqual(before);
  await page.screenshot({ path: info.outputPath('matchmaking-queue.png'), fullPage: true });
  await page.getByRole('button', { name: 'Leave Unranked queue' }).click();
  await expect(start).toBeEnabled();
  expect((await (await page.request.get('/api/profile')).json()).waitingLobby).toBeNull();
});

test('remembers the Allow bots preference when creating another custom lobby', async ({ page }) => {
  await page.goto('/cards');
  await openStarterPacks(page);
  await page.request.post('/api/tutorial/complete', { data: {} });
  await page.goto('/lobbies');
  await page.getByRole('button', { name: 'Create custom lobby' }).click();
  const bots = page.getByLabel('Allow bots to join my lobby / queue', { exact: true });
  await bots.check();
  await page.reload();
  await page.getByRole('button', { name: 'Create custom lobby' }).click();
  await expect(bots).toBeChecked();
  await bots.uncheck();
  await page.reload();
  await page.getByRole('button', { name: 'Create custom lobby' }).click();
  await expect(bots).not.toBeChecked();
});
