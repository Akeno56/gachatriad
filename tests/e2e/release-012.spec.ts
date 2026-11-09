import { test, expect, type Browser } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPlatform } from '../../apps/server/src/app';
import { CARDS } from '../../packages/shared/src/index';
let platform: Awaited<ReturnType<typeof createPlatform>>,
  origin: string,
  serial = 0;
test.beforeAll(async () => {
  const old = process.env.DATA_DIR;
  process.env.DATA_DIR = await mkdtemp(resolve('.cache/pw-012-'));
  try {
    platform = await createPlatform(resolve('.'), { memory: true, timers: false });
  } finally {
    if (old === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = old;
  }
  await platform.bots.set(false);
  await platform.security.action('127.0.0.1', 'allow-shared', 'Isolated test');
  await platform.app.listen({ port: 0, host: '127.0.0.1' });
  origin = `http://127.0.0.1:${(platform.app.server.address() as { port: number }).port}`;
  platform.store.isOnline = () => true;
});
test.afterAll(async () => {
  await platform?.app.close();
});
async function player(browser: Browser) {
  const n = ++serial;
  const r = await platform.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    remoteAddress: `198.19.12.${n}`,
    payload: {
      name: `Long player twelve ${n}`,
      email: `ui12-${n}@test.invalid`,
      password: 'test-password-twelve',
    },
  });
  expect(r.statusCode, r.body).toBe(200);
  const actor = { ...r.json().user, isAnonymous: false },
    token = String(r.headers['set-auth-token']);
  let profile = await platform.store.profile(actor);
  for (const pack of await platform.store.economy.list(profile.id))
    await platform.store.economy.open(profile.id, pack.id);
  await platform.store.completeTutorial(profile.id);
  await platform.store.acknowledgeRanked(profile.id);
  profile = await platform.store.profile(actor);
  const mobile = test.info().project.name === 'mobile',
    context = await browser.newContext({
      baseURL: 'http://127.0.0.1:3000',
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
  await context.addInitScript(
    ({ origin, token }) => {
      localStorage.setItem('triad-server', origin);
      localStorage.setItem(`triad-session:${origin}`, token);
    },
    { origin, token },
  );
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    return ['http:', 'https:'].includes(u.protocol) &&
      !['127.0.0.1', 'localhost'].includes(u.hostname)
      ? route.abort()
      : route.continue();
  });
  return { actor, profile, token, context, page: await context.newPage() };
}
test('bulk Trade Up gives four rewards in one confirmation and leaves the last copy', async ({
  browser,
}, info) => {
  const c = await player(browser),
    card = CARDS.find((c) => c.rarity === 1)!;
  try {
    await platform.db.read((sql) =>
      sql('DELETE FROM inventory WHERE profile_id=$1', [c.profile.id]),
    );
    await platform.db.read((sql) =>
      sql('INSERT INTO inventory(profile_id,card_id,quantity) VALUES($1,$2,21)', [
        c.profile.id,
        card.id,
      ]),
    );
    await c.page.goto('/collection');
    await c.page.getByText('Duplicate cards · Recycle & Trade Up', { exact: true }).click();
    await c.page.getByRole('button', { name: 'Trade Up ×4', exact: true }).click();
    await expect(c.page.locator('.duplicate-dialog')).toContainText('20 spare copies');
    await c.page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(c.page.getByRole('heading', { name: 'Trade Up complete' })).toBeVisible();
    await expect(c.page.locator('.duplicate-rewards .playing-card')).toHaveCount(4);
    expect((await platform.store.profile(c.actor)).inventory[card.id].quantity).toBe(1);
    await c.page.screenshot({ path: info.outputPath('batch-trade-up.png'), fullPage: true });
  } finally {
    await c.context.close();
  }
});
test('sends feedback, keeps markup as text and gives admins a private inbox', async ({
  browser,
}, info) => {
  const c = await player(browser);
  try {
    await c.page.goto('/');
    await c.page.getByRole('button', { name: 'Feedback and bug reports' }).click();
    await c.page.getByLabel('Title', { exact: true }).fill('<img src=x onerror=alert(1)>');
    await c.page
      .getByLabel('Details', { exact: true })
      .fill('Test report with literal markup and no script execution.');
    await c.page.getByRole('button', { name: 'Send report', exact: true }).click();
    await expect(c.page.getByRole('status').filter({ hasText: 'Report received' })).toBeVisible();
    await c.page.getByRole('button', { name: 'Close feedback' }).click();
    await platform.db.read((sql) =>
      sql('INSERT INTO server_admins(auth_user_id) VALUES($1)', [c.actor.id]),
    );
    await c.page.reload();
    await c.page.getByRole('button', { name: 'Feedback and bug reports' }).click();
    await c.page.getByRole('button', { name: 'Reports inbox', exact: true }).click();
    await expect(c.page.locator('.feedback-report h3')).toHaveText('<img src=x onerror=alert(1)>');
    await expect(c.page.locator('.feedback-report img')).toHaveCount(0);
    await c.page.getByRole('button', { name: 'Close feedback' }).click();
    await c.page.getByRole('button', { name: 'Language: English', exact: true }).click();
    await c.page.getByRole('menuitemradio', { name: 'Français', exact: true }).click();
    await c.page.locator('.feedback-trigger').click();
    await c.page.locator('.feedback-report select').selectOption('resolved');
    await c.page.getByRole('button', { name: 'Enregistrer le signalement', exact: true }).click();
    await expect(c.page.locator('.feedback-report')).toHaveCount(0);
    await c.page.locator('.feedback-filters select').selectOption('all');
    await expect(c.page.locator('.feedback-report')).toHaveCount(1);
    await c.page.screenshot({ path: info.outputPath('feedback-inbox.png'), fullPage: true });
  } finally {
    await c.context.close();
  }
});

