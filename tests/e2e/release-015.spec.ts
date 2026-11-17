import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPlatform } from '../../apps/server/src/app';
import {
  legalMoves,
  applyMove,
  seededRandom,
  winner,
  type GameState,
  type Move,
} from '../../packages/engine/src/index';
import { puzzleValue } from '../../apps/server/src/daily-puzzle';
import { CARDS } from '../../packages/shared/src/index';
let platform: Awaited<ReturnType<typeof createPlatform>>,
  origin: string,
  serial = 0;
test.beforeAll(async () => {
  const old = process.env.DATA_DIR;
  process.env.DATA_DIR = await mkdtemp(resolve('.cache/pw-014-'));
  try {
    platform = await createPlatform(resolve('.'), { memory: true, timers: false });
  } finally {
    if (old === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = old;
  }
  await platform.bots.set(false);
  await platform.app.listen({ port: 0, host: '127.0.0.1' });
  origin = `http://127.0.0.1:${(platform.app.server.address() as { port: number }).port}`;
});
test.afterAll(async () => {
  await platform?.app.close();
});
async function player(browser: Browser, registered = true) {
  const n = ++serial;
  const r = await platform.app.inject({
    method: 'POST',
    url: registered ? '/api/auth/sign-up/email' : '/api/auth/sign-in/anonymous',
    remoteAddress: `198.19.14.${n}`,
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: registered
      ? {
          name: `Release tester ${n}`,
          email: `release014-${n}@test.invalid`,
          password: 'isolated-release014-password',
        }
      : {},
  });
  expect(r.statusCode, r.body).toBe(200);
  const actor = { ...r.json().user, isAnonymous: !registered },
    token = String(r.headers['set-auth-token']);
  let profile = await platform.store.profile(actor);
  for (const pack of await platform.store.economy.list(profile.id))
    await platform.store.economy.open(profile.id, pack.id);
  await platform.store.completeTutorial(profile.id);
  const cards = CARDS.filter((card) => card.rarity === 1).slice(0, 6);
  for (const card of cards)
    await platform.db.read((sql) =>
      sql(
        'INSERT INTO inventory(profile_id,card_id,quantity) VALUES($1,$2,1) ON CONFLICT(profile_id,card_id) DO UPDATE SET quantity=inventory.quantity+1',
        [profile.id, card.id],
      ),
    );
  await platform.store.saveDeck(
    profile.id,
    cards.slice(0, 5).map((card) => card.id),
  );
  profile = await platform.store.profile(actor);
  const mobile = test.info().project.name === 'mobile';
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:3000',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  await context.addInitScript(
    ({ origin, token }) => {
      localStorage.setItem('triad-server', origin);
      localStorage.setItem(`triad-session:${origin}`, token);
      localStorage.setItem('triad-music', 'off');
    },
    { origin, token },
  );
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return /^https?:$/.test(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)
      ? route.abort()
      : route.continue();
  });
  const page = await context.newPage();
  page.on('dialog', (dialog) => {
    if (dialog.type() === 'beforeunload') void dialog.accept();
    else void dialog.dismiss();
  });
  return { actor, token, profile, cards, page, context };
}

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function french(page: Page) {
  await page.getByRole('button', { name: 'Language: English', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Français', exact: true }).click();
}

test('shows real tavern notices, bounded chat and shared keyboard controls in both languages', async ({
  browser,
}, info) => {
  const c = await player(browser);
  const errors: string[] = [];
  c.page.on('pageerror', (error) => errors.push(error.message));
  let dailyReads = 0;
  c.page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/puzzles/daily') dailyReads++;
  });
  try {
    await platform.store.economy.grant(
      c.profile.id,
      'boosters',
      2,
      crypto.randomUUID(),
      'test-fixture',
    );
    await c.page.goto('/');
    await expect(c.page.locator('.tavern-sign h1')).toBeVisible();
    await expect(c.page.locator('.tavern-noticeboard')).toContainText('2 unopened boosters');
    await expect(c.page.locator('.title-card')).toHaveCount(5);
    await expect(c.page.locator('.tavern-sign h1')).toHaveText('GACHATRIAD');
    await expect(c.page.locator('.matchmaking-panel')).not.toContainText('Combo lesson');
    const tabs = c.page.getByRole('tablist', { name: 'Public chat channels' });
    await tabs.getByRole('tab', { name: 'General', exact: true }).focus();
    await c.page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('tab', { name: 'Trade', exact: true })).toBeFocused();
    await expect(tabs.getByRole('tab', { name: 'Trade', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await c.page.keyboard.press('End');
    await expect(tabs.getByRole('tab', { name: 'Lobbies', exact: true })).toBeFocused();
    await c.page.keyboard.press('Home');
    await expect(tabs.getByRole('tab', { name: 'General', exact: true })).toBeFocused();
    const update = c.page.getByRole('button', { name: 'Read update notes', exact: true });
    await update.click();
    await expect(c.page.locator('#release-title')).toBeFocused();
    await c.page.keyboard.press('Escape');
    await expect(update).toBeFocused();
    const help = c.page.getByRole('button', { name: 'About the tavern', exact: true });
    await help.focus();
    await expect(c.page.getByRole('tooltip')).toBeVisible();
    await c.page.keyboard.press('Escape');
    await expect(c.page.getByRole('tooltip')).toBeHidden();
    if (info.project.name === 'desktop') {
      for (const [width, height] of [
        [1894, 926],
        [1440, 900],
        [1280, 720],
      ]) {
        await c.page.setViewportSize({ width, height });
        await c.page.evaluate(() => scrollTo(0, 0));
        await expect
          .poll(async () => {
            const b = (await c.page.locator('.main-chat').boundingBox())!;
            return Math.abs(b.y + b.height - height + 76);
          })
          .toBeLessThan(2);
        await expect(c.page.locator('.main-chat .chat-compose')).toBeInViewport({ ratio: 1 });
        const notices = (await c.page.locator('.tavern-noticeboard').boundingBox())!;
        expect(notices.y + notices.height).toBeLessThanOrEqual(height - 68);
        await c.page.screenshot({ path: info.outputPath(`tavern-${width}-${height}-en.png`) });
      }
    }
    await french(c.page);
    if (info.project.name === 'mobile') await c.page.setViewportSize({ width: 320, height: 844 });
    await expect(c.page.locator('.tavern-sign h1')).toHaveText('GACHATRIAD');
    await expect(c.page.locator('.tavern-noticeboard')).toContainText('2 boosters non ouverts');
    await fits(c.page);
    await c.page.evaluate(() => scrollTo(0, 0));
    await c.page.screenshot({
      path: info.outputPath('tavern-fr.png'),
      fullPage: info.project.name === 'mobile',
    });
    await c.page.waitForTimeout(2500);
    expect(dailyReads).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await c.context.close();
  }
});

test('shows the exact human Elo outcome and queues again without changing the deck', async ({
  browser,
}, info) => {
  const a = await player(browser),
    b = await player(browser);
  try {
    for (const c of [a, b]) await platform.store.acknowledgeRanked(c.profile.id);
    await platform.store.createLobby(a.profile, { mode: 'ranked', allowBots: false });
    const { matchId } = await platform.store.createLobby(b.profile, {
      mode: 'ranked',
      allowBots: false,
    });
    await platform.store.resign(b.profile.id, matchId!);
    const actual = await platform.store.view(a.profile.id, matchId!);
    expect(actual.ratingApplies).toBe(true);
    await a.page.goto(`/?match=${matchId}`);
    const result = a.page.locator('.result-v15[open]');
    await expect(result.locator('h2')).toHaveText('Victory');
    await expect(result.locator('.rated-result')).toContainText(`${actual.ratedResult!.delta} Elo`);
    await expect(result.locator('.result-rating-path')).toContainText(
      String(actual.ratedResult!.rating),
    );
    await expect(result).toContainText('No Stellar Prisms awarded.');
    const hint = result.getByRole('button', { name: 'About rating changes', exact: true });
    await hint.focus();
    await expect(result.getByRole('tooltip')).toBeVisible();
    await a.page.keyboard.press('Escape');
    await expect(result).toBeVisible();
    await expect(result.getByRole('tooltip')).toBeHidden();
    await a.page.screenshot({ path: info.outputPath('ranked-victory-en.png') });
    await b.context.addInitScript(() => localStorage.setItem('triad-language', 'fr'));
    await b.page.goto(`/?match=${matchId}`);
    await expect(b.page.locator('.result-v15 h2')).toHaveText(/Defeat|Défaite/);
    await b.page.screenshot({ path: info.outputPath('ranked-defeat.png') });
    await result.getByRole('button', { name: 'Queue again', exact: true }).click();
    await expect(a.page.locator('.queue-status')).toBeVisible();
    const after = await platform.store.profile(a.actor);
    expect(after.waitingLobby?.mode).toBe('ranked');
    expect(after.deck).toEqual(a.profile.deck);
    expect(after.inventory).toEqual(a.profile.inventory);
    if (after.waitingLobbyId) await platform.store.cancelLobby(a.profile.id, after.waitingLobbyId);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

async function finishWith(matchId: string, target: 0 | 'draw') {
  const [row] = await platform.db.read((sql) =>
    sql<{ state: GameState }>('SELECT state FROM matches WHERE id=$1', [matchId]),
  );
  let path: Move[] | null = null;
  for (let attempt = 0; attempt < 600 && !path; attempt++) {
    const random = seededRandom(1500 + attempt);
    let state = row.state;
    const moves: Move[] = [];
    while (state.status === 'playing') {
      const choices = legalMoves(state),
        move = choices[Math.floor(random() * choices.length)];
      moves.push(move);
      state = applyMove(state, move);
    }
    if (winner(state) === target) path = moves;
  }
  expect(path, 'A legal authored outcome should be available').not.toBeNull();
  for (const move of path!) {
    const [record] = await platform.db.read((sql) =>
      sql<{ player0: string; player1: string; version: number }>(
        'SELECT player0,player1,version FROM matches WHERE id=$1',
        [matchId],
      ),
    );
    await platform.store.move(
      move.player === 0 ? record.player0 : record.player1,
      matchId,
      move.cardId,
      move.cell,
      record.version,
    );
  }
}

test('shows saved win and draw rewards and returns to the tavern without awarding twice', async ({
  browser,
}, info) => {
  const a = await player(browser),
    b = await player(browser);
  try {
    for (const target of [0, 'draw'] as const) {
      const before = await platform.store.profile(a.actor);
      await platform.store.createLobby(a.profile, { mode: 'casual', allowBots: false });
      const { matchId } = await platform.store.createLobby(b.profile, {
        mode: 'casual',
        allowBots: false,
      });
      await finishWith(matchId!, target);
      const actual = await platform.store.view(a.profile.id, matchId!);
      expect(actual.prismReward).toBe(target === 'draw' ? 25 : 50);
      await a.page.goto(`/?match=${matchId}`);
      const result = a.page.locator('.result-v15[open]');
      await expect(result.locator('h2')).toHaveText(target === 'draw' ? 'Draw' : 'Victory');
      await expect(result.locator('.prism-reward')).toContainText(
        `+${actual.prismReward} Stellar Prisms`,
      );
      await expect(result.locator('.result-highlights')).toBeVisible();
      await expect(result.getByRole('button', { name: 'Queue again', exact: true })).toBeInViewport(
        { ratio: 1 },
      );
      await a.page.screenshot({
        path: info.outputPath(target === 'draw' ? 'draw-result.png' : 'complete-victory.png'),
      });
      await a.page.reload();
      await expect(result.locator('h2')).toBeVisible();
      expect((await platform.store.profile(a.actor)).prisms - before.prisms).toBe(
        actual.prismReward,
      );
      await result.getByRole('button', { name: 'Back to the tavern', exact: true }).click();
      await expect(a.page.locator('.tavern-sign')).toBeVisible();
      expect((await platform.store.profile(a.actor)).deck).toEqual(a.profile.deck);
    }
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test('keeps custom Trade One settlement in the results and blocks leaving until it is resolved', async ({
  browser,
}, info) => {
  const a = await player(browser),
    b = await player(browser);
  try {
    const { lobbyId } = await platform.store.createLobby(a.profile, {
      mode: 'custom',
      rules: { allOpen: false, threeOpen: false, same: true, plus: true, combo: true },
      tradeRule: 'one',
      allowBots: false,
    });
    const { matchId } = await platform.store.joinLobby(b.profile, lobbyId!);
    await platform.store.resign(b.profile.id, matchId!);
    await a.page.goto(`/?match=${matchId}`);
    const result = a.page.locator('.result-v15[open]');
    await expect(result.locator('.trade-choices button')).toHaveCount(5);
    await expect(
      result.getByRole('button', { name: 'Back to the tavern', exact: true }),
    ).toBeDisabled();
    await expect(result.getByRole('button', { name: 'Queue again', exact: true })).toHaveCount(0);
    await a.page.screenshot({ path: info.outputPath('trade-one-result.png') });
    const selected = await platform.store.view(a.profile.id, matchId!);
    const card = selected.trade.choices[0];
    const before = (await platform.store.profile(a.actor)).inventory[card.id]?.quantity ?? 0;
    await result.getByRole('button', { name: `Claim ${card.name}`, exact: true }).click();
    await expect(result.locator('.trade-choices')).toHaveCount(0);
    await expect(
      result.getByRole('button', { name: 'Back to the tavern', exact: true }),
    ).toBeEnabled();
    expect((await platform.store.profile(a.actor)).inventory[card.id].quantity).toBe(before + 1);
    await result.getByRole('button', { name: 'Back to the tavern', exact: true }).click();
    await expect(a.page.locator('.tavern-sign')).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
