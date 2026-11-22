import { expect, test, type Browser, type Locator } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { createPlatform } from '../../apps/server/src/app';
import {
  legalMoves,
  RANKED_RULES,
  STANDARD,
  type GameState,
} from '../../packages/engine/src/index';
import { COSMETIC_SETS } from '../../packages/shared/src/customization';
import { CARDS } from '../../packages/shared/src/index';
import { navigateTo, openNavigation } from './helpers';

let platform: Awaited<ReturnType<typeof createPlatform>>;
let origin: string;
let serial = 0;
test.beforeAll(async () => {
  const previous = process.env.DATA_DIR;
  const previousLocalTest = process.env.TRIAD_LOCAL_TEST;
  process.env.DATA_DIR = await mkdtemp(resolve('.cache/pw-multiplayer-'));
  process.env.TRIAD_LOCAL_TEST = 'true';
  try {
    platform = await createPlatform(resolve('.'), { memory: true, timers: false });
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    if (previousLocalTest === undefined) delete process.env.TRIAD_LOCAL_TEST;
    else process.env.TRIAD_LOCAL_TEST = previousLocalTest;
  }
  await platform.bots.set(false);
  await platform.app.listen({ port: 0, host: '127.0.0.1' });
  origin = `http://127.0.0.1:${(platform.app.server.address() as { port: number }).port}`;
});
test.afterAll(async () => {
  await platform?.app.close();
});

async function player(browser: Browser, name?: string) {
  const n = ++serial;
  const remoteAddress = `198.19.23.${n}`;
  const signup = await platform.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    remoteAddress,
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: {
      name: name ?? `Multiplayer tester ${n}`,
      email: `multiplayer-${n}@test.invalid`,
      password: 'isolated-multiplayer-password',
    },
  });
  expect(signup.statusCode, signup.body).toBe(200);
  const token = String(signup.headers['set-auth-token']);
  const actor = { ...signup.json().user, isAnonymous: false };
  const profile = await platform.store.profile(actor);
  for (const pack of await platform.store.economy.list(profile.id))
    await platform.store.economy.open(profile.id, pack.id);
  await platform.store.rebuildDeck(profile.id);
  await platform.store.completeTutorial(profile.id);
  const mobile = test.info().project.name === 'mobile';
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:3000',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
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
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  return {
    profile: await platform.store.profile(actor),
    context,
    page: await context.newPage(),
    async request(path: string, payload: Record<string, unknown>, expectedStatus = 200) {
      const result = await platform.app.inject({
        method: 'POST',
        url: `/api${path}`,
        payload,
        remoteAddress,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(result.statusCode, result.body).toBe(expectedStatus);
      return result.json();
    },
  };
}

test('restores a duel after going offline and during a slow refresh', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop');
  const a = await player(browser);
  const b = await player(browser);
  try {
    await platform.store.createLobby(a.profile, { mode: 'casual' });
    const { matchId } = await platform.store.createLobby(b.profile, { mode: 'casual' });
    const [initial] = await platform.db.read((sql) =>
      sql<{ state: GameState; player0: string; player1: string; version: number }>(
        'SELECT state,player0,player1,version FROM matches WHERE id=$1',
        [matchId],
      ),
    );
    const moverId = initial.state.turn === 0 ? initial.player0 : initial.player1;
    const viewer = moverId === a.profile.id ? b : a;
    const { page } = viewer;
    await viewer.context.addInitScript(() => localStorage.setItem('triad-language', 'fr'));
    await page.goto('/');
    await expect(page.getByTestId('cell-0')).toBeVisible();
    await viewer.context.setOffline(true);
    const status = page.locator('.play-connection');
    await expect(status).toContainText('Vous êtes hors ligne.');
    for (const [width, height] of [
      [1280, 720],
      [1366, 768],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(status).toBeInViewport({ ratio: 1 });
      await expect(page.getByTestId('cell-0')).toBeVisible();
    }
    const move = legalMoves(initial.state)[0];
    await platform.store.move(moverId, matchId!, move.cardId, move.cell, initial.version);
    await viewer.context.setOffline(false);
    await expect(page.getByTestId(`cell-${move.cell}`).locator('.playing-card')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`match=${matchId}$`));

    const path = `**/api/matches/${matchId}`;
    await page.route(path, (route) =>
      route.fulfill({ status: 503, contentType: 'text/html', body: '' }),
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    const retry = page.getByRole('button', { name: 'Réessayer la connexion' });
    await expect(retry).toBeVisible();
    await page.unroute(path);
    await retry.click();
    await expect(page.getByTestId(`cell-${move.cell}`).locator('.playing-card')).toBeVisible();

    let resume!: () => void;
    const blocked = new Promise<void>((resolve) => {
      resume = resolve;
    });
    await page.route(path, async (route) => {
      await blocked;
      await route.continue();
    });
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Ouverture de votre partie' })).toBeVisible();
      await expect(page.locator('.matchmaking-panel')).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('match-recovery-fr.png') });
    } finally {
      resume();
    }
    await expect(page.getByTestId(`cell-${move.cell}`).locator('.playing-card')).toBeVisible();
    await expect(page.getByTestId('player-card').first()).toBeEnabled();
  } finally {
    await Promise.all([a.context.close(), b.context.close()]);
  }
});

test('shows bilingual achievement rewards and claims them from the desktop browser', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  const { page, profile, context } = await player(browser);
  try {
    await platform.db.read((sql) =>
      sql('UPDATE profiles SET played=2,draws=1,perfect_wins=1 WHERE id=$1', [profile.id]),
    );
    await page.goto('/achievements/?achievement=first-draw');
    const detail = page.getByRole('complementary', { name: 'Achievement details' });
    await expect(page.locator('.achievement-list .achievement-row')).toHaveCount(30);
    await expect(detail.getByText('50 Stellar Prisms', { exact: true })).toBeVisible();
    await page.locator('select[name="achievement-status"]').selectOption('reward');
    await expect(page.locator('.achievement-list .achievement-row')).toHaveCount(2);
    await detail.getByRole('button', { name: 'Claim reward' }).click();
    await expect(page.locator('.achievement-list .achievement-row')).toHaveCount(1);
    await page.evaluate(() => localStorage.setItem('triad-language', 'fr'));
    await page.goto('/achievements/?achievement=perfect');
    const claim = page.locator('.achievement-reward button');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('.achievement-reward strong')).toHaveText('Booster standard');
    await expect(claim).toHaveText('Récupérer la récompense');
    for (const [width, height] of [
      [1280, 720],
      [1366, 768],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(claim).toBeInViewport({ ratio: 1 });
    }
    await claim.click();
    await expect(page.locator('.achievement-reward small')).toHaveText('Récupérée');
    await page.reload();
    await expect(page.locator('.achievement-reward small')).toHaveText('Récupérée');
  } finally {
    await context.close();
  }
});

test('syncs boosters and Market listings only where they are needed', async ({ browser }) => {
  const owner = await player(browser);
  const viewer = await player(browser);
  try {
    for (const context of [owner.context, viewer.context])
      await context.addInitScript(() => {
        Object.defineProperty(document, 'hidden', { get: () => false });
      });
    const market = await viewer.context.newPage();
    await Promise.all([
      owner.page.goto('/boosters/'),
      viewer.page.goto('/lobbies/'),
      market.goto('/market/'),
    ]);
    await expect(owner.page.getByRole('button', { name: 'Claim daily booster' })).toBeEnabled();
    await expect(market.getByRole('heading', { name: 'Market', exact: true })).toBeVisible();
    await expect.poll(() => platform.store.isOnline?.(viewer.profile.id)).toBe(true);
    // Let socket reconnect and initial navigation reads settle before counting mutation traffic.
    await viewer.page.waitForTimeout(2250);
    const requests = (page: typeof market) => {
      const paths: string[] = [];
      page.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        if (request.method() === 'GET' && path.startsWith('/api/')) paths.push(path);
      });
      return paths;
    };
    const lobbyReads = requests(viewer.page),
      marketReads = requests(market);
    const daily = await owner.request('/boosters/daily', {});
    await expect(owner.page.getByRole('button', { name: 'Daily claimed' })).toBeVisible();
    await owner.request('/boosters/open-batch', { packIds: [daily.id] });
    await owner.request('/trades', { offered: owner.profile.deck[0], price: 237 });
    await expect(market.locator('.trade-offer').filter({ hasText: '237' })).toBeVisible();
    expect(marketReads).toEqual(['/api/trades']);
    expect(lobbyReads).toEqual([]);
  } finally {
    await owner.context.close();
    await viewer.context.close();
  }
});

