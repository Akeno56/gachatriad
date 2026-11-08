import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
export async function checkEconomy({ page, client, api, admin, origin }) {
  const catalog = JSON.parse(await readFile('data/cards/catalog.json', 'utf8'));
  await admin.getByLabel('Selected user', { exact: true }).selectOption(client.profile.id);
  await admin.getByLabel('Grant', { exact: true }).selectOption('prisms');
  await admin.getByLabel('Amount', { exact: true }).fill('15000');
  await admin.getByRole('button', { name: 'Grant to selected user', exact: true }).click();
  await expect
    .poll(async () => (await api(client, '/profile')).prisms)
    .toBeGreaterThanOrEqual(15000);
  await page.goto(origin + '/gachatriad/boosters');
  await page.getByRole('button', { name: 'Claim daily booster', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Claimed today', exact: true })).toBeDisabled();
  const before = await api(client, '/profile');
  await page.getByRole('button', { name: 'Buy booster', exact: true }).click();
  await page.getByLabel('Booster quantity', { exact: true }).fill('10');
  await expect(page.getByRole('dialog', { name: 'Buy boosters' })).toContainText(
    'Spend 1500 Stellar Prisms',
  );
  await page.getByRole('button', { name: 'Confirm purchase', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open standard booster (10 available)', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.booster-count').filter({ hasText: '×10' })).toBeVisible();
  assert.equal((await api(client, '/profile')).prisms, before.prisms - 1500);
  await page.screenshot({ path: 'docs/screenshots/v08-booster-stacks.png', fullPage: true });
  await page.getByRole('button', { name: 'Open ×10', exact: true }).click();
  await page.getByRole('button', { name: 'Open 10 boosters', exact: true }).click();
  const batch = page.locator('.batch-opening');
  await expect(batch.getByRole('heading', { name: '50 cards added', exact: true })).toBeVisible();
  await expect(batch.locator('.batch-card-grid .playing-card').first()).toBeVisible();
  assert.equal(
    Object.values((await api(client, '/profile')).inventory).reduce((s, c) => s + c.quantity, 0),
    Object.values(before.inventory).reduce((s, c) => s + c.quantity, 0) + 50,
  );
  await batch.locator('.batch-card-grid').evaluate(async (el) => {
    await Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  await page.screenshot({ path: 'docs/screenshots/v08-open-ten.png' });
  await batch.getByRole('button', { name: 'Keep cards', exact: true }).click();
  const purchased = await api(client, '/boosters/buy', {
    quantity: 50,
    requestId: 'crafting-browser-fixture',
  });
  for (let i = 0; i < 5; i++)
    await api(client, '/boosters/open-batch', {
      packIds: purchased.packs.slice(i * 10, (i + 1) * 10).map((p) => p.id),
    });
  const fresh = await api(client, '/boosters/buy', {
    quantity: 5,
    requestId: 'open-five-browser-fixture',
  });
  await page.reload();
  await page.getByRole('button', { name: 'Open ×5', exact: true }).click();
  await page.getByRole('button', { name: 'Open 5 boosters', exact: true }).click();
  await expect(page.getByRole('heading', { name: '25 cards added', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep cards', exact: true }).click();
  const p = await api(client, '/profile');
  const spares = catalog
    .filter((c) => c.rarity === 1)
    .reduce(
      (s, c) =>
        s +
        Math.max(
          0,
          Math.min((p.inventory[c.id]?.quantity ?? 0) - 1, p.inventory[c.id]?.available ?? 0),
        ),
      0,
    );
  assert.ok(spares >= 6, 'Not enough random duplicate fixtures for a recycle plus Trade Up.');
  await page.goto(origin + '/gachatriad/collection');
  const tools = page.locator('.duplicate-tools');
  await tools.locator('summary').click();
  const first = tools.locator('.duplicate-row input').first();
  await first.fill('1');
  await tools.getByRole('button', { name: 'Recycle selected', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cards recycled', exact: true })).toBeVisible();
  await expect(page.locator('.duplicate-dialog')).toContainText('+5 Stellar Prisms');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await tools.getByLabel('Duplicate action', { exact: true }).selectOption('trade-up');
  await tools.getByRole('button', { name: 'Select five spares', exact: true }).click();
  await tools.getByRole('button', { name: 'Trade Up selected', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trade Up complete', exact: true })).toBeVisible();
  await expect(page.locator('.duplicate-reward .playing-card')).toHaveClass(/rarity-2/);
  await page.screenshot({ path: 'docs/screenshots/v08-trade-up.png' });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const after = await api(client, '/profile');
  assert.equal(after.prisms, p.prisms + 5);
  for (const id of after.deck) assert.ok(after.inventory[id]?.quantity > 0);
  console.log(
    'Booster economy browser checks passed: daily claim, stacked inventory, quantity purchase, Open ×5/×10, duplicate recycling and Trade Up.',
  );
}
