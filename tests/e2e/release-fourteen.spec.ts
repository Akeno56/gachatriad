import { test, expect, type Page } from '@playwright/test';
import { openStarterPacks } from './helpers';

test('keeps mobile fields focusable while polling, supports private battle chat and defaults CRT off', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await openStarterPacks(page);
  const tutorial = await page.request.post('/api/tutorial/complete', { data: {} });
  expect(tutorial.status(), await tutorial.text()).toBe(200);
  await page.reload();
  await expect(page.locator('.game-shell')).not.toHaveClass(/crt-enabled/);
  await expect(page.getByLabel('Main chat message', { exact: true })).toHaveAttribute(
    'placeholder',
    'Register or sign in to chat',
  );
  await page.locator('.account-control').click();
  const mobile = info.project.name === 'mobile';
  async function typeInto(target: ReturnType<Page['getByLabel']>, text: string) {
    if (mobile) await target.tap();
    else await target.click();
    await expect(target).toBeFocused();
    await page.keyboard.type(text);
    await expect(target).toHaveValue(text);
  }
  await typeInto(page.getByLabel('Player name', { exact: true }), 'Mobile challenger');
  await typeInto(
    page.getByLabel('Email', { exact: true }),
    `v14-${info.project.name}-${Date.now()}@test.invalid`,
  );
  await typeInto(page.getByLabel('Password', { exact: true }), 'playtest-password-123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('.account-dialog')).not.toBeVisible();
  const greeting = `Hello from this device ${Date.now()}!`;
  await typeInto(page.getByLabel('Main chat message', { exact: true }), greeting);
  await page.waitForTimeout(5500);
  await expect(page.getByLabel('Main chat message', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Main chat message', { exact: true })).toHaveValue(greeting);
  await page.locator('.main-chat').getByRole('button', { name: 'Send', exact: true }).click();
  await expect(
    page.locator('.main-chat .chat-message').filter({ hasText: greeting }),
  ).toBeVisible();
  const otherContext = await browser.newContext({
    viewport: page.viewportSize()!,
    isMobile: mobile,
    hasTouch: mobile,
  });
  try {
    const other = await otherContext.newPage();
    await other.goto('/');
    await openStarterPacks(other);
    await other.request.post('/api/tutorial/complete', { data: {} });
    await other.reload();
    await other.locator('.account-control').click();
    await other.getByLabel('Player name', { exact: true }).fill('Other challenger');
    await other
      .getByLabel('Email', { exact: true })
      .fill(`v14-other-${info.project.name}-${Date.now()}@test.invalid`);
    await other.getByLabel('Password', { exact: true }).fill('playtest-password-123');
    await other.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(other.locator('.account-control')).toHaveText('Logout');
    const a = await (await page.request.get('/api/profile')).json();
    const b = await (await other.request.get('/api/profile')).json();
    await page.request.post('/api/friends/request', { data: { playerId: b.id } });
    await other.request.post(`/api/friends/${a.id}/accept`, { data: {} });
    await page.getByRole('button', { name: /Friends and private chat/ }).click();
    await page.getByRole('tab', { name: 'Friend chat', exact: true }).click();
    await page.locator('.conversation-choice').filter({ hasText: 'Other challenger' }).click();
    await typeInto(
      page.getByLabel('Message Other challenger', { exact: true }),
      'Hello in private!',
    );
    await page.locator('.friend-chat').getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.locator('.friend-chat .private-message')).toContainText('Hello in private!');
    await page.screenshot({ path: info.outputPath('messenger.png') });
    await page
      .locator('.social-heading')
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    const lobby = await (
      await page.request.post('/api/lobbies', { data: { mode: 'custom', allowBots: false } })
    ).json();
    const join = await other.request.post(`/api/lobbies/${lobby.lobbyId}/join`, { data: {} });
    expect(join.status(), await join.text()).toBe(200);
    const { matchId } = await join.json();
    await page.goto(`/?match=${matchId}`);
    await other.goto(`/?match=${matchId}`);
    if (mobile) await page.getByRole('button', { name: /^Chat/ }).click();
    const chat = page.getByLabel('Message your opponent', { exact: true });
    await typeInto(chat, 'Bien joué !');
    await page.locator('.battle-chat').getByRole('button', { name: 'Send', exact: true }).click();
    await expect(other.locator('.battle-chat .chat-message')).toContainText('Bien joué !');
    await expect(page.locator('.battle-chat .chat-message')).toContainText('Bien joué !');
    const disallowed = await page.request.post(`/api/matches/${matchId}/chat`, {
      data: { message: 'connard', requestId: crypto.randomUUID() },
    });
    expect(disallowed.status()).toBe(429);
    await expect(page.locator('.battle-chat .chat-message')).not.toContainText('connard');
    await page.screenshot({ path: info.outputPath('battle-chat.png'), fullPage: true });
    await page.request.post(`/api/matches/${matchId}/resign`, { data: {} });
  } finally {
    await otherContext.close();
  }
  expect(errors).toEqual([]);
});