test('fills the desktop Market with portrait offers and keeps chat optional', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  const { page, context } = await player(browser);
  try {
    const cards = CARDS.filter((card) => card.enabled).slice(0, 16);
    await page.route('**/api/trades?includeSales=true', (route) =>
      route.fulfill({
        json: cards.slice(0, 8).map((offered, i) => ({
          id: `offer-${i}`,
          ownerId: `market-player-${i}`,
          owner: `Market player ${i}`,
          offered,
          wanted: i % 2 === 0 ? cards[i + 8] : null,
          price: i % 2 === 0 ? null : 150,
          createdAt: new Date().toISOString(),
        })),
      }),
    );

    for (const language of ['en', 'fr']) {
      await page.goto('/market/');
      await page.evaluate((lang) => localStorage.setItem('triad-language', lang), language);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      const grid = page.locator('.trade-grid');
      await expect(grid.locator('.trade-offer')).toHaveCount(8);
      const chat = page.locator('.public-chat-disclosure');
      await expect(chat.locator('.main-chat')).toBeHidden();
      await chat.locator('summary').click();
      await expect(
        chat.getByRole('tab', { name: language === 'fr' ? 'Échanges' : 'Trade' }),
      ).toHaveAttribute('aria-selected', 'true');
      await chat.locator('summary').click();
      await expect(chat.locator('.main-chat')).toBeHidden();

      for (const [width, height, columns] of [
        [1280, 720, 3],
        [1366, 768, 3],
        [1920, 1080, 4],
      ]) {
        await page.setViewportSize({ width, height });
        const layout = await grid.evaluate((el) => ({
          width: el.clientWidth,
          panelWidth: el.closest('.market-offers-panel')!.clientWidth,
          columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
          ratios: Array.from(el.querySelectorAll('.playing-card, .market-payment'), (card) => {
            const { width, height } = card.getBoundingClientRect();
            return width / height;
          }),
        }));
        expect(layout.width).toBe(layout.panelWidth);
        expect(layout.columns).toBe(columns);
        expect(layout.ratios).toHaveLength(16);
        for (const ratio of layout.ratios) expect(ratio).toBeCloseTo(3 / 4, 2);
        await page.screenshot({ path: info.outputPath(`market-${language}-${width}.png`) });
      }
    }
  } finally {
    await context.close();
  }
});

