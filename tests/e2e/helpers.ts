import { expect, type Page } from '@playwright/test';
import { PRESETS } from '../../packages/engine/src/index';
export async function startPractice(page: Page, preset = 'classic') {
  const response = await page.request.post('/api/solo', {
    data: { difficulty: 'easy', rules: PRESETS.find((p) => p.id === preset)!.rules },
  });
  expect(response.status(), await response.text()).toBe(200);
  const match = await response.json();
  await page.goto(`/?match=${match.matchId}`);
}
export async function openSettings(page: Page) {
  if (!(await page.locator('.settings-panel').isVisible()))
    await page.getByRole('button', { name: 'Game settings', exact: true }).click();
}
export async function openStarterPacks(page: Page) {
  await expect(page.locator('.account-control')).not.toHaveText('Connecting…');
  const response = await page.request.get('/api/boosters');
  expect(response.status(), await response.text()).toBe(200);
  for (const pack of (await response.json()) as { id: string; openedAt: string | null }[]) {
    if (!pack.openedAt)
      expect(
        (await page.request.post(`/api/boosters/${pack.id}/open`, { data: {} })).status(),
      ).toBe(200);
  }
  await page.reload();
}
