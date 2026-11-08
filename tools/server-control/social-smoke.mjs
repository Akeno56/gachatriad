import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { checkEconomy } from './economy-smoke.mjs';
export async function checkSocial({ browser, api, apiURL, origin, controller, admin }) {
  const contexts = [],
    clients = [],
    pages = [];
  let accountIp = 100;
  async function until(work, message) {
    for (let i = 0; i < 160; i++) {
      if (await work()) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw Error(message);
  }
  async function account(name) {
    const testIp = `10.25.0.${++accountIp}`;
    const response = await fetch(apiURL + '/api/auth/sign-up/email', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({
        name,
        email: `social-${Date.now()}-${Math.random()}@test.invalid`,
        password: 'social-test-password-123',
      }),
    });
    assert.equal(response.status, 200, await response.clone().text());
    const c = { token: response.headers.get('set-auth-token'), profile: null, testIp };
    c.profile = await api(c, '/profile');
    return c;
  }
  try {
    for (let i = 0; i < 2; i++) {
      const c = await account(i ? 'Friend Beta' : 'Friend Alpha');
      clients.push(c);
      for (const pack of await api(c, '/boosters')) await api(c, `/boosters/${pack.id}/open`, {});
      await api(c, '/tutorial/complete', {});
      c.profile = await api(c, '/profile');
      await api(c, '/profile/avatar', { cardId: c.profile.deck[0] });
      const context = await browser.newContext({
        viewport: { width: i ? 390 : 1440, height: 1100 },
      });
      await context.route(`${apiURL}/**`, (route) =>
        route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': c.testIp } }),
      );
      contexts.push(context);
      await context.addInitScript(
        ({ apiURL, token }) => {
          localStorage.setItem('triad-server', apiURL);
          localStorage.setItem(`triad-session:${apiURL}`, token);
          localStorage.setItem('triad-music', 'off');
        },
        { apiURL, token: c.token },
      );
      const page = await context.newPage();
      pages.push(page);
      await page.goto(origin + '/gachatriad/');
      await expect(page.locator('.account-control')).toHaveText('Logout');
      assert.equal(
        await page.getByLabel('Rule preset').locator('option[value="ranked"]').count(),
        0,
      );
    }
    const [a, b] = pages;
    await a.getByRole('button', { name: /Friends and private chat/ }).click();
    await a.getByRole('tab', { name: 'Friends', exact: true }).click();
    await a.getByLabel('Find a player').fill('Friend Beta');
    await a.getByRole('button', { name: 'Search players', exact: true }).click();
    await a
      .locator('.friend-row')
      .filter({ hasText: 'Friend Beta' })
      .getByRole('button', { name: 'Add friend', exact: true })
      .click();
    await b.getByRole('button', { name: /Friends and private chat/ }).click();
    await b.getByRole('tab', { name: 'Friends', exact: true }).click();
    await b.getByRole('button', { name: 'Accept friend', exact: true }).click();
    for (const page of pages)
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    await a.getByLabel('Main chat message', { exact: true }).fill('Hello <b>card hall</b>');
    await a.locator('.main-chat').getByRole('button', { name: 'Send', exact: true }).click();
    await expect(b.getByText('Hello <b>card hall</b>', { exact: true })).toBeVisible();
    assert.equal(await b.locator('.chat-message p b').count(), 0);
    for (const page of pages) {
      await expect(page.locator('.chat-user-list')).toContainText('Friend Alpha');
      await expect(page.locator('.chat-user-list')).toContainText('Friend Beta');
    }
    await a.locator('.main-chat').getByRole('tab', { name: 'Trade', exact: true }).click();
    await a.getByLabel('Main chat message', { exact: true }).fill('Trading in the Trade channel');
    await until(async () => (await api(clients[0], '/social')).chat.length > 0, 'Chat unavailable');
    await new Promise((r) => setTimeout(r, 3100));
    await a.locator('.main-chat').getByRole('button', { name: 'Send', exact: true }).click();
    await expect(a.getByText('Trading in the Trade channel', { exact: true })).toBeVisible();
    await expect(b.getByText('Trading in the Trade channel', { exact: true })).toHaveCount(0);
    await b.goto(origin + '/gachatriad/lobbies');
    await b.locator('.main-chat').getByRole('tab', { name: 'Trade', exact: true }).click();
    await expect(b.getByText('Trading in the Trade channel', { exact: true })).toBeVisible();
    await b.screenshot({ path: 'docs/screenshots/v09-lobby-chat-mobile.png', fullPage: true });
    await a.locator('.main-chat').getByRole('tab', { name: 'General', exact: true }).click();
    await b.locator('.main-chat').getByRole('tab', { name: 'General', exact: true }).click();
    await b.goto(origin + '/gachatriad/');
    await a.screenshot({ path: 'docs/screenshots/v09-main-chat.png', fullPage: true });
    await a.goto(origin + '/gachatriad/profile?id=' + clients[1].profile.id);
    await expect(a.getByRole('button', { name: 'Message', exact: true })).toBeVisible();
    await expect(a.getByRole('button', { name: 'Add friend', exact: true })).toHaveCount(0);
    await a.getByRole('button', { name: 'Message', exact: true }).click();
    await a
      .getByRole('textbox', { name: 'Message Friend Beta', exact: true })
      .fill('Private <b>hello</b>');
    await a.locator('.friend-chat').getByRole('button', { name: 'Send', exact: true }).click();
    await expect(
      b.getByRole('button', { name: /Friends and private chat.*1 notifications/ }),
    ).toBeVisible();
    assert.equal(
      await b.locator('.main-chat').getByText('Private <b>hello</b>', { exact: true }).count(),
      0,
    );
    await b.getByRole('button', { name: /Friends and private chat/ }).click();
    await b.getByRole('tab', { name: 'Friend chat', exact: true }).click();
    await b.locator('.conversation-choice').filter({ hasText: 'Friend Alpha' }).click();
    await expect(b.getByText('Private <b>hello</b>', { exact: true })).toBeVisible();
    assert.equal(await b.locator('.private-message p b').count(), 0);
    await expect(b.getByRole('button', { name: /Friends and private chat/ })).toHaveAccessibleName(
      'Friends and private chat',
    );
    await b.screenshot({ path: 'docs/screenshots/v09-friend-chat-mobile.png', fullPage: true });
    await a.screenshot({ path: 'docs/screenshots/v09-friend-chat-desktop.png', fullPage: true });
    await a.getByRole('tab', { name: 'Friends', exact: true }).click();
    await a
      .locator('.social-dialog')
      .getByRole('button', { name: 'Invite to duel', exact: true })
      .click();
    await b.getByRole('tab', { name: 'Duel invitations', exact: true }).click();
    await b.getByRole('button', { name: 'Accept duel', exact: true }).click();
    await a.getByRole('button', { name: 'Go back to the battle', exact: true }).click();
    await a.getByRole('button', { name: 'Close', exact: true }).click();
    await a.goto(origin + '/gachatriad/');
    for (const page of pages) await expect(page.locator('.board-cell')).toHaveCount(9);
    for (const page of pages)
      await expect(page.locator('.scoreboard .player-avatar img')).toHaveCount(2);
    const active = (await api(clients[0], '/profile')).activeMatchId;
    assert.ok(active);
    assert.equal((await api(clients[1], '/profile')).activeMatchId, active);
    await a.screenshot({ path: 'docs/screenshots/v09-friend-duel.png', fullPage: true });
    await api(clients[1], `/matches/${active}/resign`, {});
    for (const c of clients) await api(c, '/profile/title', { titleId: 'card-player' });
    for (const page of pages) await page.goto(origin + '/gachatriad/');
    await expect(a.locator('.main-chat .message-title').first()).toHaveText('Card Player');
    await expect
      .poll(() =>
        a
          .locator('.title-roster img')
          .evaluateAll(
            (images) =>
              images.length === 5 &&
              images.every((image) => image.complete && image.naturalWidth > 0),
          ),
      )
      .toBe(true);
    for (const name of ['Friend Alpha', 'Friend Beta'])
      await expect(a.locator('.chat-user-list')).toContainText(name);
    await expect
      .poll(() =>
        a
          .locator('.main-chat .player-avatar img')
          .evaluateAll(
            (images) =>
              images.length > 0 &&
              images.every((image) => image.complete && image.naturalWidth > 0),
          ),
      )
      .toBe(true);
    await a.screenshot({ path: 'docs/screenshots/v09-main-chat.png' });
    await a.getByRole('button', { name: /Friends and private chat/ }).click();
    await a.getByRole('tab', { name: 'Friend chat', exact: true }).click();
    await a.locator('.conversation-choice').first().click();
    await expect(a.locator('.private-message .player-avatar img').first()).toBeVisible();
    await expect(a.locator('.private-message .message-title').first()).toHaveText('Card Player');
    await a.screenshot({ path: 'docs/screenshots/v09-friend-chat.png' });
    await a.locator('.social-dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await a.getByRole('button', { name: 'Play ranked', exact: true }).click();
    await expect(a.locator('.ranked-warning')).toContainText('opponent takes one card');
    await a.locator('.ranked-warning').getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal((await api(clients[0], '/profile')).rankedAcknowledged, false);
    for (const page of pages) {
      await page.getByRole('button', { name: 'Play ranked', exact: true }).click();
      await page.getByRole('button', { name: 'I understand · Enter ranked', exact: true }).click();
    }
    for (const page of pages) await expect(page.locator('.board-cell')).toHaveCount(9);
    await expect(a.locator('.scoreboard .battle-title')).toHaveCount(2);
    const ranked = (await api(clients[0], '/profile')).activeMatchId;
    await api(clients[1], `/matches/${ranked}/resign`, {});
    const losing = await api(clients[1], '/profile'),
      result = await api(clients[0], `/matches/${ranked}`),
      choice = result.trade.choices.find((c) => losing.inventory[c.id].quantity === 1);
    assert.ok(choice);
    await a.getByRole('button', { name: `Claim ${choice.name}`, exact: true }).click();
    await until(
      async () => (await api(clients[1], '/profile')).deck.length === 4,
      'Trade One did not prune the saved deck.',
    );
    await b.goto(origin + '/gachatriad/');
    await expect(b.locator('.deck-warning')).toContainText('4/5');
    await b.getByRole('link', { name: 'Collection', exact: true }).click();
    await b.getByRole('button', { name: 'Auto build', exact: true }).click();
    await expect(b.locator('.saved-deck')).toContainText('Ready for battle.');
    await a.goto(origin + '/gachatriad/ladder');
    await expect(a.locator('.ladder-table')).toContainText('Friend Alpha');
    await expect(a.locator('.ladder-table')).toContainText('Card Player');
    await a.screenshot({ path: 'docs/screenshots/v09-ladder.png', fullPage: true });
    const before = (await api(clients[1], '/profile')).prisms;
    await admin.getByLabel('Selected user', { exact: true }).selectOption(clients[1].profile.id);
    await admin.getByLabel('Grant', { exact: true }).selectOption('prisms');
    await admin.getByLabel('Amount', { exact: true }).fill('150');
    await admin.getByRole('button', { name: 'Grant to selected user', exact: true }).click();
    await until(
      async () => (await api(clients[1], '/profile')).prisms === before + 150,
      'Host currency grant failed.',
    );
    await admin.getByLabel('Grant', { exact: true }).selectOption('boosters');
    await admin.getByLabel('Amount', { exact: true }).fill('2');
    await admin.getByRole('button', { name: 'Grant to selected user', exact: true }).click();
    await until(
      async () => (await api(clients[1], '/profile')).unopenedBoosters === 2,
      'Host booster grant failed.',
    );
    const row = admin
      .locator('#moderationUsers tr')
      .filter({ hasText: clients[0].profile.id.slice(0, 8) });
    admin.once('dialog', (d) => d.accept());
    await row.getByRole('button', { name: 'Make admin', exact: true }).click();
    await a.goto(origin + '/gachatriad/lobbies');
    await expect(a.locator('.local-bots')).toBeVisible();
    const stable = a.locator('.local-bots').evaluate(
      (el) =>
        new Promise((resolve) => {
          let removed = false;
          const observer = new MutationObserver(() => {
            if (!el.isConnected) removed = true;
          });
          observer.observe(document.body, { childList: true, subtree: true });
          setTimeout(() => {
            observer.disconnect();
            resolve(!removed);
          }, 2200);
        }),
    );
    for (let i = 0; i < 4; i++)
      await api(clients[0], '/profile/avatar', { cardId: clients[0].profile.deck[0] });
    assert.equal(await stable, true, 'Admin bot panel blinked during refresh.');
    const deleted = await account('Delete this test account');
    await expect(
      admin
        .getByLabel('Selected user', { exact: true })
        .locator(`option[value="${deleted.profile.id}"]`),
    ).toBeAttached();
    await admin.getByLabel('Selected user', { exact: true }).selectOption(deleted.profile.id);
    admin.once('dialog', (d) => d.accept('Delete this test account'));
    await admin.getByRole('button', { name: 'Delete selected account', exact: true }).click();
    await until(
      async () =>
        !(await controller.state()).moderation.users.some((u) => u.id === deleted.profile.id),
      'Host account deletion failed.',
    );
    await admin.getByLabel('Bot difficulty', { exact: true }).selectOption('hard');
    await admin.getByRole('button', { name: 'Apply difficulty', exact: true }).click();
    await until(
      async () => (await controller.state()).online.population.difficulty === 'hard',
      'Bot difficulty was not saved.',
    );
    await admin.screenshot({ path: 'docs/screenshots/v09-user-tools.png', fullPage: true });
    await checkEconomy({ page: a, client: clients[0], api, admin, origin });
    console.log(
      'Social browser checks passed: friends, safe chat, invitations, ranked consent and Trade One, titles, avatars, ladder, stable admin panel, grants, deletion, bot difficulty.',
    );
  } finally {
    for (const context of contexts) await context.close();
  }
}