test('keeps a duel invitation in the top-bar inbox and skips profile and board reads for battle chat', async ({
  browser,
}, info) => {
  const a = await player(browser);
  const b = await player(browser);
  try {
    await a.request('/friends/request', { playerId: b.profile.id });
    await b.request(`/friends/${a.profile.id}/accept`, {});
    await a.page.goto('/');
    await b.page.goto('/cards/');
    await expect(b.page.getByRole('button', { name: 'Logout' })).toBeVisible();
    await expect.poll(() => platform.store.isOnline?.(b.profile.id)).toBe(true);
    await a.request('/invites', { playerId: b.profile.id });
    const shortcut = b.page.locator('.social-navigation');
    await expect(shortcut.locator('.social-indicator')).toHaveText('!');
    await expect(shortcut).toBeInViewport({ ratio: 1 });
    const popup = b.page.locator('.live-invite-popup');
    await expect(popup).toContainText('Live duel invitation');
    await expect(popup).toContainText(a.profile.name);
    await expect(popup.getByRole('link')).toHaveAttribute('href', /\/social\/?\?tab=inbox$/);
    await expect(popup).toBeInViewport({ ratio: 1 });
    await expect(a.page.locator('.live-invite-popup')).toHaveCount(0);
    await expect(popup).toHaveCount(0, { timeout: 12_000 });
    await expect(shortcut.locator('.social-indicator')).toHaveText('!');
    await navigateTo(b.page, 'Decks');
    await shortcut.click();
    const inbox = b.page.getByRole('region', { name: 'Duel invitations' });
    await expect(inbox).toContainText(a.profile.name);
    await b.page.screenshot({ path: info.outputPath('duel-inbox.png') });
    await inbox.getByRole('button', { name: 'Accept duel' }).click();
    await expect(b.page.getByTestId('cell-0')).toBeVisible();
    await expect(a.page.getByTestId('cell-0')).toBeVisible();
    await expect(shortcut.locator('.social-indicator')).toHaveCount(0);
    if (info.project.name === 'mobile') await b.page.locator('.comms-mobile-toggle').click();
    const log = b.page.getByRole('log', { name: 'Battle chat messages' });
    await expect(log).toContainText('Only you and your opponent can read this chat.');
    const matchId = new URL(b.page.url()).searchParams.get('match')!;
    const reads: string[] = [];
    b.page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (request.method() === 'GET' && path.startsWith('/api/')) reads.push(path);
    });
    await a.request(`/matches/${matchId}/chat`, {
      message: 'Good luck!',
      requestId: 'multiplayer-private-chat-1',
    });
    await expect(log).toContainText('Good luck!');
    expect(reads).toContain(`/api/matches/${matchId}/chat`);
    expect(reads).not.toContain(`/api/matches/${matchId}`);
    expect(reads).not.toContain('/api/profile');
    if (info.project.name === 'mobile') await a.page.locator('.comms-mobile-toggle').click();
    await a.page.getByRole('button', { name: 'Language: English', exact: true }).click();
    await a.page.getByRole('menuitemradio', { name: 'Français', exact: true }).click();
    const composer = b.page.getByRole('textbox', { name: 'Message your opponent' });
    await composer.fill('A draft to keep');
    await b.page.getByRole('button', { name: 'Quick chat', exact: true }).click();
    const picker = b.page.getByRole('group', { name: 'Quick chat phrases' });
    await expect(picker.getByRole('button')).toHaveCount(4);
    expect(await picker.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await b.page.screenshot({ path: info.outputPath('quick-chat.png') });
    await picker.getByRole('button', { name: 'Nice play!' }).click();
    await expect(picker).toHaveCount(0);
    await expect(composer).toHaveValue('A draft to keep');
    await expect(
      a.page
        .getByRole('log', { name: 'Messages de la partie' })
        .locator('[data-stamp="nice-play"]'),
    ).toHaveText('Bien joué !');
    await expect(b.page.getByTestId('cell-0')).toBeVisible();
    await b.page.getByRole('tab', { name: 'Friends', exact: true }).click();
    await b.page.getByRole('button', { name: new RegExp(a.profile.name) }).click();
    const privateChat = b.page.locator('.arena-comms .private-comms-embedded');
    await privateChat.getByRole('textbox').fill('We can chat here too.');
    await privateChat.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(privateChat.getByRole('log')).toContainText('We can chat here too.');
    await expect(b.page.getByTestId('cell-0')).toBeVisible();
    await privateChat.getByRole('button', { name: 'Back to conversations' }).click();
    await expect(privateChat).toHaveCount(0);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test('fits French correspondence invitations and follows turn reminders in Social', async ({
  browser,
}, info) => {
  const a = await player(browser, 'Akeno Correspondence Challenger');
  const b = await player(browser);
  try {
    await a.page.goto('/social/');
    await a.page.getByRole('searchbox', { name: 'Find a player' }).fill(b.profile.name);
    await a.page.getByRole('button', { name: 'Search players' }).click();
    await a.page
      .getByRole('region', { name: 'Search results' })
      .getByRole('button', { name: 'Add friend' })
      .click();
    await b.page.goto('/cards/');
    await expect(b.page.locator('.social-indicator')).toBeVisible();
    await b.page.locator('.social-navigation').click();
    await b.page.getByRole('button', { name: 'Accept friend' }).click();
    await expect(b.page.locator('.social-indicator')).toHaveCount(0);
    await b.page.getByRole('tab', { name: 'Friends', exact: true }).click();
    const identity = b.page.getByRole('region', { name: 'Your friends' }).getByRole('article');
    await expect(identity).toContainText(a.profile.name);
    expect(await identity.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await a.page.getByRole('link', { name: 'Back to play', exact: true }).click();
    const play = a.page.getByRole('region', { name: 'Match setup' });
    const lobbies = play.getByRole('link', { name: 'Browse lobbies', exact: true });
    const correspondence = play.getByRole('link', { name: 'Correspondence', exact: true });
    await expect(correspondence).toBeVisible();
    expect((await correspondence.boundingBox())!.y).toBeGreaterThan(
      (await lobbies.boundingBox())!.y,
    );
    await correspondence.click();
    await a.page.getByRole('link', { name: 'Invite a friend', exact: true }).click();
    const friend = a.page.getByRole('region', { name: 'Your friends' }).getByRole('article');
    await friend.getByRole('button', { name: 'Invite', exact: true }).click();
    const dialog = a.page.getByRole('dialog', { name: 'Invite to play' });
    await expect(dialog.getByRole('combobox', { name: 'Match type' })).toHaveValue(
      'correspondence',
    );
    await dialog.getByRole('combobox', { name: 'Hours per turn' }).selectOption('72');
    await dialog.getByRole('button', { name: 'Send invitation' }).click();
    await expect(a.page.getByText('Correspondence invitation sent', { exact: true })).toBeVisible();
    await expect(a.page.getByText('72h per turn', { exact: true })).toBeVisible();
    await b.page.goto('/cards/');
    await b.page.getByRole('button', { name: 'Language: English', exact: true }).click();
    await b.page.getByRole('menuitemradio', { name: 'Français', exact: true }).click();
    const shortcut = b.page.locator('.social-navigation');
    await expect(shortcut.locator('.social-indicator')).toBeVisible();
    await shortcut.click();
    const invitation = b.page.locator('.social-card[data-incoming=true]').first();
    await expect(invitation).toContainText(a.profile.name);
    await expect(invitation).toContainText('Invitation par correspondance');
    await expect(invitation).toContainText('72 h par tour');
    await expect(b.page.locator('.live-invite-popup')).toHaveCount(0);
    const check = async () => {
      await expect(invitation.getByRole('button', { name: 'Accepter la partie' })).toBeInViewport();
      expect(
        await invitation.evaluate((el) => {
          const header = el.querySelector('.social-identity')!.getBoundingClientRect();
          const actions = el.querySelector('.social-card-actions')!.getBoundingClientRect();
          return el.scrollWidth <= el.clientWidth && actions.y >= header.bottom;
        }),
      ).toBe(true);
      expect(await b.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    };
    if (info.project.name === 'desktop') {
      for (const [width, height] of [
        [1280, 720],
        [1366, 768],
        [1920, 1080],
      ]) {
        await b.page.setViewportSize({ width, height });
        await check();
        await b.page.screenshot({ path: info.outputPath(`correspondence-inbox-${width}.png`) });
      }
    } else await check();
    await invitation.getByRole('button', { name: 'Accepter la partie' }).click();
    const accepted = b.page.getByRole('link', { name: 'Ouvrir la partie' });
    await expect(accepted).toBeVisible();
    const matchId = (await accepted.getAttribute('href'))!.split('correspondence=')[1];
    await a.page.goto('/social/?tab=inbox');
    const [match] = await platform.store.db.read((sql) =>
      sql<{ state: GameState; player0: string; version: number }>(
        'SELECT state,player0,version FROM matches WHERE id=$1',
        [matchId],
      ),
    );
    const hostStarts = match.state.turn === (match.player0 === a.profile.id ? 0 : 1);
    const mover = hostStarts ? a : b;
    const other = hostStarts ? b : a;
    const turnRegion = (current: typeof a) =>
      current.page.getByRole('region', {
        name: current === a ? 'Correspondence · Your turn' : 'Correspondance · À votre tour',
      });
    const resume = (current: typeof a) =>
      turnRegion(current).getByRole('link', {
        name: current === a ? 'Resume match' : 'Reprendre la partie',
      });
    await expect(turnRegion(mover)).toContainText(other.profile.name);
    await expect(resume(mover)).toHaveAttribute('href', `/?correspondence=${matchId}`);
    await expect(mover.page.locator('.social-indicator')).toBeVisible();
    await expect(turnRegion(other)).toHaveCount(0);
    await expect(other.page.locator('.social-indicator')).toHaveCount(0);
    const move = legalMoves(match.state)[0];
    await mover.request(`/matches/${matchId}/move`, {
      cardId: move.cardId,
      cell: move.cell,
      version: match.version,
    });
    await expect(turnRegion(mover)).toHaveCount(0);
    await expect(mover.page.locator('.social-indicator')).toHaveCount(0);
    await expect(other.page.locator('.social-indicator')).toBeVisible();
    await resume(other).click();
    await expect(other.page).toHaveURL(new RegExp(`correspondence=${matchId}$`));
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test('sets up a featured table and follows its public link at desktop sizes', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  const host = await player(browser);
  const opponent = await player(browser);
  const spectator = await browser.newContext({ baseURL: 'http://127.0.0.1:3000' });
  try {
    await host.page.goto('/lobbies/');
    const featured = host.page.getByRole('region', { name: 'All Open Night' });
    await expect(featured).toContainText('20:00–23:00 Paris time');
    await expect(featured).toContainText('Combo');
    await featured.getByRole('button', { name: 'Set up featured table' }).click();
    await expect(host.page.getByRole('combobox', { name: 'Visibility' })).toHaveValue('allOpen');
    await host.page.getByRole('textbox', { name: 'Lobby name' }).fill('All Open practice table');
    await host.page.getByRole('button', { name: 'Open lobby · 1/2' }).click();
    const row = host.page.getByRole('article').filter({ hasText: 'All Open practice table' });
    await expect(row).toContainText('No trade');
    await host.context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await row.getByRole('button', { name: 'Share table' }).click();
    const dialog = host.page.getByRole('dialog', { name: 'Share table' });
    await dialog.getByRole('button', { name: 'Copy link' }).click();
    await expect(dialog.getByRole('status')).toHaveText('Link copied.');
    const link = await host.page.evaluate(() => navigator.clipboard.readText());
    expect(link).toBe(await dialog.getByRole('textbox', { name: 'Table link' }).inputValue());
    const url = new URL(link);
    expect(url.pathname).toBe('/lobbies/');
    expect(url.searchParams.get('server')).toBe(origin);
    const tableId = url.searchParams.get('table');
    expect(tableId).toBeTruthy();
    const look = await spectator.newPage();
    await look.goto(link);
    await look.getByRole('button', { name: 'Connect to server' }).click();
    await expect(look.getByRole('heading', { name: 'Shared table', exact: true })).toBeVisible();
    expect(new URL(look.url()).searchParams.get('table')).toBe(tableId);
    await look.getByRole('link', { name: 'Open starter boosters' }).click();
    await look.getByRole('button', { name: 'Skip opening animation' }).click();
    await look.getByRole('button', { name: 'Continue', exact: true }).click();
    await look.getByRole('link', { name: 'Back to shared table' }).click();
    await look.getByRole('button', { name: 'Learn how to play' }).click();
    await look.getByRole('button', { name: 'Close tutorial' }).click();

    await opponent.page.goto(link);
    const join = opponent.page.getByRole('button', { name: 'Join table' });
    await expect(join).toBeEnabled();
    await join.click();
    await expect(look.getByRole('link', { name: 'Spectate' })).toBeVisible();

    await look.getByRole('link', { name: 'Browse all tables' }).click();
    await look.getByRole('link', { name: 'Read the rulebook instead' }).click();
    await look.getByRole('button', { name: 'I’ve read the rules · Unlock duels' }).click();
    await expect(look.locator('.rulebook-onboarding')).toHaveCount(0);
    await look.goto('/lobbies/');
    for (const language of ['en', 'fr']) {
      if (language === 'fr') {
        await look.getByRole('button', { name: 'Language: English', exact: true }).click();
        await look.getByRole('menuitemradio', { name: 'Français' }).click();
      }
      const card = look.getByRole('region', {
        name: language === 'fr' ? 'Soirée Mains ouvertes' : 'All Open Night',
      });
      for (const [width, height] of [
        [1280, 720],
        [1366, 768],
        [1920, 1080],
      ]) {
        await look.setViewportSize({ width, height });
        await expect(card).toBeInViewport();
        const hasOverflow = await look.evaluate(() =>
          [
            document.documentElement,
            ...Array.from(document.querySelectorAll('.featured-lobby, .lobby-row, .lobby-join')),
          ].some((el) => el.scrollWidth > el.clientWidth + 1),
        );
        expect(hasOverflow).toBe(false);
        await look.screenshot({ path: info.outputPath(`community-${language}-${width}.png`) });
      }
    }
    await platform.store.db.tx((sql) =>
      sql('UPDATE lobbies SET spectatable=false WHERE id=$1', [tableId]),
    );
    await look.goto(link);
    await expect(
      look.getByRole('heading', { name: 'Cette table n’est plus disponible.' }),
    ).toBeVisible();
    await expect(look.getByText('All Open practice table', { exact: true })).toHaveCount(0);
    await expect(look.getByRole('link', { name: 'Observer' })).toHaveCount(0);
  } finally {
    await host.context.close();
    await opponent.context.close();
    await spectator.close();
  }
});

test('delivers a move to its opponent and spectator without reloading profiles or chat', async ({
  browser,
}) => {
  const a = await player(browser);
  const b = await player(browser);
  const watcher = await player(browser);
  try {
    await a.request('/lobbies', { mode: 'casual', allowBots: false });
    const { matchId } = await b.request('/lobbies', { mode: 'casual', allowBots: false });
    await Promise.all([
      a.page.goto(`/?match=${matchId}`),
      b.page.goto(`/?match=${matchId}`),
      watcher.page.goto(`/?spectate=${matchId}`),
    ]);
    const players = [a, b];
    for (const client of [...players, watcher]) {
      await expect(client.page.getByTestId('cell-0')).toBeVisible();
      await expect.poll(() => platform.store.isOnline?.(client.profile.id)).toBe(true);
    }
    // Let the initial socket connection and profile hydration finish before counting move traffic.
    await a.page.waitForTimeout(1700);
    const match = await platform.store.view(a.profile.id, matchId);
    const mover = players[match.game!.turn];
    const opponent = players[1 - match.game!.turn];
    const reads = [mover, opponent, watcher].map(({ page }) => {
      const requests: string[] = [];
      page.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        if (request.method() === 'GET' && path.startsWith('/api/')) requests.push(path);
      });
      return requests;
    });
    await mover.page.getByTestId('player-card').first().click();
    await mover.page.getByTestId('cell-0').click();
    for (const client of [mover, opponent, watcher])
      await expect(client.page.getByTestId('cell-0').locator('.playing-card')).toBeVisible();
    expect(reads).toEqual([[], [`/api/matches/${matchId}`], [`/api/spectate/${matchId}`]]);
  } finally {
    await Promise.all([a.context.close(), b.context.close(), watcher.context.close()]);
  }
});

test('aligns friend cards with and without titles in both languages', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop');
  const viewer = await player(browser);
  const titled = await player(browser, 'Titled friend');
  const untitled = await player(browser, 'Untitled friend');
  try {
    const duel = await platform.store.solo(titled.profile.id, 'easy', STANDARD);
    await platform.store.resign(titled.profile.id, duel);
    await titled.request('/profile/title', { titleId: 'card-player' });
    for (const friend of [titled, untitled]) {
      await friend.request('/friends/request', { playerId: viewer.profile.id });
      await viewer.request(`/friends/${friend.profile.id}/accept`, {});
    }
    await viewer.page.goto('/social/');
    const friends = viewer.page.locator('.social-friends-grid');
    await expect(friends.getByRole('article')).toHaveCount(2);
    for (const locale of ['en', 'fr']) {
      if (locale === 'fr') {
        await viewer.page.getByRole('button', { name: 'Language: English', exact: true }).click();
        await viewer.page.getByRole('menuitemradio', { name: 'Français', exact: true }).click();
        await expect(friends.getByRole('button', { name: 'Inviter', exact: true })).toHaveCount(2);
      }
      for (const [width, height] of [
        [1280, 720],
        [1366, 768],
        [1920, 1080],
      ]) {
        await viewer.page.setViewportSize({ width, height });
        const cards = await friends.getByRole('article').evaluateAll((articles) =>
          articles.map((article) => ({
            height: article.getBoundingClientRect().height,
            name: article.querySelector('h3')!.getBoundingClientRect().top,
            actions: article.querySelector('.social-card-actions')!.getBoundingClientRect().top,
            metadata: article.querySelectorAll('.social-identity small').length,
          })),
        );
        expect(cards.map((card) => card.metadata).sort()).toEqual([1, 2]);
        for (const key of ['height', 'name', 'actions'] as const)
          expect(Math.abs(cards[0][key] - cards[1][key])).toBeLessThan(1);
      }
      await friends.screenshot({ path: info.outputPath(`friend-cards-${locale}.png`) });
    }
  } finally {
    await Promise.all([viewer.context.close(), titled.context.close(), untitled.context.close()]);
  }
});

async function waitForArt(art: Locator) {
  await art.evaluate(async (element) => {
    const image = new Image();
    image.src = getComputedStyle(element).backgroundImage.slice(5, -2);
    await image.decode();
    await document.fonts.ready;
  });
}

test('opens a mini profile from chat and sends custom correspondence rules', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  const playerWithArt = await player(browser, 'Regalia friend');
  const viewer = await player(browser, 'Chat tester');
  const { page } = viewer;
  try {
    await platform.store.setAvatar(playerWithArt.profile.id, playerWithArt.profile.deck[0]);
    await platform.db.read((sql) =>
      sql(
        `UPDATE profiles SET portrait_frame='regalia', profile_banner='regalia', selected_title='chain-reaction',
              rating=1000,ranked_random_rating=1002,draft_rating=1004,shared_draft_rating=1006
       WHERE id=$1`,
        [playerWithArt.profile.id],
      ),
    );
    await playerWithArt.request('/chat', {
      message: 'Mini profile check',
      requestId: 'mini-profile-chat-test',
      channel: 'general',
    });
    const miniFetches: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.endsWith('/mini')) miniFetches.push(path);
    });
    await page.goto('/play/');
    const sender = page
      .locator('.chat-message')
      .filter({ hasText: 'Mini profile check' })
      .getByRole('button', { name: 'Regalia friend', exact: true });
    await expect(sender).toBeVisible();
    expect(miniFetches).toHaveLength(0);
    await sender.hover();
    const preview = page.getByRole('dialog', { name: 'Player preview' });
    await expect(preview.locator('.mini-profile-ratings dd')).toHaveText([
      '1000',
      '1002',
      '1004',
      '1006',
    ]);
    await expect(preview.getByText('Chain Reaction', { exact: true })).toBeVisible();
    await expect(preview.locator('.regalia-banner-art')).toHaveCSS(
      'background-image',
      /regalia-banner-loop\.webp/,
    );
    await expect(preview.locator('.regalia-frame-art')).toHaveCSS(
      'background-image',
      /regalia-frame-loop\.webp/,
    );
    await Promise.all([
      waitForArt(preview.locator('.regalia-banner-art')),
      waitForArt(preview.locator('.regalia-frame-art')),
    ]);
    await expect(preview).toBeInViewport({ ratio: 1 });
    await preview.screenshot({ path: info.outputPath('mini-profile.png') });
    await preview.hover();
    await expect(preview.getByRole('button', { name: 'Add friend' })).toBeVisible();
    await preview.getByRole('button', { name: 'Add friend' }).click();
    await expect(preview.getByRole('status')).toHaveText('Friend request sent');
    await playerWithArt.request(`/friends/${viewer.profile.id}/accept`, {});
    await expect(preview.getByRole('button', { name: 'Invite to duel' })).toBeVisible();
    await expect(preview.getByRole('link', { name: 'Message' })).toHaveAttribute(
      'href',
      /tab=messages/,
    );
    await page.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);
    await sender.click();
    await expect(preview).toBeVisible();
    expect(miniFetches).toHaveLength(1);
    for (const [width, height] of [
      [1280, 720],
      [1366, 768],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(preview).toBeInViewport({ ratio: 1 });
    }
    const banner = preview.locator('.regalia-banner-art');
    const frame = preview.locator('.regalia-frame-art');
    const firstBanner = await banner.screenshot();
    const firstFrame = await frame.screenshot();
    await page.waitForTimeout(1100);
    expect((await banner.screenshot()).equals(firstBanner)).toBe(false);
    expect((await frame.screenshot()).equals(firstFrame)).toBe(false);
    await preview.getByRole('button', { name: 'Invite to duel' }).click();
    const invite = page.getByRole('dialog', { name: 'Invite to play' });
    await invite.getByRole('combobox', { name: 'Match type' }).selectOption('correspondence');
    await invite.getByRole('combobox', { name: 'Hours per turn' }).selectOption('24');
    const presets = invite.getByRole('combobox', { name: 'Rules', exact: true });
    await expect(presets.locator('option')).toHaveText([
      'Standard rules',
      'Random deck rules',
      'Custom rules',
    ]);
    await presets.selectOption('custom');
    await invite.getByRole('combobox', { name: 'Visibility' }).selectOption('allOpen');
    await invite.getByRole('checkbox', { name: 'Elemental' }).check();
    const sent = page.waitForResponse(
      (response) => response.url().endsWith('/api/invites') && response.ok(),
    );
    await invite.getByRole('button', { name: 'Send invitation' }).click();
    const { id } = await (await sent).json();
    const { matchId } = await playerWithArt.request(`/invites/${id}/respond`, { accept: true });
    expect(await platform.store.view(viewer.profile.id, matchId)).toMatchObject({
      mode: 'correspondence',
      turnHours: 24,
      rules: {
        allOpen: true,
        threeOpen: false,
        same: true,
        plus: true,
        combo: true,
        elemental: true,
      },
    });

    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    const practice = page.getByRole('dialog', { name: 'Practice' });
    const practiceRules = practice.getByRole('combobox', { name: 'Rules', exact: true });
    await expect(practiceRules.locator('option')).toHaveText([
      'Standard rules',
      'Random deck rules',
      'Custom rules',
    ]);
    await expect(practice.locator('.rule-badges')).toContainText('Three Open');
    await practiceRules.selectOption('random');
    await expect(practice.locator('.rule-badges')).toContainText('Random');
    await practiceRules.selectOption('custom');
    await expect(practice.getByRole('checkbox', { name: 'Same', exact: true })).toBeChecked();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Language: English', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Français', exact: true }).click();
    await sender.click();
    const frenchPreview = page.getByRole('dialog', { name: 'Aperçu du profil' });
    await expect(frenchPreview.getByText('Classé aléatoire', { exact: true })).toBeVisible();
    await expect(frenchPreview).toBeInViewport({ ratio: 1 });
  } finally {
    await Promise.all([playerWithArt.context.close(), viewer.context.close()]);
  }
});

