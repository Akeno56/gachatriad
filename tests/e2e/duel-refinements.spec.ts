import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  createGame,
  applyMove,
  scores,
  STANDARD,
  type Card,
} from '../../packages/engine/src/index';
import type { MatchView } from '../../packages/shared/src/platform';
import { openStarterPacks, openSettings } from './helpers';
const CARDS = JSON.parse(
  readFileSync(new URL('../../data/cards/catalog.json', import.meta.url), 'utf8'),
) as Card[];
const sharp = createRequire(import.meta.url)('sharp') as typeof import('sharp').default;
async function fractionChanged(a: Buffer, b: Buffer) {
  const first = await sharp(a).removeAlpha().raw().toBuffer(),
    second = await sharp(b).removeAlpha().raw().toBuffer();
  expect(first.length).toBe(second.length);
  let changed = 0;
  for (let i = 0; i < first.length; i += 3)
    if (first[i] !== second[i] || first[i + 1] !== second[i + 1] || first[i + 2] !== second[i + 2])
      changed++;
  return changed / (first.length / 3);
}
test('Holo and CRT visibly animate without hover in both OS motion settings and obey the saved effects switch', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/cards');
    await expect(page.locator('.account-control')).not.toHaveText('Connecting…');
    await page.getByLabel('Find a card').fill('Amber');
    await page.getByLabel('Finish', { exact: true }).selectOption('holo');
    await openSettings(page);
    if (await page.getByRole('button', { name: 'CRT filter on', exact: true }).isVisible())
      await page.getByRole('button', { name: 'CRT filter on', exact: true }).click();
    await page.getByRole('button', { name: 'Game settings', exact: true }).click();
    await page.getByRole('button', { name: /Inspect Amber/ }).click();
    await page.mouse.move(0, 0);
    const foil = page.locator('.card-detail .holo-foil'),
      card = page.locator('.card-detail .playing-card');
    await expect(foil).toHaveCSS('animation-name', 'holo-drift');
    await expect(foil).toHaveCSS('animation-duration', '5.25s');
    await expect(card.locator('.card-finish')).toHaveCount(0);
    await expect(foil).toHaveCSS('animation-play-state', 'running');
    await expect
      .poll(() =>
        card.locator('img').evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
      )
      .toBe(true);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const first = await card.screenshot();
    await page.waitForTimeout(450);
    const second = await card.screenshot();
    expect(await fractionChanged(first, second)).toBeGreaterThan(0.08);
    await page.waitForTimeout(450);
    expect(await fractionChanged(second, await card.screenshot())).toBeGreaterThan(0.08);
    await page.screenshot({ path: info.outputPath(`holo-${reducedMotion}.png`) });
    await page.getByRole('button', { name: 'Close card detail' }).click();
    await openSettings(page);
    await page.getByRole('button', { name: 'CRT filter off', exact: true }).click();
    const clip = { x: 1, y: 220, width: 8, height: 150 };
    const lineA = await page.screenshot({ clip });
    await page.waitForTimeout(350);
    const lineB = await page.screenshot({ clip });
    expect(await fractionChanged(lineA, lineB)).toBeGreaterThan(0.1);
    await openSettings(page);
    await page.getByLabel('Animate Holo & CRT', { exact: true }).uncheck();
    await expect(page.locator('.crt-overlay')).toHaveCSS('animation-name', 'none');
    const stillA = await page.screenshot({ clip });
    await page.waitForTimeout(350);
    const stillB = await page.screenshot({ clip });
    expect(await fractionChanged(stillA, stillB)).toBe(0);
    await page.reload();
    await expect(page.locator('.crt-overlay')).toHaveCSS('animation-name', 'none');
    await page.getByLabel('Find a card').fill('Amber');
    await page.getByLabel('Finish', { exact: true }).selectOption('holo');
    await page.getByRole('button', { name: /Inspect Amber/ }).click();
    await expect(page.locator('.card-detail .holo-foil')).toHaveCSS('animation-name', 'none');
    const stoppedCard = page.locator('.card-detail .playing-card');
    await expect
      .poll(() =>
        stoppedCard
          .locator('img')
          .evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
      )
      .toBe(true);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const stoppedA = await stoppedCard.screenshot();
    await page.waitForTimeout(350);
    expect(await fractionChanged(stoppedA, await stoppedCard.screenshot())).toBe(0);
    await page.getByRole('button', { name: 'Close card detail' }).click();
    await openSettings(page);
    await page.getByLabel('Animate Holo & CRT', { exact: true }).check();
    await expect(page.locator('.crt-overlay')).toHaveCSS('animation-name', 'crt-scroll');
  }
});
async function prepared(page: Page) {
  await page.goto('/cards');
  await openStarterPacks(page);
  await page.request.post('/api/tutorial/complete', { data: {} });
}
test('separates matchmaking from practice and hides Join on the host’s table', async ({ page }) => {
  await prepared(page);
  const p = await (await page.request.get('/api/profile')).json();
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Start match (Unranked)', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start match (Ranked)', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Rule preset').locator('option[value="unranked"],option[value="ranked"]'),
  ).toHaveCount(0);
  const response = await page.request.post('/api/lobbies', {
    data: { mode: 'custom', name: 'My test table', allowBots: false },
  });
  expect(response.status()).toBe(200);
  await page.goto('/lobbies');
  const own = page.locator('.lobby-row').filter({ hasText: 'My test table' });
  await expect(own).toContainText(p.name);
  await expect(own.getByRole('button', { name: 'Join table', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close lobby', exact: true }).click();
  await expect(own).toHaveCount(0);
});
test('displays adjusted Elemental values, previews buffs/debuffs and reminds players about an active battle', async ({
  page,
}, info) => {
  await prepared(page);
  const response = await page.request.post('/api/solo', {
    data: { rules: { ...STANDARD, allOpen: true, elemental: true } },
  });
  expect(response.status()).toBe(200);
  const { matchId } = await response.json();
  try {
    const original = (await (
      await page.request.get(`/api/matches/${matchId}`)
    ).json()) as MatchView;
    const robin = CARDS.find((c) => c.name.startsWith('Robin') && c.stats.every((n) => n === 7))!;
    expect(robin).toBeTruthy();
    const wind = CARDS.find((c) => c.element === 'wind' && c.rarity < 4 && c.id !== robin.id)!;
    const filler = CARDS.filter((c) => c.rarity < 4 && c.id !== wind.id && c.id !== robin.id);
    let state = {
      ...createGame(
        [[robin, wind, ...filler.slice(0, 3)], filler.slice(3, 8)],
        { ...STANDARD, allOpen: true, elemental: true },
        () => 0,
      ),
      cellElements: ['water', 'wind', 'fire', null, null, null, null, null, null] as const,
    };
    state = applyMove(state, { player: 0, cardId: robin.id, cell: 0 }) as typeof state;
    state = applyMove(state, { player: 1, cardId: filler[3].id, cell: 8 }) as typeof state;
    const fixture = {
      ...original,
      version: 10000,
      seat: 0,
      game: {
        ...state,
        hands: state.hands.map((h) => h.map((card) => ({ slotId: card.id, card }))),
      },
      score: scores(state),
    };
    await page.route(`**/api/matches/${matchId}`, (r) => r.fulfill({ json: fixture }));
    await page.goto(`/?match=${matchId}`);
    const robinCell = page.getByTestId('cell-0');
    await expect(robinCell.locator('.card-values')).toHaveText('6666');
    await expect(page.locator('.board .cell-cross,.board .cell-coordinate')).toHaveCount(0);
    await robinCell.click();
    await expect(page.locator('.card-detail .card-values')).toHaveText('6666');
    await page.getByRole('button', { name: 'Close card detail' }).click();
    const selected = page.getByTestId('player-card').filter({ hasText: wind.name });
    await expect(selected).toBeEnabled();
    await selected.click();
    await expect(page.getByTestId('cell-1')).toHaveClass(/elemental-preview-buff/);
    await expect(page.getByTestId('cell-2')).toHaveClass(/elemental-preview-penalty/);
    await page.screenshot({ path: info.outputPath('elemental-feedback.png'), fullPage: true });
    await page.getByRole('link', { name: 'Collection', exact: true }).click();
    const reminder = page.locator('.active-battle-reminder');
    await expect(reminder).toBeVisible();
    const box = (await reminder.boundingBox())!,
      viewport = page.viewportSize()!;
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(3);
    expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(3);
    await reminder.getByRole('button', { name: 'Continue browsing' }).click();
    await expect(reminder).not.toBeVisible();
    await page.getByRole('link', { name: 'Cards', exact: true }).click();
    await expect(reminder).toBeVisible();
    await reminder.getByRole('button', { name: 'Go back to the battle' }).click();
    await expect(page.locator('.board-cell')).toHaveCount(9);
  } finally {
    await page.request.post(`/api/matches/${matchId}/resign`, { data: {} });
  }
});