test('offers explicit no-Elo bot practice while a rated queue searches for humans', async ({
  browser,
}) => {
  const c = await player(browser);
  try {
    await platform.bots.set(true, 'medium');
    await c.page.goto('/');
    await c.page.getByRole('button', { name: 'Start match (Ranked)', exact: true }).click();
    await c.page.getByRole('button', { name: 'Join Ranked queue', exact: true }).click();
    await expect(
      c.page.getByRole('button', { name: 'Play a practice bot — no Elo', exact: true }),
    ).toBeVisible();
    expect((await platform.store.profile(c.actor)).waitingLobby?.allowBots).toBe(false);
    await c.page.getByRole('button', { name: 'Play a practice bot — no Elo', exact: true }).click();
    await expect(
      c.page.getByRole('dialog').filter({ hasText: 'Practice with a bot?' }),
    ).toContainText('losing can cost one card');
    await c.page.getByRole('button', { name: 'Find practice bot', exact: true }).click();
    await expect(
      c.page.getByRole('button', { name: 'Finding a practice bot…', exact: true }),
    ).toBeDisabled();
    const profile = await platform.store.profile(c.actor);
    expect(profile.waitingLobby?.allowBots).toBe(true);
    await platform.store.cancelLobby(c.profile.id, profile.waitingLobby!.id);
  } finally {
    await platform.bots.set(false);
    await c.context.close();
  }
});
test('shares one cached audio download across decks, loops and repeated battle/menu changes', async ({
  browser,
}) => {
  test.setTimeout(90000);
  const c = await player(browser),
    downloads: string[] = [];
  c.page.on('request', (r) => {
    if (r.url().endsWith('.mp3')) downloads.push(r.url());
  });
  try {
    await c.page.goto('/');
    await c.page.getByRole('button', { name: 'Feedback and bug reports' }).click();
    await c.page.getByRole('button', { name: 'Close feedback' }).click();
    const decks = c.page.locator('audio[data-bgm-track]');
    await expect(decks).toHaveCount(2);
    await expect
      .poll(() =>
        decks.evaluateAll((items) =>
          items.some((el) => {
            const a = el as HTMLAudioElement;
            return a.src.startsWith('blob:') && !a.paused && a.currentTime > 0;
          }),
        ),
      )
      .toBe(true);
    await decks.first().evaluate((a: HTMLAudioElement) => {
      a.currentTime = a.duration - 2;
    });
    await expect
      .poll(() => decks.nth(1).evaluate((a: HTMLAudioElement) => a.currentTime))
      .toBeGreaterThan(0.1);
    const matchId = await platform.store.solo(c.profile.id, 'easy', {
      allOpen: true,
      same: false,
      plus: false,
      combo: false,
      random: false,
      elemental: false,
    });
    await c.page.evaluate((id) => history.pushState(null, '', `/?match=${id}`), matchId);
    await expect.poll(() => decks.first().getAttribute('data-bgm-scene')).toBe('battle');
    try {
      await expect
        .poll(() =>
          decks.evaluateAll((items) =>
            items.some((el) => {
              const a = el as HTMLAudioElement;
              return a.src.startsWith('blob:') && !a.paused && a.currentTime > 0;
            }),
          ),
        )
        .toBe(true);
    } catch (e) {
      console.log(
        await decks.evaluateAll((items) =>
          items.map((el) => {
            const a = el as HTMLAudioElement;
            return {
              scene: a.dataset.bgmScene,
              paused: a.paused,
              ready: a.readyState,
              time: a.currentTime,
              duration: a.duration,
              error: a.error?.message,
            };
          }),
        ),
      );
      throw e;
    }
    await c.page.getByRole('button', { name: 'Leave match', exact: true }).click();
    await c.page.getByRole('button', { name: 'Forfeit match', exact: true }).click();
    await expect.poll(() => decks.first().getAttribute('data-bgm-scene')).toBe('menu');
    expect(downloads.filter((u) => u.endsWith('queen-of-cards.mp3')).length).toBe(1);
    expect(downloads.filter((u) => u.endsWith('shuffle-or-boogie-ambient.mp3')).length).toBe(1);
  } finally {
    await c.context.close();
  }
});
test('fits chat names and draft-stage chat, and supplies names for every form field', async ({
  browser,
}, info) => {
  const a = await player(browser),
    b = await player(browser);
  try {
    await platform.db.read((sql) =>
      sql("UPDATE profiles SET selected_title='chain-reaction' WHERE id=$1", [a.profile.id]),
    );
    await platform.store.createLobby(a.profile, { mode: 'draft' });
    const joined = await platform.store.createLobby(b.profile, { mode: 'draft' });
    await a.page.goto(`/?match=${joined.matchId}`);
    const chat = a.page.locator('.arena-comms');
    await expect(chat).toBeVisible();
    if (info.project.name === 'desktop') {
      const box = await chat.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(561);
    } else await chat.locator('.comms-mobile-toggle').click();
    await chat.getByRole('tab', { name: 'Battle', exact: true }).click();
    await chat.getByPlaceholder('Message your opponent…').fill('A chat message during Draft');
    await chat.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(chat.locator('.message-heading').first()).toContainText(a.profile.name);
    await expect(chat.locator('.message-title').first()).toHaveText('Chain Reaction');
    expect(
      await chat
        .locator('.message-heading')
        .first()
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    expect(
      await a.page
        .locator(
          'input:not([name]):not([id]),select:not([name]):not([id]),textarea:not([name]):not([id])',
        )
        .count(),
    ).toBe(0);
    await a.page.screenshot({ path: info.outputPath('draft-chat.png'), fullPage: true });
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test('keeps the friend preview beside its avatar and reviews the English/French rulebook', async ({
  browser,
}, info) => {
  const a = await player(browser),
    b = await player(browser);
  try {
    await platform.social.friend(a.profile, b.profile.id, 'request');
    await platform.social.friend(b.profile, a.profile.id, 'accept');
    await platform.social.postFriend(
      b.profile,
      a.profile.id,
      'Preview message beside an avatar',
      'preview-twelve-001',
    );
    await a.page.goto('/');
    await a.page.getByRole('button', { name: /Friends and private chat/ }).click();
    const choice = a.page.locator('.conversation-choice').first();
    await expect(choice).toContainText(b.profile.name);
    const distance = await choice.evaluate((el) => {
      const avatar = el.querySelector('.contact-avatar')!.getBoundingClientRect(),
        name = el.querySelector('strong')!.getBoundingClientRect();
      return name.left - avatar.right;
    });
    expect(distance).toBeGreaterThanOrEqual(0);
    expect(distance).toBeLessThanOrEqual(11);
    await a.page.screenshot({ path: info.outputPath('friend-preview.png'), fullPage: true });
    await a.page.getByRole('button', { name: 'Close', exact: true }).click();
    await a.page.goto('/rules');
    await expect(a.page.getByRole('heading', { name: 'Taking turns', exact: true })).toBeVisible();
    await expect(
      a.page.getByText('Change the rules. Change your strategy.', { exact: true }),
    ).toHaveCount(0);
    await a.page.getByRole('button', { name: 'Language: English', exact: true }).click();
    await a.page.getByRole('menuitemradio', { name: 'Français', exact: true }).click();
    await expect(
      a.page.getByRole('heading', { name: 'Decks et chronomètres', exact: true }),
    ).toBeVisible();
    await a.page.screenshot({ path: info.outputPath('rulebook-french.png'), fullPage: true });
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