test('an admin can grant one cosmetic achievement to a player on the test server', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(60_000);
  const admin = await player(browser, 'Test administrator');
  const recipient = await player(browser, 'Cosmetic tester');
  const path = '/admin/achievement-grants';
  const grant = { profileId: recipient.profile.id, achievementId: 'rated-500' };
  try {
    await platform.db.read((sql) =>
      sql(
        'INSERT INTO server_admins(auth_user_id) SELECT auth_user_id FROM profile_accounts WHERE profile_id=$1 AND is_primary',
        [admin.profile.id],
      ),
    );
    await recipient.request(path, grant, 403);
    await admin.request(path, { ...grant, achievementId: 'invalid' }, 400);
    const publicProfile = `/profile/?id=${recipient.profile.id}`;
    await Promise.all([admin.page.goto(publicProfile), recipient.page.goto('/play/')]);
    await expect.poll(() => platform.store.isOnline?.(recipient.profile.id)).toBe(true);
    await recipient.page.getByRole('button', { name: 'Game settings', exact: true }).click();
    await recipient.page.getByRole('button', { name: 'Appearance', exact: true }).click();
    const appearance = recipient.page.getByRole('dialog', { name: 'Appearance' });
    const board = appearance.locator('input[name="board-theme"][value="regalia"]');
    const back = appearance.locator('input[name="card-back"][value="regalia"]');
    await expect(board).toBeDisabled();
    await expect(back).toBeDisabled();

    const grants = admin.page.locator('.admin-grant');
    await grants.locator('summary').click();
    await grants.locator('select[name="admin-grant-select-1"]').selectOption('achievement');
    await grants
      .getByRole('combobox', { name: 'Achievement', exact: true })
      .selectOption('rated-500');
    await grants.getByRole('button', { name: 'Grant to Cosmetic tester' }).click();
    await expect(grants.getByRole('status')).toHaveText('Achievement granted.');
    await expect(board).toBeEnabled();
    await expect(back).toBeEnabled();
    await expect(appearance.locator('input[name="board-theme"][value="eclipse"]')).toBeDisabled();
    await expect(appearance.getByText('0 rated games', { exact: true })).toBeVisible();
    expect(await admin.request(path, grant)).toEqual({ granted: false });
    const [record] = await platform.db.read((sql) =>
      sql('SELECT granted_by FROM achievement_unlocks WHERE profile_id=$1 AND achievement_id=$2', [
        recipient.profile.id,
        'rated-500',
      ]),
    );
    expect(record.granted_by).toBe(admin.profile.id);
    await appearance.locator('label:has(input[name="board-theme"][value="regalia"])').click();
    await appearance.locator('label:has(input[name="card-back"][value="regalia"])').click();
    await appearance.getByRole('button', { name: 'Done' }).click();
    await expect(recipient.page.locator('.game-shell')).toHaveAttribute(
      'data-board-theme',
      'regalia',
    );
    await expect(recipient.page.locator('.game-shell')).toHaveAttribute(
      'data-card-back',
      'regalia',
    );

    await recipient.page.goto('/achievements/?achievement=rated-500');
    const achievement = recipient.page.getByRole('complementary', { name: 'Achievement details' });
    await expect(achievement.getByRole('heading', { name: 'Seat of Honor' })).toBeVisible();
    await expect(achievement.getByText('Regalia', { exact: true })).toBeVisible();
    await expect(achievement.getByText('Unlocked', { exact: true })).toBeVisible();
    await recipient.page.goto('/profile/');
    await recipient.page.getByRole('button', { name: 'Customize profile' }).click();
    const editor = recipient.page.getByRole('dialog', { name: 'Customize profile' });
    await editor.getByRole('tab', { name: 'Portrait frames' }).click();
    await editor.getByRole('button', { name: 'Regalia portrait frame' }).click();
    await editor.getByRole('tab', { name: 'Banners' }).click();
    await editor.locator('label:has(input[value="regalia"])').click();
    await editor.getByRole('button', { name: 'Save profile' }).click();
    await expect(recipient.page.locator('.profile-header')).toHaveAttribute(
      'data-profile-banner',
      'regalia',
    );
    await expect(recipient.page.locator('.profile-portrait .frame-regalia')).toBeVisible();
  } finally {
    await Promise.all([admin.context.close(), recipient.context.close()]);
  }
});

