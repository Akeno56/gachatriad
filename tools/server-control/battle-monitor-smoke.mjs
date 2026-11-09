import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { createController } from './index.mjs';
import { createPlatform } from '../../apps/server/src/app.ts';
import { legalMoves } from '../../packages/engine/src/index.ts';
import { createRequire } from 'node:module';
const { io: connect } = createRequire(resolve('apps/web/package.json'))('socket.io-client');
const directory = await mkdtemp(resolve('.cache/v15-monitor-'));
process.env.DATA_DIR = directory;
process.env.LOCAL_CONTROL_SECRET = randomBytes(32).toString('hex');
const platform = await createPlatform(resolve('.'), { memory: true, timers: false });
platform.store.isOnline = () => true;
let controller, browser, socket;
try {
  const people = [];
  for (let n = 0; n < 2; n++) {
    const id = `monitor-player-${n}`,
      name = `Monitor ${n + 1}`;
    await platform.db.read((sql) =>
      sql(
        'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt","isAnonymous") VALUES($1,$2,$3,false,now(),now(),false)',
        [id, name, `${id}@test.invalid`],
      ),
    );
    const actor = { id, name, isAnonymous: false },
      profile = await platform.store.profile(actor);
    for (const pack of await platform.store.economy.list(profile.id))
      await platform.store.economy.open(profile.id, pack.id);
    await platform.store.completeTutorial(profile.id);
    people.push(await platform.store.profile(actor));
  }
  const { lobbyId } = await platform.store.createLobby(people[0], {
    mode: 'custom',
    allowBots: false,
  });
  const { matchId } = await platform.store.joinLobby(people[1], lobbyId);
  await platform.db.read((sql) =>
    sql('UPDATE lobbies SET invited_profile=$1 WHERE id=$2', [people[1].id, lobbyId]),
  );
  await platform.app.listen({ port: 0, host: '127.0.0.1' });
  for (let n = 0; n < 2; n++)
    await platform.security.remember(`monitor-player-${n}`, `198.51.100.${80 + n}`);
  await platform.db.read(async (sql) => {
    for (let n = 0; n < 14; n++)
      await sql(
        `INSERT INTO matches(id,mode,player0,player1,decks,rules,status,winner,completed_at,settlement_done) VALUES($1,'ranked',$2,$3,'[[],[]]','{}','complete',0,now()+$4::int*interval '1 second',true)`,
        [`monitor-audit-${n}`, people[0].id, people[1].id, n],
      );
  });
  const registration = await platform.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    remoteAddress: '127.0.0.1',
    payload: {
      name: 'Connected tester',
      email: 'monitor-online@test.invalid',
      password: 'monitor-password-123',
    },
  });
  expect(registration.statusCode, registration.body).toBe(200);
  socket = connect(`http://127.0.0.1:${platform.app.server.address().port}`, {
    transports: ['websocket'],
    auth: { token: String(registration.headers['set-auth-token']) },
  });
  await new Promise((done, reject) => {
    socket.once('connect', done);
    socket.once('connect_error', reject);
  });
  controller = await createController({
    port: 3175,
    gamePort: platform.app.server.address().port,
    dataDir: directory,
    managedExternal: true,
    localTest: false,
  });
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  await page.goto(controller.url);
  await expect(page.locator('#monitorMatch option')).toHaveCount(2);
  await page.getByLabel('Ongoing battle', { exact: true }).selectOption(matchId);
  await expect(page.locator('#monitorBoard>div')).toHaveCount(9);
  const [row] = await platform.db.read((sql) =>
    sql('SELECT state,version FROM matches WHERE id=$1', [matchId]),
  );
  const move = legalMoves(row.state)[0];
  await platform.store.move(people[move.player].id, matchId, move.cardId, move.cell, row.version);
  await expect(page.locator('#monitorBoard strong')).toHaveCount(1);
  const positions = await page.locator('#monitorBoard .monitor-values').evaluate((node) =>
    Object.fromEntries(
      Array.from(node.querySelectorAll('span')).map((span) => {
        const b = span.getBoundingClientRect();
        return [span.dataset.side, { x: b.x + b.width / 2, y: b.y + b.height / 2 }];
      }),
    ),
  );
  expect(Math.abs(positions.top.x - positions.bottom.x)).toBeLessThan(1);
  expect(Math.abs(positions.left.y - positions.right.y)).toBeLessThan(1);
  expect(positions.top.y).toBeLessThan(positions.left.y);
  expect(positions.bottom.y).toBeGreaterThan(positions.right.y);
  expect(positions.left.x).toBeLessThan(positions.top.x);
  expect(positions.right.x).toBeGreaterThan(positions.bottom.x);
  await expect(page.locator('#monitorBoard img')).toHaveCount(0);
  await expect(page.locator('#monitorStatus')).toContainText('PLAYING');
  await page.locator('#battleMonitor').screenshot({ path: '.cache/v15-battle-monitor.png' });
  await expect(page.locator('#players')).toContainText('127.0.0.1');
  await expect(
    page.locator('#moderationUsers a').filter({ hasText: people[0].name }),
  ).toHaveAttribute('href', new RegExp('profile/\\?id=' + people[0].id));
  await page.locator('#reviewUser').selectOption(people[0].id);
  await expect(page.locator('#reviewPairs')).toContainText('14 / 0 / 0');
  await expect(page.locator('#reviewRows tr')).toHaveCount(14);
  await page.locator('#playerReview').screenshot({ path: '.cache/alpha-history-review.png' });
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#networkAddress').fill('198.51.100.80');
  await page.locator('#networkAction').selectOption('block');
  await page.locator('#networkApply').click();
  await expect(page.locator('#networkStatus')).toContainText('updated');
  await expect(platform.security.assertAllowed('198.51.100.80')).rejects.toThrow(/blocked/);
  console.log(
    'Private host tools passed: invitation-only live monitor without artwork, connected IP column, profile links, 14-win history summary and persistent network blocking.',
  );
} finally {
  socket?.disconnect();
  await browser?.close();
  await controller?.close();
  await platform.app.close();
}
