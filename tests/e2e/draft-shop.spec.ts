import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { buildBestDeck } from '../../packages/engine/src/index';
import type { MatchView, ProfileView } from '../../packages/shared/src/platform';
import { openStarterPacks } from './helpers';
let counter = 0;
async function player(page: Page, starters = true) {
  await page.context().setExtraHTTPHeaders({
    'x-forwarded-for': `10.91.${Math.floor(++counter / 200)}.${(counter % 200) + 1}`,
  });
  await page.goto('/cards');
  await expect(page.locator('.account-control')).toHaveText('Login/Register');
  await page.locator('.account-control').click();
  await page.getByLabel('Player name').fill(`New rules ${crypto.randomUUID().slice(0, 6)}`);
  await page.getByLabel('Email', { exact: true }).fill(`rules-${crypto.randomUUID()}@test.invalid`);
  await page.getByLabel('Password', { exact: true }).fill('new-rules-test-password');
  const signupResponse = page.waitForResponse((response) =>
    response.url().includes('/api/auth/sign-up/email'),
  );
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const signup = await signupResponse;
  expect(signup.status(), signup.status() === 200 ? '' : await signup.text()).toBe(200);
  await expect(page.locator('.account-control')).toHaveText('Logout');
  expect((await page.request.post('/api/tutorial/complete', { data: {} })).status()).toBe(200);
  if (starters) await openStarterPacks(page);
}
async function post<T>(page: Page, path: string, data: unknown = {}): Promise<T> {
  const r = await page.request.post('/api' + path, { data });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}