test('previews and retains battle cosmetics and shows a saved banner on another player’s profile', async ({
  browser,
}, info) => {
  const a = await player(browser);
  const b = await player(browser);
  const { page } = a;
  try {
    await platform.db.read((sql) =>
      sql(
        'INSERT INTO achievement_unlocks(profile_id,achievement_id) SELECT $1,unnest($2::text[])',
        [a.profile.id, COSMETIC_SETS.map(({ achievementId }) => achievementId)],
      ),
    );
    await b.context.addInitScript(() => {
      localStorage.setItem('triad-board-theme', 'regalia');
      localStorage.setItem('triad-card-back', 'regalia');
    });
    await page.goto('/');
    const setup = page.getByRole('region', { name: 'Match setup' });
    const customize = setup.getByRole('button', { name: 'Customize', exact: true });
    await expect(setup.getByRole('button', { name: 'Rulebook', exact: true })).toHaveCount(0);
    await openNavigation(page);
    await expect(
      page.locator('#main-navigation').getByRole('link', { name: 'Rulebook' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await customize.click();
    const fromPlay = page.getByRole('dialog', { name: 'Appearance', exact: true });
    await expect(fromPlay.getByRole('group', { name: 'Board theme' })).toBeVisible();
    await expect(fromPlay.getByRole('group', { name: 'Card back' })).toBeVisible();
    await expect(fromPlay.locator('.appearance-card-preview')).toHaveText(
      Array(7).fill('GACHA TRIAD'),
    );
    await expect(fromPlay.locator('.appearance-card-preview').locator('img, svg')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(customize).toBeFocused();
    const match = await platform.store.solo(a.profile.id, 'easy', STANDARD);
    await page.goto(`/?match=${match}`);
    const board = page.locator('.arena-screen .board');
    const table = page.locator('.arena-screen .battle-layout');
    const hiddenCard = page.locator('.cpu-hand .card-back').first();
    await expect(board).toHaveCSS('background-color', 'rgb(14, 25, 43)');
    await expect(hiddenCard).toBeVisible();
    const originalBack = await hiddenCard.evaluate(
      (card) => getComputedStyle(card).backgroundImage,
    );
    const settings = page.getByRole('button', { name: 'Game settings', exact: true });
    await settings.click();
    await page.getByRole('button', { name: 'Appearance', exact: true }).click();
    const appearance = page.getByRole('dialog', { name: 'Appearance', exact: true });
    await expect(
      appearance
        .getByRole('group', { name: 'Board theme' })
        .getByRole('radio', { name: 'Classic' }),
    ).toBeChecked();
    const classicImage = await table.evaluate((el) => getComputedStyle(el).backgroundImage);
    const classicThumbnail = appearance.locator(
      '.appearance-board-preview[data-board-theme="classic"]',
    );
    await expect(classicThumbnail).toHaveCSS('background-image', classicImage);
    for (const theme of ['slate', 'ember', 'jade', 'eclipse', 'regalia', 'astral']) {
      for (const setting of ['board-theme', 'card-back']) {
        await appearance.locator(`label:has(input[name="${setting}"][value="${theme}"])`).click();
      }
      await expect(table).toHaveCSS('background-image', new RegExp(`${theme}-board`));
      const thumbnail = appearance.locator(
        `.appearance-board-preview[data-board-theme="${theme}"]`,
      );
      await expect(thumbnail).toHaveCSS(
        'background-image',
        await table.evaluate((el) => getComputedStyle(el).backgroundImage),
      );
      await expect(thumbnail.locator('.appearance-preview-grid > span')).toHaveCount(9);
      expect(
        await thumbnail.evaluate(
          (el) => el.getBoundingClientRect().width > el.getBoundingClientRect().height,
        ),
      ).toBe(true);
      await expect(hiddenCard).toHaveCSS('background-image', new RegExp(`${theme}-back`));
      await Promise.all([waitForArt(table), waitForArt(hiddenCard)]);
      if (info.project.name === 'desktop')
        await table.screenshot({
          path: info.outputPath(`${theme}-arena.png`),
          style:
            'dialog.appearance-dialog, dialog.appearance-dialog::backdrop { visibility: hidden }',
        });
    }
    await expect(classicThumbnail).toHaveCSS('background-image', classicImage);
    await appearance
      .locator('.appearance-card-preview[data-card-back="astral"]')
      .screenshot({ path: info.outputPath('astral-card-back-preview.png') });
    await expect(appearance).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: info.outputPath('appearance.png') });
    await page.keyboard.press('Escape');
    await expect(appearance).toHaveCount(0);
    await expect(settings).toBeFocused();
    await page.reload();
    await expect(board).toHaveCSS('background-color', 'rgb(23, 20, 41)');
    await expect(hiddenCard).not.toHaveCSS('background-image', originalBack);
    await expect(hiddenCard).toHaveText('GACHA TRIAD');
    await expect(hiddenCard.locator('img, svg')).toHaveCount(0);
    if (info.project.name === 'desktop') {
      for (const [width, height] of [
        [1280, 720],
        [1366, 768],
        [1920, 1080],
      ]) {
        await page.setViewportSize({ width, height });
        await expect(board).toBeInViewport({ ratio: 1 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      await page.screenshot({ path: info.outputPath('cosmetic-arena.png') });
    }
    await platform.store.resign(a.profile.id, match);
    await page.goto('/profile/');
    await page.getByRole('button', { name: 'Customize profile' }).click();
    const editor = page.getByRole('dialog', { name: 'Customize profile' });
    await editor.getByRole('tab', { name: 'Portrait frames', exact: true }).click();
    const emberFrame = editor.getByRole('button', { name: 'Ember portrait frame', exact: true });
    await expect(emberFrame).toBeEnabled();
    await emberFrame.click();
    await editor.getByRole('tab', { name: 'Banners', exact: true }).click();
    const preview = editor.locator('.profile-editor-preview');
    for (const theme of ['ember', 'astral']) {
      await editor
        .getByRole('group', { name: 'Profile banner' })
        .locator(`label:has(input[value="${theme}"])`)
        .click();
      await expect(preview).toHaveAttribute('data-profile-banner', theme);
      await expect(preview).toHaveCSS('background-image', new RegExp(`${theme}-banner`));
      await waitForArt(preview);
      await preview.screenshot({ path: info.outputPath(`${theme}-customizer.png`) });
    }
    await editor.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.locator('.profile-header')).toHaveAttribute('data-profile-banner', 'astral');
    await b.page.goto(`/profile/?id=${a.profile.id}`);
    const banner = b.page.locator('.profile-header');
    await expect(banner).toHaveAttribute('data-profile-banner', 'astral');
    await expect(banner.locator('.cosmetic-frame-art')).toHaveCSS(
      'background-image',
      /ember-frame/,
    );
    await waitForArt(banner.locator('.cosmetic-frame-art'));
    await expect(banner).toContainText(a.profile.name);
    await banner.screenshot({ path: info.outputPath('astral-banner.png') });
    await expect(b.page.locator('.game-shell')).toHaveAttribute('data-board-theme', 'classic');
    await expect(b.page.locator('.game-shell')).toHaveAttribute('data-card-back', 'classic');
    await b.page.getByRole('button', { name: 'Language: English', exact: true }).click();
    await b.page.getByRole('menuitemradio', { name: 'Français', exact: true }).click();
    await b.page.goto('/');
    await b.page.getByRole('button', { name: 'Personnaliser', exact: true }).click();
    await expect(b.page.getByRole('dialog', { name: 'Apparence', exact: true })).toBeVisible();
    await b.page.keyboard.press('Escape');
    await b.page.getByRole('button', { name: 'Paramètres du jeu', exact: true }).click();
    await b.page.getByRole('button', { name: 'Apparence', exact: true }).click();
    await expect(b.page.getByRole('group', { name: 'Thème du plateau' })).toBeVisible();
    await expect(b.page.getByRole('group', { name: 'Dos de carte' })).toBeVisible();
    await expect(b.page.locator('input[name="board-theme"][value="regalia"]')).toBeDisabled();
    await expect(b.page.locator('input[name="card-back"][value="regalia"]')).toBeDisabled();
    await expect(b.page.getByText('500 parties classées', { exact: true })).toHaveCount(2);
    await b.page.screenshot({ path: info.outputPath('appearance-fr.png') });
  } finally {
    await Promise.all([a.context.close(), b.context.close()]);
  }
});

test('previews and equips season rewards from the Journal in English and French', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(75000);
  const a = await player(browser);
  const b = await player(browser);
  const { page } = a;
  async function captureArt(target: Locator, name: string) {
    return sharp(await target.screenshot({ path: info.outputPath(name) }))
      .removeAlpha()
      .raw()
      .toBuffer();
  }
  function countChangedPixels(first: Buffer, second: Buffer) {
    expect(first.length).toBe(second.length);
    let changed = 0;
    for (let i = 0; i < first.length; i += 3) {
      const difference =
        Math.abs(first[i] - second[i]) +
        Math.abs(first[i + 1] - second[i + 1]) +
        Math.abs(first[i + 2] - second[i + 2]);
      if (difference >= 35) changed++;
    }
    return changed;
  }
  async function expectFramePlayback(art: Locator, name: string, minimum: number) {
    await expect(art).toHaveCSS('background-image', /astral-frame-loop\.webp/);
    await waitForArt(art);
    const before = await captureArt(art, `${name}-first.png`);
    await art.page().waitForTimeout(1100);
    const after = await captureArt(art, `${name}-second.png`);
    expect(countChangedPixels(before, after)).toBeGreaterThan(minimum);
  }
  try {
    await platform.store.setAvatar(a.profile.id, a.profile.deck[0]);
    await page.goto('/journey/#season');
    const frameProgress = page.getByRole('progressbar', { name: 'Astral frame' });
    const bannerProgress = page.getByRole('progressbar', { name: 'Astral Crest' });
    await expect(frameProgress).toHaveAttribute('value', '0');
    await expect(bannerProgress).toHaveAttribute('max', '15');
    await page.getByRole('link', { name: 'Preview Astral Crest' }).click();
    const editor = page.getByRole('dialog', { name: 'Customize profile' });
    const crest = editor.locator('input[value="astral-crest"]');
    await expect(crest).toBeDisabled();
    await expect(editor).toContainText('Complete 15 full rated games in Astral');
    const profilePreview = editor.locator('.profile-editor-preview');
    await expect(profilePreview).toHaveAttribute('data-profile-banner', 'astral-crest');
    const bannerPreviewArt = profilePreview.locator('.astral-crest-art');
    await expect(bannerPreviewArt).toHaveCSS('background-image', /astral-crest-loop\.webp/);
    await waitForArt(bannerPreviewArt);
    const crestBefore = await captureArt(profilePreview, 'astral-crest-preview-first.png');
    await page.waitForTimeout(1100);
    const crestAfter = await captureArt(profilePreview, 'astral-crest-preview-second.png');
    expect(countChangedPixels(crestBefore, crestAfter)).toBeGreaterThan(500);
    await expect(editor.getByRole('button', { name: 'Save profile' })).toBeDisabled();
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.goto('/journey/#season');
    await page.getByRole('link', { name: 'Preview Astral frame', exact: true }).click();
    const lockedFrame = editor.getByRole('button', {
      name: 'Astral Premium portrait frame',
      exact: true,
    });
    const lockedFrameArt = lockedFrame.locator('.astral-frame-art');
    await expect(lockedFrame).toBeDisabled();
    await expect(lockedFrameArt).toHaveCSS('background-image', /astral-frame-loop\.webp/);
    await expect(profilePreview.locator('.frame-astral .astral-frame-art')).toBeVisible();
    await expect(profilePreview).toHaveAttribute('data-profile-banner', 'classic');
    await waitForArt(lockedFrameArt);
    const frameBefore = await captureArt(lockedFrame, 'astral-frame-preview-first.png');
    await page.waitForTimeout(1100);
    const frameAfter = await captureArt(lockedFrame, 'astral-frame-preview-second.png');
    expect(countChangedPixels(frameBefore, frameAfter)).toBeGreaterThan(100);

    await platform.db.tx(async (sql) => {
      await sql(
        `WITH games AS (
          INSERT INTO matches(id,mode,player0,player1,decks,rules,status,completed_at,settlement_done)
          SELECT 'season-cosmetic-' || n,'ranked',$1,$2,'[[],[]]','{}','complete',now(),true
          FROM generate_series(1,15) AS series(n) RETURNING id
        )
        INSERT INTO match_ratings(match_id,profile_id,before_rating,after_rating)
        SELECT id,$1,1000,1000 FROM games`,
        [a.profile.id, b.profile.id],
      );
    });
    await page.goto('/journey/#season');
    await expect(frameProgress).toHaveAttribute('value', '5');
    await expect(bannerProgress).toHaveAttribute('value', '15');
    await page.getByRole('link', { name: 'Equip Astral frame' }).click();
    await expect(
      editor.getByRole('button', { name: 'Astral portrait frame', exact: true }),
    ).toBeEnabled();
    await editor
      .getByRole('button', { name: 'Astral Premium portrait frame', exact: true })
      .click();
    await editor.getByRole('tab', { name: 'Banners' }).click();
    await editor.locator('label:has(input[value="astral-crest"])').click();
    await editor.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.locator('.profile-header')).toHaveAttribute(
      'data-profile-banner',
      'astral-crest',
    );
    await expect(page.locator('.profile-portrait .frame-astral')).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator('.profile-portrait img')
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    const banner = page.locator('.profile-header');
    const frameArt = page.locator('.profile-portrait .astral-frame-art');
    const crestArt = banner.locator('.astral-crest-art');
    await expect(crestArt).toHaveCSS('background-image', /astral-crest-loop\.webp/);
    await expect(frameArt).toHaveCSS('background-image', /astral-frame-loop\.webp/);
    await Promise.all([waitForArt(crestArt), waitForArt(frameArt)]);
    await banner.screenshot({ path: info.outputPath('astral-crest-banner.png') });
    await expectFramePlayback(frameArt, 'astral-own-profile', 100);

    await b.context.addInitScript(() => localStorage.setItem('triad-effects', 'off'));
    await b.page.emulateMedia({ reducedMotion: 'reduce' });
    await b.page.goto(`/profile/?id=${a.profile.id}`);
    const visitorBanner = b.page.locator('.profile-header');
    await expect(b.page.locator('.game-shell')).not.toHaveClass(/effects-animated/);
    await expect(visitorBanner.locator('.astral-crest-art')).toHaveCSS(
      'background-image',
      /astral-crest-loop\.webp/,
    );
    await expectFramePlayback(
      visitorBanner.locator('.astral-frame-art'),
      'astral-visitor-profile',
      100,
    );
    await a.request('/chat', {
      message: 'Astral season',
      channel: 'general',
      requestId: 'astral-season-chat-test',
    });
    await b.page.goto('/');
    const chatFrame = b.page
      .locator('.chat-message')
      .filter({ hasText: 'Astral season' })
      .locator('.astral-frame-art');
    await expect(chatFrame).toBeVisible();
    await expectFramePlayback(chatFrame, 'astral-chat', 10);

    const lobby = await a.request('/lobbies', {
      mode: 'custom',
      rules: RANKED_RULES,
      allowBots: false,
    });
    const { matchId } = await b.request(`/lobbies/${lobby.lobbyId}/join`, {});
    await b.page.goto(`/?match=${matchId}`);
    const battleFrame = b.page.locator('.scoreboard .astral-frame-art');
    await expect(battleFrame).toBeVisible();
    await expectFramePlayback(battleFrame, 'astral-battle', 20);
    await platform.store.resign(a.profile.id, matchId);

    await page.getByRole('button', { name: 'Game settings', exact: true }).click();
    const effects = page.getByLabel('Animate visual effects', { exact: true });
    await effects.uncheck();
    await expect(crestArt).toHaveCSS('background-image', /astral-crest-loop\.webp/);
    await expect(frameArt).toHaveCSS('background-image', /astral-frame-loop\.webp/);
    const seasonalMotion = page.getByLabel('Animate cosmetic rewards', { exact: true });
    await seasonalMotion.uncheck();
    await expect(crestArt).toHaveCSS('background-image', /astral-crest\.webp/);
    await expect(frameArt).toHaveCSS('background-image', /astral-frame\.webp/);
    await page.goto('/profile/');
    await expect(frameArt).toHaveCSS('background-image', /astral-frame\.webp/);
    await page.getByRole('button', { name: 'Game settings', exact: true }).click();
    await seasonalMotion.check();
    await expect(frameArt).toHaveCSS('background-image', /astral-frame-loop\.webp/);
    await effects.check();
    await page.keyboard.press('Escape');

    for (const language of ['en', 'fr']) {
      if (language === 'en') await page.goto('/journey/#season');
      else {
        await page.getByRole('button', { name: 'Language: English', exact: true }).click();
        await page.getByRole('menuitemradio', { name: 'Français', exact: true }).click();
      }
      const rewards = page.getByRole('region', {
        name: language === 'fr' ? 'Récompenses Astral' : 'Astral rewards',
      });
      await expect(rewards).toBeVisible();
      for (const [width, height] of [
        [1280, 720],
        [1366, 768],
        [1920, 1080],
      ]) {
        await page.setViewportSize({ width, height });
        await rewards.scrollIntoViewIfNeeded();
        const clipped = await rewards
          .locator('.season-reward')
          .evaluateAll((cards) => cards.some((card) => card.scrollWidth > card.clientWidth));
        expect(clipped).toBe(false);
        await rewards.screenshot({ path: info.outputPath(`astral-${language}-${width}.png`) });
      }
    }
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test('keeps Elemental themes and bilingual battle controls aligned across desktop sizes', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(60000);
  const a = await player(browser, 'Northern Card Hall Challenger');
  const b = await player(browser, 'Southern Card Hall Challenger');
  const { page } = a;
  try {
    await platform.db.read((sql) =>
      sql("INSERT INTO achievement_unlocks(profile_id,achievement_id) VALUES($1,'rated-50')", [
        a.profile.id,
      ]),
    );
    const lobby = await a.request('/lobbies', {
      mode: 'custom',
      rules: RANKED_RULES,
      allowBots: false,
    });
    const { matchId } = await b.request(`/lobbies/${lobby.lobbyId}/join`, {});
    await platform.db.tx(async (sql) => {
      const [{ state }] = await sql<{ state: GameState }>('SELECT state FROM matches WHERE id=$1', [
        matchId,
      ]);
      const [first, ...otherCards] = state.hands[0];
      const element = first.element ?? 'fire';
      const game = {
        ...state,
        turn: 0,
        firstPlayer: 0,
        hands: [[{ ...first, element }, ...otherCards], state.hands[1]],
        cellElements: [
          element,
          element === 'fire' ? 'water' : 'fire',
          null,
          null,
          null,
          null,
          null,
          null,
          null,
        ],
      };
      await sql('UPDATE matches SET state=$2::jsonb WHERE id=$1', [matchId, JSON.stringify(game)]);
      await sql("UPDATE profiles SET selected_title='professional' WHERE id=$1", [a.profile.id]);
      await sql("UPDATE profiles SET selected_title='chain-reaction' WHERE id=$1", [b.profile.id]);
    });
    await page.goto(`/?match=${matchId}`);
    const board = page.locator('.arena-screen .board');
    const matching = page.getByTestId('cell-0');
    const mismatched = page.getByTestId('cell-1');
    const neutral = page.getByTestId('cell-2');
    const picker = page.locator('.quick-chat-picker');
    for (const [theme, background] of [
      ['astral', 'rgb(28, 27, 54)'],
      ['ember', 'rgb(40, 25, 35)'],
    ]) {
      for (const language of ['en', 'fr']) {
        await page.evaluate(
          ({ theme, language }) => {
            localStorage.setItem('triad-board-theme', theme);
            localStorage.setItem('triad-language', language);
          },
          { theme, language },
        );
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('lang', language);
        await expect(page.locator('.battle-mode strong')).toHaveText(
          language === 'en' ? 'Custom game' : 'Partie personnalisée',
        );
        await expect(page.locator('#battle-chat-message')).toHaveAttribute(
          'placeholder',
          'Message…',
        );
        await expect(matching.locator('.cell-element')).toBeVisible();
        await expect(neutral).toHaveCSS('background-color', background);
        await expect(matching).toHaveCSS('background-color', background);
        await expect(mismatched).toHaveCSS('background-color', background);
        const tileArt = await neutral.evaluate((el) => getComputedStyle(el).backgroundImage);
        await expect(matching).toHaveCSS('background-image', tileArt);
        await expect(mismatched).toHaveCSS('background-image', tileArt);
        const border = await neutral.evaluate((el) => getComputedStyle(el).borderTopColor);
        await expect(matching).toHaveCSS('border-top-color', border);
        await page.getByTestId('player-card').first().click();
        await expect(matching).toHaveAttribute('data-modifier', '1');
        await expect(mismatched).toHaveAttribute('data-modifier', '-1');
        await expect(matching).toHaveCSS('border-top-color', 'rgb(134, 227, 163)');
        await expect(mismatched).toHaveCSS('border-top-color', 'rgb(249, 151, 153)');
        await expect(matching).toHaveCSS('background-color', background);
        await expect(mismatched).toHaveCSS('background-color', background);
        await page
          .getByRole('button', {
            name: language === 'en' ? 'Quick chat' : 'Chat rapide',
            exact: true,
          })
          .click();
        await expect(picker.getByRole('button')).toHaveCount(4);
        for (const [width, height] of [
          [1280, 720],
          [1366, 768],
          [1920, 1080],
        ]) {
          await page.setViewportSize({ width, height });
          await expect(board).toBeInViewport({ ratio: 1 });
          await expect(picker).toBeInViewport({ ratio: 1 });
          await page.evaluate(() => document.fonts.ready);
          const layout = await page.evaluate(() => {
            const selectors = [
              '.match-toolbar',
              '.player-heading',
              '.turn-banner',
              '.battle-layout',
              '.hand-label',
              '.card-inspector',
              '.arena-comms',
              '.arena-chat-tabs button',
              '.battle-chat-heading',
              '.quick-chat-picker button',
              '.chat-compose',
            ];
            const clipped = selectors.flatMap((selector) =>
              Array.from(document.querySelectorAll(selector))
                .filter((element) => element.scrollWidth > element.clientWidth + 1)
                .map((element) => `${selector}: ${element.textContent?.trim()}`),
            );
            const [hand, board, rival] = ['.player-hand', '.board', '.cpu-hand'].map((selector) =>
              document.querySelector(selector)!.getBoundingClientRect(),
            );
            return {
              clipped,
              overlaps: hand.right > board.left + 1 || board.right > rival.left + 1,
              pageOverflow: document.documentElement.scrollWidth > innerWidth,
            };
          });
          expect
            .soft(layout, `${theme}, ${language}, ${width}×${height}`)
            .toEqual({ clipped: [], overlaps: false, pageOverflow: false });
          if (width === 1280)
            await page.screenshot({ path: info.outputPath(`elemental-${theme}-${language}.png`) });
        }
      }
    }
    await matching.click();
    await expect(matching.locator('.element-modifier')).toHaveText('+1');
    await expect(matching.locator('.cell-element')).toBeVisible();
  } finally {
    await Promise.all([a.context.close(), b.context.close()]);
  }
});

test('finds a matched duel from the shared queue when its socket is unavailable', async ({
  browser,
}) => {
  const a = await player(browser);
  const b = await player(browser);
  try {
    await a.context.route('**/socket.io/**', (route) => route.abort());
    await a.context.routeWebSocket('**/socket.io/**', (socket) => socket.close());
    await a.request('/lobbies', { mode: 'casual', allowBots: false });
    await a.page.goto('/cards/');
    const dock = a.page.locator('.matchmaking-dock');
    await expect(dock).toContainText('Unranked');
    await a.page.route('**/api/profile', (route) =>
      route.fulfill({ status: 401, contentType: 'text/html', body: '<h1>Proxy restarting</h1>' }),
    );
    await a.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(dock).toContainText('Reconnecting…');
    await a.page.unroute('**/api/profile');
    await dock.getByRole('button', { name: 'Retry connection' }).click();
    await expect(dock).toContainText('Checking the queue…');
    await expect(a.page.getByRole('button', { name: 'Logout' })).toBeVisible();
    await a.page.getByRole('button', { name: 'Language: English' }).click();
    await a.page.getByRole('menuitemradio', { name: 'Français' }).click();
    await expect(dock).toContainText('Annuler');
    await expect(dock).toContainText('Vérification de la file…');
    await a.page.getByRole('button', { name: 'Langue : Français' }).click();
    await a.page.getByRole('menuitemradio', { name: 'English' }).click();
    const match = await b.request('/lobbies', { mode: 'casual', allowBots: false });
    expect(match.matchId).toBeTruthy();
    await expect(dock).toHaveCount(0, { timeout: 9000 });
    const reminder = a.page.getByRole('dialog', { name: 'You have an active battle' });
    await expect(reminder).toBeVisible();
    await reminder.getByRole('button', { name: 'Go back to the battle' }).click();
    await expect(a.page.getByTestId('cell-0')).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
