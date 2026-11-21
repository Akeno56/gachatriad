import { expect, test, type Browser } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPlatform } from '../../apps/server/src/app';
import { RANKED_RULES, STANDARD, type GameState } from '../../packages/engine/src/index';
import { navigateTo, openNavigation } from './helpers';

let platform: Awaited<ReturnType<typeof createPlatform>>;
let origin: string;
let serial = 0;
test.beforeAll(async () => {
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = await mkdtemp(resolve('.cache/pw-multiplayer-'));
  try {
    platform = await createPlatform(resolve('.'), { memory: true, timers: false });
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
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
    async request(path: string, payload: Record<string, unknown>) {
      const result = await platform.app.inject({
        method: 'POST',
        url: `/api${path}`,
        payload,
        remoteAddress,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(result.statusCode, result.body).toBe(200);
      return result.json();
    },
  };
}

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

test('fits French correspondence invitations and opens them through the new social page', async ({
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
    await expect(a.page.getByText('Correspondence · 72h per turn')).toBeVisible();
    await b.page.goto('/cards/');
    await b.page.getByRole('button', { name: 'Language: English', exact: true }).click();
    await b.page.getByRole('menuitemradio', { name: 'Français', exact: true }).click();
    const shortcut = b.page.locator('.social-navigation');
    await expect(shortcut.locator('.social-indicator')).toBeVisible();
    await shortcut.click();
    const invitation = b.page.locator('.social-card[data-incoming=true]').first();
    await expect(invitation).toContainText(a.profile.name);
    await expect(invitation).toContainText('Correspondance · 72 h par tour');
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
    await b.page.getByRole('link', { name: 'Ouvrir la correspondance' }).click();
    await expect(b.page.getByRole('link', { name: 'Reprendre la partie' })).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
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

test('previews and retains battle cosmetics and shows a saved banner on another player’s profile', async ({
  browser,
}, info) => {
  const a = await player(browser);
  const b = await player(browser);
  const { page } = a;
  try {
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
    await page.keyboard.press('Escape');
    await expect(customize).toBeFocused();
    const match = await platform.store.solo(a.profile.id, 'easy', STANDARD);
    await page.goto(`/?match=${match}`);
    const board = page.locator('.arena-screen .board');
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
    await appearance
      .getByRole('group', { name: 'Board theme' })
      .locator('label')
      .filter({ hasText: 'Astral' })
      .click();
    await appearance
      .getByRole('group', { name: 'Card back' })
      .locator('label')
      .filter({ hasText: 'Ember' })
      .click();
    await expect(appearance).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: info.outputPath('appearance.png') });
    await page.keyboard.press('Escape');
    await expect(appearance).toHaveCount(0);
    await expect(settings).toBeFocused();
    await page.reload();
    await expect(board).toHaveCSS('background-color', 'rgb(23, 20, 41)');
    await expect(hiddenCard).not.toHaveCSS('background-image', originalBack);
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
    await editor.getByRole('tab', { name: 'Banners', exact: true }).click();
    await editor
      .getByRole('group', { name: 'Profile banner' })
      .locator('label:has(input[value="astral"])')
      .click();
    await expect(editor.locator('.profile-editor-preview')).toHaveAttribute(
      'data-profile-banner',
      'astral',
    );
    await editor.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.locator('.profile-header')).toHaveAttribute('data-profile-banner', 'astral');
    await b.page.goto(`/profile/?id=${a.profile.id}`);
    const banner = b.page.locator('.profile-header');
    await expect(banner).toHaveAttribute('data-profile-banner', 'astral');
    await expect(banner).toContainText(a.profile.name);
    await expect(b.page.locator('.game-shell')).toHaveAttribute('data-board-theme', 'classic');
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
  try {
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
    await editor.getByRole('button', { name: 'Astral portrait frame', exact: true }).click();
    await editor.getByRole('tab', { name: 'Banners' }).click();
    await editor.locator('label:has(input[value="astral-crest"])').click();
    await editor.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.locator('.profile-header')).toHaveAttribute(
      'data-profile-banner',
      'astral-crest',
    );
    await expect(page.locator('.profile-portrait .frame-astral')).toBeVisible();

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
      ['astral', 'rgb(38, 34, 61)'],
      ['ember', 'rgb(58, 44, 40)'],
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
    await a.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(dock).toContainText('Searching for an opponent…');
    await expect(a.page.getByRole('button', { name: 'Logout' })).toBeVisible();
    await a.page.getByRole('button', { name: 'Language: English' }).click();
    await a.page.getByRole('menuitemradio', { name: 'Français' }).click();
    await expect(dock).toContainText('Annuler');
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