async function profile(page: Page): Promise<ProfileView> {
  return (await page.request.get('/api/profile')).json();
}
async function second(page: Page): Promise<{ context: BrowserContext; page: Page }> {
  const context = await page
    .context()
    .browser()!
    .newContext({ baseURL: new URL(page.url()).origin });
  return { context, page: await context.newPage() };
}
async function clean(page: Page) {
  const p = await profile(page);
  const id = p.activeMatchId ?? p.pendingTrade?.matchId;
  if (!id) return;
  if (p.activeMatchId) await page.request.post(`/api/matches/${id}/resign`, { data: {} });
  const m: MatchView = await (await page.request.get(`/api/matches/${id}`)).json();
  if (m.trade.canClaim)
    await page.request.post(`/api/matches/${id}/claim`, {
      data: { cardId: m.trade.choices[0].id },
    });
}
test('keeps the Buy button beside card metadata without adding a row', async ({ page }, info) => {
  await page.goto('/cards');
  await expect(page.locator('.account-control')).not.toHaveText('Connecting…');
  const card = page.locator('.catalog-grid article').first(),
    button = card.locator('.card-buy-button'),
    meta = card.locator('.album-card-info');
  await expect(button).toBeVisible();
  const b = (await button.boundingBox())!,
    m = (await meta.boundingBox())!,
    art = (await card.locator('.card-inspect').boundingBox())!;
  expect(Math.abs(b.y - m.y)).toBeLessThan(3);
  expect(b.x).toBeGreaterThanOrEqual(m.x + m.width);
  expect(b.x + b.width).toBeLessThanOrEqual(art.x + art.width + 1);
  expect(b.height).toBeLessThanOrEqual(38);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('compact-card-buy-buttons.png'), fullPage: true });
  await page.getByLabel('Finish', { exact: true }).selectOption('holo');
  await expect(page.locator('.card-buy-button')).toHaveCount(0);
});
test('shows three titled messages and defaults each public chat to its page channel', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await player(page);
  const b = await second(page),
    c = await second(page);
  try {
    await player(b.page, false);
    await player(c.page, false);
    await page.route('**/api/social', async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      data.chat = data.chat.map((m: object) => ({ ...m, title: 'Ranked Champion' }));
      await route.fulfill({ response, json: data });
    });
    await page.goto('/');
    const marker = crypto.randomUUID().slice(0, 8);
    const texts = [
      'First readable message',
      'Second readable message',
      'Third readable message',
    ].map((text) => `${text} ${marker}`);
    for (const [i, p] of [page, b.page, c.page].entries())
      await post(p, '/chat', {
        message: texts[i],
        requestId: crypto.randomUUID(),
        channel: 'general',
      });
    async function visibleThree() {
      const log = page.locator('.main-chat .chat-messages');
      const rows = log.locator('.chat-message').filter({ hasText: marker });
      await expect(rows).toHaveCount(3);
      const box = (await log.boundingBox())!;
      for (const row of await rows.all()) {
        const r = (await row.boundingBox())!;
        expect(r.y).toBeGreaterThanOrEqual(box.y);
        expect(r.y + r.height).toBeLessThanOrEqual(box.y + box.height);
      }
    }
    await visibleThree();
    if (info.project.name === 'desktop') {
      const rows = page.locator('.main-chat .chat-message').filter({ hasText: marker });
      const colors = await rows.evaluateAll((items) =>
        items.map((item) => getComputedStyle(item).backgroundColor),
      );
      expect(colors[0]).not.toBe(colors[1]);
      for (const row of await rows.all()) {
        const header = (await row.locator('.message-heading').boundingBox())!;
        const body = (await row.locator('.message-content > p').boundingBox())!;
        const time = (await row.locator('time').boundingBox())!;
        expect(Math.abs(header.y + header.height / 2 - body.y - body.height / 2)).toBeLessThan(4);
        expect(Math.abs(time.y + time.height / 2 - body.y - body.height / 2)).toBeLessThan(4);
      }
    }
    await page.getByRole('link', { name: 'Lobbies', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Lobbies', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('tab', { name: 'General', exact: true }).click();
    await visibleThree();
    await page.getByRole('link', { name: 'Trades', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Trade', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const chat = (await page.locator('.main-chat').boundingBox())!;
    const description = (await page.locator('.page-description').boundingBox())!;
    expect(chat.y).toBeGreaterThanOrEqual(description.y + description.height);
    expect(chat.y + chat.height).toBeLessThan(
      (await page.locator('.trade-create').boundingBox())!.y,
    );
    await page.getByRole('tab', { name: 'General', exact: true }).click();
    await visibleThree();
    await page.screenshot({
      path: info.outputPath('trade-chat-three-messages.png'),
      fullPage: true,
    });
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Trade', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  } finally {
    await b.context.close();
    await c.context.close();
  }
});
test('automatically opens three temporary Draft boosters, resumes on reload and builds a legal hand', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await player(page, false);
  const b = await second(page);
  try {
    await player(b.page, false);
    const before = await profile(page);
    const lobby = await post<{ lobbyId: string }>(page, '/lobbies', {
      mode: 'draft',
      allowBots: false,
    });
    const joined = await post<{ matchId: string }>(b.page, `/lobbies/${lobby.lobbyId}/join`);
    const m: MatchView = await (await b.page.request.get(`/api/matches/${joined.matchId}`)).json();
    for (let step = 0; step < 15; step++)
      await post(b.page, `/matches/${m.id}/draft/reveal`, { step });
    await post(b.page, `/matches/${m.id}/draft`, {
      cards: buildBestDeck(m.draftPool).map((c) => c.id),
    });
    await page.goto(`/?match=${m.id}`);
    const opening = page.getByRole('region', { name: 'Automatic Draft booster opening' });
    await expect(opening).toContainText('Booster 1/3');
    await expect
      .poll(
        async () =>
          ((await (await page.request.get(`/api/matches/${m.id}`)).json()) as MatchView)
            .draftRevealed,
      )
      .toBeGreaterThanOrEqual(3);
    const saved: MatchView = await (await page.request.get(`/api/matches/${m.id}`)).json();
    await page.reload();
    await expect(opening).toContainText('Booster 2/3', { timeout: 15000 });
    await expect(opening).toContainText('Booster 3/3', { timeout: 15000 });
    await expect(page.locator('.draft-card')).toHaveCount(15, { timeout: 15000 });
    const totals = await page
      .locator('.draft-card')
      .evaluateAll((cards) => cards.map((c) => Number(c.getAttribute('data-total'))));
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
    await page.getByLabel('Order draft cards').selectOption('rarity');
    const rarities = await page
      .locator('.draft-card')
      .evaluateAll((cards) => cards.map((c) => Number(c.getAttribute('data-rarity'))));
    expect(rarities).toEqual([...rarities].sort((a, b) => b - a));
    if (info.project.name === 'desktop') {
      for (const viewport of [
        { width: 1366, height: 768 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        const grid = (await page.locator('.draft-grid').boundingBox())!;
        expect(grid.y + grid.height).toBeLessThanOrEqual(viewport.height - 100);
        await expect(page.getByRole('button', { name: 'Lock hand', exact: true })).toBeInViewport();
        const lock = (await page
          .getByRole('button', { name: 'Lock hand', exact: true })
          .boundingBox())!;
        const cog = (await page.locator('.settings-cog').boundingBox())!;
        expect(lock.x).toBeGreaterThan(cog.x + cog.width);
        expect(
          await page.evaluate(() => document.documentElement.scrollHeight),
        ).toBeLessThanOrEqual(viewport.height);
      }
    }
    const final: MatchView = await (await page.request.get(`/api/matches/${m.id}`)).json();
    expect(final.draftPool).toEqual(saved.draftPool);
    expect(final.draftRevealed).toBe(15);
    expect((await profile(page)).inventory).toEqual(before.inventory);
    expect((await profile(page)).unopenedBoosters).toBe(3);
    await page.screenshot({
      path: info.outputPath('draft-fifteen-temporary-cards.png'),
      fullPage: true,
    });
    for (const card of buildBestDeck(final.draftPool))
      await page.getByRole('button', { name: `Draft ${card.name}`, exact: true }).click();
    await page.getByRole('button', { name: 'Lock hand', exact: true }).click();
    await expect(page.locator('.board-cell')).toHaveCount(9);
    expect((await profile(page)).inventory).toEqual(before.inventory);
  } finally {
    await clean(page);
    await clean(b.page);
    await b.context.close();
  }
});
test('prompts for unresolved Ranked stakes, blocks the loser and starts a consensual rematch', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await player(page);
  const b = await second(page);
  try {
    await player(b.page);
    for (const p of [page, b.page]) await post(p, '/ranked/acknowledge', { acknowledged: true });
    const lobby = await post<{ lobbyId: string }>(page, '/lobbies', {
      mode: 'ranked',
      allowBots: false,
    });
    const joined = await post<{ matchId: string }>(b.page, `/lobbies/${lobby.lobbyId}/join`);
    await post(b.page, `/matches/${joined.matchId}/resign`);
    await page.goto(`/?match=${joined.matchId}`);
    await expect(page.getByRole('button', { name: 'Rematch', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Review board', exact: true }).click();
    await page.getByRole('link', { name: 'Cards', exact: true }).click();
    const guard = page.locator('.active-battle-reminder');
    await expect(guard).toContainText('Choose your Trade One card first');
    await page.keyboard.press('Escape');
    await expect(guard).toBeVisible();
    await expect(guard.getByRole('button', { name: 'Continue browsing', exact: true })).toHaveCount(
      0,
    );
    await b.page.goto('/lobbies');
    await expect(b.page.locator('.active-battle-reminder')).toContainText(
      'Trade One is awaiting selection',
    );
    await b.page.getByRole('button', { name: 'Continue browsing', exact: true }).click();
    for (const button of await b.page.locator('.queue-option').all())
      await expect(button).toBeDisabled();
    expect((await b.page.request.post('/api/solo', { data: {} })).status()).toBe(409);
    await page.getByRole('button', { name: 'Return to card selection', exact: true }).click();
    await page
      .getByRole('button', { name: /^Claim / })
      .first()
      .click();
    await expect(page.getByRole('button', { name: 'Rematch', exact: true })).toBeEnabled();
    await post(b.page, '/deck/auto');
    await page.getByRole('button', { name: 'Rematch', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Rematch requested', exact: true }),
    ).toBeDisabled();
    await b.page.goto(`/?match=${joined.matchId}`);
    await expect(b.page.getByRole('button', { name: 'Accept rematch', exact: true })).toBeVisible();
    await b.page.getByRole('button', { name: 'Accept rematch', exact: true }).click();
    for (const p of [page, b.page]) await expect(p.locator('.board-cell')).toHaveCount(9);
    const aProfile = await profile(page),
      bProfile = await profile(b.page);
    expect(aProfile.activeMatchId).toBeTruthy();
    expect(aProfile.activeMatchId).toBe(bProfile.activeMatchId);
    expect(aProfile.activeMatchId).not.toBe(joined.matchId);
    await page.screenshot({ path: info.outputPath('ranked-rematch.png'), fullPage: true });
  } finally {
    await clean(page);
    await clean(b.page);
    await b.context.close();
  }
});
