import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createController } from './index.mjs';
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
async function until(work, message) {
  for (let i = 0; i < 100; i++) {
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
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    return response.json();
  }
  for (const c of clients) {
    c.profile = await api(c, '/profile');
    await api(c, '/tutorial/complete', {});
  }
  assert.notEqual(clients[0].profile.id, clients[1].profile.id);
  const contexts = [],
    pages = [];
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({ viewport: { width: i ? 390 : 1440, height: 1100 } });
    await context.addInitScript(
      ({ apiURL, token }) => {
        localStorage.setItem('triad-server', apiURL);
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
  const result = await api(clients[0], `/matches/${joined.matchId}`);
  assert.equal(result.score[0] + result.score[1], 10);
  assert.equal(result.status, 'complete');
  // Cookie-free refresh proves the GitHub Pages path does not depend on third-party cookies.
  await contexts[0].clearCookies();
  await pages[0].reload();
  await pages[0].locator('.result-overlay').waitFor();
  await mkdir('docs/screenshots', { recursive: true });
  await pages[0].screenshot({ path: 'docs/screenshots/v04-result-overlay.png', fullPage: true });
  await pages[1].screenshot({ path: 'docs/screenshots/v04-result-mobile.png', fullPage: true });
  const before = await api(clients[0], '/profile');
  const active = await api(clients[0], '/solo', { difficulty: 'easy', rules: { threeOpen: true } });
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
  await until(
    async () => (await controller.state()).online?.players.length === 2,
    'Player connections did not recover after restart.',
  );
  await api(clients[0], `/matches/${active.matchId}/resign`, {});
  await admin.screenshot({ path: 'docs/screenshots/v04-control-panel.png', fullPage: true });
  await contexts[0].close();
  await contexts[1].close();
  await admin.getByRole('button', { name: 'Shut down server', exact: true }).click();
  await until(async () => !(await controller.state()).running, 'Server did not stop.');
  assert.equal(
    (await controller.state()).logs.some((line) => line.text.includes('SIGKILL')),
    false,
    'Server shutdown should flush its database gracefully, without a forced kill.',
  );
  console.log(
    'Host integration passed: local control start/restart/stop; two independent bearer-authenticated browser players; sockets; full Elemental duel; cookie-free refresh; match/inventory persistence; connected-player display.',
  );
} finally {
  await browser?.close();
  await controller.close();
}
