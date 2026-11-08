import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createController } from './index.mjs';
import { checkSocial } from './social-smoke.mjs';
const controller = await createController({
  port: 3130,
  gamePort: 3101,
  previewPort: 3100,
  dataDir: resolve('.cache', `host-check-${Date.now()}`),
});
let browser;
const apiURL = 'http://127.0.0.1:3101',
  origin = 'http://127.0.0.1:3100';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let testIpCounter = 0;
async function until(work, message) {
  for (let i = 0; i < 240; i++) {
    if (await work()) return;
    await wait(150);
  }
  throw Error(message);
}
try {
  browser = await chromium.launch({ headless: true });
  const admin = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await admin.goto(controller.url);
  const denied = await fetch(controller.url + '/start', {
    method: 'POST',
    headers: { origin: 'https://untrusted.invalid' },
  });
  assert.equal(denied.status, 403);
  await admin.getByRole('button', { name: 'Start server', exact: true }).click();
  await until(
    async () => (await controller.state()).running && !!(await controller.state()).online,
    'Server did not start.',
  );
  const clients = [];
  for (let i = 0; i < 2; i++) {
    const response = await fetch(apiURL + '/api/auth/sign-in/anonymous', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 200);
    const token = response.headers.get('set-auth-token');
    assert.ok(token);
    clients.push({ token, profile: null });
  }
  async function api(client, path, body) {
    const response = await fetch(apiURL + '/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        origin,
        authorization: `Bearer ${client.token}`,
        'x-forwarded-for': (client.testIp ||= `10.24.0.${++testIpCounter}`),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    const signed = response.headers.get('set-auth-token');
    if (signed) client.token = signed;
    return response.json();
  }
  for (const c of clients) {
    c.profile = await api(c, '/profile');
    assert.equal(c.profile.unopenedBoosters, 3);
    assert.deepEqual(c.profile.inventory, {});
    await api(c, '/tutorial/complete', {});
  }
  assert.notEqual(clients[0].profile.id, clients[1].profile.id);
  const contexts = [],
    pages = [];
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({ viewport: { width: i ? 390 : 1440, height: 1100 } });
    await context.route(`${apiURL}/**`, (route) =>
      route.continue({
        headers: { ...route.request().headers(), 'x-forwarded-for': clients[i].testIp },
      }),
    );
    await context.addInitScript(
      ({ apiURL, token }) => {
        localStorage.setItem('triad-server', apiURL);
        if (!localStorage.getItem(`triad-session:${apiURL}`))
          localStorage.setItem(`triad-session:${apiURL}`, token);
      },
      { apiURL, token: clients[i].token },
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(origin + '/gachatriad/');
    await page.getByRole('link', { name: 'Open boosters (3)', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Open starter booster/ })).toHaveCount(1);
    await expect(page.locator('.booster-count')).toContainText('×3');
    await expect(page.getByRole('button', { name: 'Buy booster', exact: true })).toBeDisabled();
    for (let pack = 0; pack < 3; pack++) {
      await page
        .getByRole('button', { name: /^Open starter booster/ })
        .first()
        .click();
      const reveal = page.locator('.pack-opening');
      await expect(reveal).toBeVisible();
      await reveal.getByRole('button', { name: 'Open booster', exact: true }).click();
      await expect(reveal.locator('.opening-card-back')).toBeVisible();
      if (pack === 0) {
        await reveal.getByRole('button', { name: 'Reveal card 1', exact: true }).click();
        await expect(reveal.locator('.opening-card .playing-card')).toBeVisible();
        await reveal.getByRole('button', { name: 'Next card', exact: true }).first().click();
        await expect(
          reveal.getByRole('button', { name: 'Reveal card 2', exact: true }),
        ).toBeVisible();
      }
      await reveal.getByRole('button', { name: 'Reveal all', exact: true }).click();
      await expect(reveal.locator('.opening-fan .playing-card')).toHaveCount(5);
      if (pack === 0) {
        await mkdir('docs/screenshots', { recursive: true });
        await page.screenshot({
          path: `docs/screenshots/v07-booster-${i ? 'mobile' : 'desktop'}.png`,
          fullPage: true,
        });
      }
      await reveal.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('button', { name: /^Open starter booster/ })).toHaveCount(
        pack === 2 ? 0 : 1,
      );
    }
    clients[i].profile = await api(clients[i], '/profile');
    assert.equal(
      Object.values(clients[i].profile.inventory).reduce((n, c) => n + c.quantity, 0),
      15,
    );
    assert.equal(clients[i].profile.deck.length, 5);
    await page.reload();
    await expect(page.getByRole('button', { name: /^Open starter booster/ })).toHaveCount(0);
    await expect(page.locator('.local-bots')).toHaveCount(0);
    const forbidden = await fetch(apiURL + '/api/local-bots', {
      headers: { origin, authorization: `Bearer ${clients[i].token}` },
    });
    assert.equal(forbidden.status, 403);
    await page.locator('.volume-controls summary').click();
    await expect(page.getByRole('slider', { name: 'Music volume', exact: true })).toHaveValue('50');
    await expect(
      page.getByRole('slider', { name: 'Sound effects volume', exact: true }),
    ).toHaveValue('50');
    await expect(page.getByRole('button', { name: 'Music on', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('slider', { name: 'Music volume', exact: true }).press('Home');
    await page.getByRole('slider', { name: 'Music volume', exact: true }).press('ArrowRight');
    await page.getByRole('slider', { name: 'Sound effects volume', exact: true }).press('End');
    await page.reload();
    await page.locator('.volume-controls summary').click();
    await expect(page.getByRole('slider', { name: 'Music volume', exact: true })).toHaveValue('1');
    await expect(
      page.getByRole('slider', { name: 'Sound effects volume', exact: true }),
    ).toHaveValue('100');
    await page.locator('.volume-controls summary').click();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `Header overflows at ${i ? 'mobile' : 'desktop'} width`,
    );
    await page.getByRole('link', { name: 'Play', exact: true }).click();
    try {
      await page.getByRole('button', { name: 'Start match' }).waitFor();
    } catch (error) {
      console.log(
        'Browser diagnostics:',
        JSON.stringify({ errors, body: (await page.locator('body').innerText()).slice(0, 1800) }),
      );
      await page.screenshot({ path: '.cache/host-browser-failure.png', fullPage: true });
      throw error;
    }
    contexts.push(context);
    pages.push(page);
  }
  await until(
    async () => (await controller.state()).online?.players.length === 2,
    'Two independent browser players did not connect.',
  );
  await pages[0].getByRole('link', { name: 'Cards', exact: true }).click();
  await pages[0].getByRole('heading', { name: 'Cards', exact: true }).waitFor();
  await pages[0].getByRole('link', { name: 'Collection', exact: true }).click();
  await pages[0].getByRole('heading', { name: 'Collection', exact: true }).waitFor();
  await pages[0].getByRole('link', { name: 'Lobbies', exact: true }).click();
  await pages[0].getByRole('heading', { name: 'Find a table', exact: true }).waitFor();
  const lobby = await api(clients[0], '/lobbies', {
    mode: 'custom',
    rules: { allOpen: true, same: true, plus: true, combo: true, elemental: true },
  });
  const joined = await api(clients[1], `/lobbies/${lobby.lobbyId}/join`, {});
  for (const page of pages) {
    await page.goto(origin + `/gachatriad/?match=${joined.matchId}`);
    await page.locator('.board-cell').first().waitFor();
  }
  await pages[0].locator('.turn-banner').click();
  await expect(pages[0].locator('audio[data-bgm-track="0"]')).toHaveAttribute(
    'data-bgm-scene',
    'battle',
  );
  await expect(pages[0].locator('audio[data-bgm-track="0"]')).toHaveAttribute(
    'src',
    /queen-of-cards/,
  );
  for (let i = 0; i < 9; i++) {
    const view = await api(clients[0], `/matches/${joined.matchId}`),
      actor = clients[view.game.turn],
      own = await api(actor, `/matches/${joined.matchId}`);
    assert.equal(own.game.cellElements.length, 9);
    assert.ok(own.game.cellElements.some(Boolean));
    await api(actor, `/matches/${joined.matchId}/move`, {
      cardId: own.game.hands[own.seat][0].card.id,
      cell: own.game.board.findIndex((c) => !c),
      version: own.version,
    });
  }
  for (const page of pages) await page.locator('.result-overlay').waitFor();
  await expect(pages[0].locator('audio[data-bgm-track="0"]')).toHaveAttribute(
    'data-bgm-scene',
    'menu',
  );
  await expect(pages[0].locator('audio[data-bgm-track="0"]')).toHaveAttribute(
    'src',
    /shuffle-or-boogie-ambient/,
  );
  const result = await api(clients[0], `/matches/${joined.matchId}`);
  assert.ok([10, 25, 50].includes(result.prismReward));
  await expect(pages[0].locator('.prism-reward')).toContainText(
    `${result.prismReward} Stellar Prisms`,
  );
  assert.equal(result.score[0] + result.score[1], 10);
  const accountResponse = await fetch(apiURL + '/api/auth/sign-up/email', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Host test admin',
      email: `host-${Date.now()}@test.invalid`,
      password: 'host-test-password-123',
    }),
  });
  assert.equal(accountResponse.status, 200);
  const adminClient = { token: accountResponse.headers.get('set-auth-token'), profile: null };
  adminClient.profile = await api(adminClient, '/profile');
  const accountRow = admin
    .locator('#moderationUsers tr')
    .filter({ hasText: adminClient.profile.id.slice(0, 8) });
  await expect(accountRow).toContainText('Registered');
  admin.once('dialog', (dialog) => dialog.accept());
  await accountRow.getByRole('button', { name: 'Make admin', exact: true }).click();
  await until(async () => (await api(adminClient, '/profile')).isAdmin, 'Admin promotion failed.');
  assert.equal((await api(adminClient, '/local-bots')).available, true);
  await admin.getByRole('button', { name: 'Populate bots', exact: true }).click();
  await until(
    async () => (await controller.state()).online?.population.enabled,
    'Population did not start.',
  );
  await admin.getByRole('button', { name: 'Pause bots', exact: true }).click();
  await until(
    async () => !(await controller.state()).online?.population.enabled,
    'Population did not pause.',
  );
  admin.once('dialog', (dialog) => dialog.accept());
  await accountRow.getByRole('button', { name: 'Remove admin', exact: true }).click();
  await until(async () => !(await api(adminClient, '/profile')).isAdmin, 'Admin demotion failed.');
  const guestRow = admin
    .locator('#moderationUsers tr')
    .filter({ hasText: clients[1].profile.id.slice(0, 8) });
  await expect(guestRow.getByRole('button', { name: 'Make admin', exact: true })).toHaveCount(0);
  admin.once('dialog', (dialog) => dialog.accept());
  await guestRow.getByRole('button', { name: 'Suspend', exact: true }).click();
  await expect(guestRow).toContainText('Suspended');
  assert.equal(
    (
      await fetch(apiURL + '/api/profile', {
        headers: { origin, authorization: `Bearer ${clients[1].token}` },
      })
    ).status,
    403,
  );
  admin.once('dialog', (dialog) => dialog.accept());
  await guestRow.getByRole('button', { name: 'Restore access', exact: true }).click();
  await until(async () => {
    const response = await fetch(apiURL + '/api/profile', {
      headers: { origin, authorization: `Bearer ${clients[1].token}` },
    });
    return response.ok;
  }, 'Suspended account was not restored.');
  await pages[1].reload();
  await checkSocial({ browser, api, apiURL, origin, controller, admin });
  await pages[0].goto(origin + '/gachatriad/cards');
  await pages[0].getByLabel('Finish', { exact: true }).selectOption('holo');
  await pages[0]
    .getByRole('button', { name: /^Inspect / })
    .first()
    .click();
  const foil = pages[0].locator('.card-detail .holo-foil');
  await expect(foil).toBeVisible();
  await pages[0].mouse.move(0, 0);
  const foilBefore = await foil.evaluate((el) => getComputedStyle(el).backgroundPosition);
  await expect
    .poll(() => foil.evaluate((el) => getComputedStyle(el).backgroundPosition))
    .not.toBe(foilBefore);
  await pages[0].screenshot({ path: 'docs/screenshots/v07-holo-detail.png', fullPage: true });
  await pages[0].keyboard.press('Escape');
  await admin.screenshot({ path: 'docs/screenshots/v07-moderation.png', fullPage: true });
  assert.equal(result.status, 'complete');
  // Cookie-free refresh proves the GitHub Pages path does not depend on third-party cookies.
  await contexts[0].clearCookies();
  await pages[0].goto(origin + `/gachatriad/?match=${joined.matchId}`);
  await pages[0].locator('.result-overlay').waitFor();
  await mkdir('docs/screenshots', { recursive: true });
  await pages[0].screenshot({ path: 'docs/screenshots/v07-result-overlay.png', fullPage: true });
  await pages[1].screenshot({ path: 'docs/screenshots/v07-result-mobile.png', fullPage: true });
  const before = await api(clients[0], '/profile');
  const packsBefore = await api(clients[0], '/boosters');
  const active = await api(clients[0], '/solo', { difficulty: 'easy', rules: { threeOpen: true } });
  await pages[0].evaluate(
    (apiURL) =>
      new Promise((resolve, reject) => {
        const probe = new WebSocket(
          apiURL.replace('http:', 'ws:') + '/socket.io/?EIO=4&transport=websocket',
        );
        window.__triadShutdownProbe = probe;
        probe.onopen = () => resolve(true);
        probe.onerror = () => reject(Error('Shutdown probe could not connect.'));
      }),
    apiURL,
  );
  await admin.getByRole('button', { name: 'Restart server', exact: true }).click();
  await until(async () => {
    try {
      return (await api(clients[0], '/profile')).activeMatchId === active.matchId;
    } catch {
      return false;
    }
  }, 'Active match did not survive restart.');
  const after = await api(clients[0], '/profile');
  assert.equal(after.id, before.id);
  assert.deepEqual(after.inventory, before.inventory);
  assert.equal(after.prisms, before.prisms);
  assert.deepEqual(await api(clients[0], '/boosters'), packsBefore);
  await until(
    async () => (await controller.state()).online?.players.length === 2,
    'Player connections did not recover after restart.',
  );
  await api(clients[0], `/matches/${active.matchId}/resign`, {});
  await admin.screenshot({ path: 'docs/screenshots/v07-control-panel.png', fullPage: true });
  await contexts[0].close();
  await contexts[1].close();
  await admin.getByRole('button', { name: 'Shut down server', exact: true }).click();
  await until(async () => !(await controller.state()).running, 'Server did not stop.');
  if ((await controller.state()).logs.some((line) => line.text.includes('SIGKILL')))
    console.log(
      'Shutdown diagnostics:',
      JSON.stringify((await controller.state()).logs.slice(-25)),
    );
  assert.equal(
    (await controller.state()).logs.some((line) => line.text.includes('SIGKILL')),
    false,
    'Server shutdown should flush its database gracefully, without a forced kill.',
  );
  admin.once('dialog', (dialog) => dialog.accept());
  await admin.getByRole('button', { name: 'Exit control tool', exact: true }).click();
  await until(async () => {
    try {
      await fetch(controller.url);
      return false;
    } catch {
      return true;
    }
  }, 'Control tool did not exit.');
  console.log(
    'Host integration passed: desktop/mobile starter boosters; volume persistence; ambient Holo; admin promotion/demotion; suspension/restoration; bot controls; two bearer-authenticated players; full Elemental duel and currency; restart persistence; graceful stop and control-tool exit.',
  );
} catch (error) {
  const status = await controller.state();
  console.log(
    'Host check diagnostics:',
    JSON.stringify({ running: status.running, busy: status.busy, logs: status.logs.slice(-35) }),
  );
  throw error;
} finally {
  await browser?.close();
  await controller.close();
}
