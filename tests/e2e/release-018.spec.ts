import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPlatform } from '../../apps/server/src/app';
import {
  applyMove,
  createGame,
  legalMoves,
  STANDARD,
  scores,
  type GameState,
} from '../../packages/engine/src/index';
import { randomUUID } from 'node:crypto';
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
          name: `Journey tester ${n}`,
          email: `release018-${n}@test.invalid`,
          password: 'isolated-release018-password',
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
async function centeredSeason(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const offset = await page.locator('.season-seal').evaluate((el) => {
    const diamond = el.querySelector('polygon')!.getBBox();
    const number = el.querySelector('text')!.getBBox();
    return {
      x: number.x + number.width / 2 - diamond.x - diamond.width / 2,
      y: number.y + number.height / 2 - diamond.y - diamond.height / 2,
    };
  });
  expect(Math.abs(offset.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(offset.y)).toBeLessThanOrEqual(2);
}

const base = process.env.PREVIEW_BASE_PATH ?? '';
async function completed(c: Awaited<ReturnType<typeof player>>) {
  const cards = c.cards.slice(0, 5);
  let state = createGame(
    [cards, cards],
    { ...STANDARD, allOpen: false, same: true, plus: true, combo: true },
    () => 0,
  );
  const states = [state];
  while (state.status !== 'complete') {
    state = applyMove(state, legalMoves(state)[0]);
    states.push(state);
  }
  const id = randomUUID();
  await platform.db.read((sql) =>
    sql(
      "INSERT INTO matches(id,mode,player0,state,decks,rules,status,winner,is_draw,completed_at,settlement_done) VALUES($1,'solo',$2,$3::jsonb,$4::jsonb,$5::jsonb,'complete',0,false,now(),true)",
      [
        id,
        c.profile.id,
        JSON.stringify(state),
        JSON.stringify([c.profile.deck, c.profile.deck]),
        JSON.stringify(state.rules),
      ],
    ),
  );
  return { id, states };
}
async function frame(page: Page, state: GameState) {
  await expect(page.locator('.replay-cell .playing-card')).toHaveCount(state.history.length);
  const cells = await page.locator('.replay-cell').evaluateAll((els) =>
    els.map((el) => ({
      filled: !!el.querySelector('.playing-card'),
      blue: !!el.querySelector('.owned-player'),
      red: !!el.querySelector('.owned-cpu'),
    })),
  );
  expect(cells).toEqual(
    state.board.map((s) => ({ filled: !!s, blue: s?.owner === 0, red: s?.owner === 1 })),
  );
  await expect(page.locator('.replay-score')).toHaveText(scores(state).join('–'));
}
test('plays stored frames, inspects cards, persists private favourites and handles missing replays in EN/FR', async ({
  browser,
}, info) => {
  const c = await player(browser),
    errors: string[] = [];
  c.page.on('pageerror', (e) => errors.push(e.message));
  try {
    const saved = await completed(c);
    await c.page.goto(`${base}/profile/`);
    await c.page.getByRole('link', { name: 'Replays', exact: true }).click();
    await expect(c.page).toHaveURL(new RegExp(`${base}/replays/?$`));
    await expect(c.page.locator('.replay-entry')).toHaveCount(1);
    await c.page.getByRole('link', { name: 'Watch replay', exact: true }).click();
    await expect(c.page.getByRole('region', { name: 'Match replay', exact: true })).toBeVisible();
    await frame(c.page, saved.states[0]);
    await c.page.getByRole('button', { name: 'Next turn', exact: true }).click();
    await frame(c.page, saved.states[1]);
    await c.page.getByRole('button', { name: 'Last turn', exact: true }).click();
    await frame(c.page, saved.states[9]);
    await c.page.getByRole('button', { name: 'Previous turn', exact: true }).click();
    await frame(c.page, saved.states[8]);
    await c.page.getByRole('slider', { name: 'Replay turn', exact: true }).fill('4');
    await frame(c.page, saved.states[4]);
    await c.page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(c.page.getByRole('slider', { name: 'Replay turn' })).not.toHaveValue('4');
    await c.page.getByRole('button', { name: 'Pause', exact: true }).click();
    const paused = await c.page.getByRole('slider', { name: 'Replay turn' }).inputValue();
    await c.page.waitForTimeout(1400);
    await expect(c.page.getByRole('slider', { name: 'Replay turn' })).toHaveValue(paused);
    await c.page
      .locator('.replay-cell')
      .filter({ has: c.page.locator('.playing-card') })
      .first()
      .click();
    await expect(c.page.locator('dialog.card-detail')).toBeVisible();
    await c.page.getByRole('button', { name: 'Close card detail', exact: true }).click();
    await c.page.getByRole('button', { name: '☆ Add favourite', exact: true }).click();
    await expect(c.page.getByRole('button', { name: '★ Favourite', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await c.page.getByRole('link', { name: 'All replays', exact: true }).click();
    await c.page.getByRole('checkbox', { name: 'Favourites only', exact: true }).check();
    await expect(c.page.locator('.replay-entry')).toHaveCount(1);
    await c.page.reload();
    await expect(
      c.page.getByRole('button', { name: 'Remove favourite', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await c.page.getByRole('link', { name: 'Watch replay', exact: true }).click();
    await c.page.getByRole('combobox', { name: 'Speed', exact: true }).selectOption('2');
    await c.page.getByRole('button', { name: 'Last turn', exact: true }).click();
    await c.page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(c.page.getByRole('slider', { name: 'Replay turn' })).toHaveValue('9');
    await expect(c.page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await french(c.page);
    await expect(c.page.getByRole('button', { name: 'Tour suivant', exact: true })).toBeVisible();
    await expect(c.page.getByRole('slider', { name: 'Tour du replay', exact: true })).toBeVisible();
    await c.page.getByRole('button', { name: 'Premier tour', exact: true }).click();
    await c.page.getByRole('button', { name: 'Dernier tour', exact: true }).click();
    await frame(c.page, saved.states[9]);
    if (info.project.name === 'mobile') await c.page.setViewportSize({ width: 320, height: 740 });
    else await c.page.setViewportSize({ width: 1280, height: 720 });
    await fits(c.page);
    await c.page.evaluate(() => document.fonts.ready);
    if (info.project.name === 'desktop') {
      await expect(c.page.locator('.replay-board')).toBeInViewport({ ratio: 1 });
      const board = (await c.page.locator('.replay-board').boundingBox())!;
      expect(board.x).toBeGreaterThan(64);
    }
    await c.page.screenshot({
      path: `.cache/release018-replay-${info.project.name}.png`,
      fullPage: true,
    });
    await c.page.goto(`${base}/replays/?match=does-not-exist`);
    await expect(c.page.locator('.replay-error')).toContainText('Replay introuvable.');
    await c.page.getByRole('link', { name: 'Retour au jeu', exact: true }).click();
    await expect(c.page).toHaveURL(new RegExp(`${base}/$`));
    expect(errors).toEqual([]);
  } finally {
    await c.context.close();
  }
});
test('tries another move from a replay while keeping the archived frame intact', async ({
  browser,
}, info) => {
  const c = await player(browser);
  try {
    const saved = await completed(c);
    await c.page.goto(`${base}/replays/?match=${saved.id}`);
    const ownMove = c.page.getByRole('button', { name: 'Try another move', exact: true });
    const step = saved.states.findIndex((state, i) => i > 1 && state.turn === 0);
    for (let n = 0; n < step; n++) {
      if (saved.states[n].turn === 1) await expect(ownMove).toBeDisabled();
      await c.page.getByRole('button', { name: 'Next turn', exact: true }).click();
    }
    await expect(ownMove).toBeEnabled();
    await ownMove.click();
    const state = saved.states[step];
    const cells = c.page.locator('.puzzle-cell .playing-card');
    await expect(cells).toHaveCount(step);
    await expect(c.page.locator('.puzzle-reserves .card-back')).toHaveCount(state.hands[1].length);
    const recorded = saved.states[step + 1].history.at(-1)!.move;
    const different = legalMoves(state).find(
      (move) => move.cardId !== recorded.cardId || move.cell !== recorded.cell,
    )!;
    const name = state.hands[0].find((card) => card.id === different.cardId)!.name;
    await c.page.getByRole('button', { name: `Select ${name}`, exact: true }).click();
    await c.page.getByTestId(`puzzle-cell-${different.cell}`).click();
    await expect(cells).toHaveCount(step + 2);
    await expect(c.page.getByTestId(`puzzle-cell-${different.cell}`)).toContainText(name);
    await c.page.getByRole('button', { name: 'Reset position', exact: true }).click();
    await expect(cells).toHaveCount(step);
    if (info.project.name === 'desktop') {
      for (const [width, height] of [
        [1280, 720],
        [1366, 768],
        [1920, 1080],
      ]) {
        await c.page.setViewportSize({ width, height });
        await c.page.evaluate(() => scrollTo(0, 0));
        await fits(c.page);
        await expect(c.page.locator('.puzzle-board')).toBeInViewport({ ratio: 1 });
        await expect(c.page.locator('.puzzle-reserves')).toBeInViewport({ ratio: 1 });
        await c.page.screenshot({ path: info.outputPath(`replay-practice-${width}.png`) });
      }
    }
    await c.page.getByRole('button', { name: 'Back to replay', exact: true }).click();
    await expect(c.page.getByRole('slider', { name: 'Replay turn' })).toHaveValue(String(step));
    await frame(c.page, state);
    await c.page.getByRole('button', { name: 'Next turn', exact: true }).click();
    await frame(c.page, saved.states[step + 1]);
    await french(c.page);
    await expect(c.page.getByRole('button', { name: 'Essayer un autre coup' })).toBeDisabled();
    await fits(c.page);
  } finally {
    await c.context.close();
  }
});
test('sets up a styled practice match, opens its replay from results and keeps the home chat usable', async ({
  browser,
}, info) => {
  const c = await player(browser),
    errors: string[] = [];
  c.page.on('pageerror', (e) => errors.push(e.message));
  try {
    await c.page.goto(`${base}/`);
    if (info.project.name === 'desktop') {
      await c.page.setViewportSize({ width: 1280, height: 720 });
      await expect(c.page.locator('.main-chat .chat-compose')).toBeInViewport({ ratio: 1 });
    }
    const noticeboard = c.page.getByRole('region', { name: 'Noticeboard' });
    await expect(noticeboard.locator('.tavern-notice strong')).toHaveText([
      'Daily Puzzle',
      'Daily Booster',
      'Practice',
    ]);
    if (info.project.name === 'desktop') {
      for (const [width, height] of [
        [1280, 720],
        [1366, 768],
        [1920, 1080],
      ]) {
        await c.page.setViewportSize({ width, height });
        await expect(noticeboard).toBeInViewport({ ratio: 1 });
      }
      await c.page.setViewportSize({ width: 1280, height: 720 });
    }
    await expect(noticeboard.getByRole('link', { name: /Daily Booster/ })).toHaveAttribute(
      'href',
      /\/boosters\/?#daily-booster$/,
    );
    await expect(c.page.getByRole('link', { name: 'Correspondence', exact: true })).toHaveAttribute(
      'href',
      /\/correspondence\/?$/,
    );
    await noticeboard.getByRole('button', { name: 'Practice', exact: true }).click();
    const setup = c.page.getByRole('dialog', { name: 'Practice', exact: true });
    await expect(setup).toBeVisible();
    await expect(setup.getByRole('button', { name: 'Start practice', exact: true })).toBeInViewport(
      {
        ratio: 1,
      },
    );
    const rules = setup.getByRole('combobox', { name: 'Rules', exact: true });
    await expect(rules).toHaveValue('standard');
    await expect(setup.getByRole('combobox', { name: 'Visibility' })).toHaveValue('threeOpen');
    await expect(setup.getByRole('checkbox', { name: 'Same' })).toBeChecked();
    await expect(setup.getByRole('checkbox', { name: 'Plus' })).toBeChecked();
    await expect(setup.getByRole('checkbox', { name: 'Combo' })).toBeChecked();
    await expect(setup.getByRole('checkbox', { name: 'Elemental' })).not.toBeChecked();
    await rules.selectOption('ranked-random');
    await expect(setup.getByRole('checkbox', { name: 'Random deck' })).toBeChecked();
    await expect(setup.getByRole('checkbox', { name: 'Elemental' })).toBeChecked();
    await setup.getByRole('checkbox', { name: 'Same' }).uncheck();
    await setup.getByRole('checkbox', { name: 'Plus' }).uncheck();
    await expect(rules).toHaveValue('custom');
    await expect(setup.getByRole('checkbox', { name: 'Combo' })).not.toBeChecked();
    await expect(setup.getByRole('checkbox', { name: 'Combo' })).toBeDisabled();
    await setup.getByRole('combobox', { name: 'Bot style', exact: true }).selectOption('combo');
    await rules.selectOption('combo');
    await setup.getByRole('combobox', { name: 'Difficulty', exact: true }).selectOption('normal');
    await expect(setup).toContainText('Prioritises Same, Plus and Combo.');
    await fits(c.page);
    await setup.getByRole('button', { name: 'Start practice', exact: true }).click();
    await expect(setup).not.toBeVisible();
    const current = await platform.store.profile(c.actor),
      id = current.activeMatchId!;
    expect(await platform.store.view(c.profile.id, id)).toMatchObject({
      cpuStyle: 'combo',
      rules: {
        allOpen: true,
        same: true,
        plus: true,
        combo: true,
        elemental: false,
        random: false,
      },
    });
    for (let n = 0; n < 12; n++) {
      const [m] = await platform.db.read((sql) =>
        sql<{ state: GameState; version: number }>(
          'SELECT state,version FROM matches WHERE id=$1',
          [id],
        ),
      );
      if (m.state.status === 'complete') break;
      if (m.state.turn === 0) {
        const move = legalMoves(m.state)[0];
        await platform.store.move(c.profile.id, id, move.cardId, move.cell, m.version);
      } else {
        await platform.db.read((sql) =>
          sql('UPDATE matches SET deadline=$1 WHERE id=$2', [Date.now() - 10, id]),
        );
        await platform.store.tick();
      }
    }
    await c.page.goto(`${base}/?match=${id}`);
    const result = c.page.locator('dialog.result-overlay');
    await expect(result).toBeVisible();
    await result.getByRole('link', { name: 'Watch replay', exact: true }).click();
    await expect(c.page.locator('.replay-player')).toBeVisible();
    await expect(c.page.locator('.replay-hand .bot-style')).toHaveText('Combos');
    await c.page.getByRole('button', { name: 'Last turn', exact: true }).click();
    await expect(c.page.getByRole('slider', { name: 'Replay turn' })).toHaveValue('9');
    await french(c.page);
    await c.page.getByRole('link', { name: 'Retour au jeu', exact: true }).click();
    await c.page.getByRole('button', { name: 'Entraînement', exact: true }).click();
    await expect(c.page.getByRole('combobox', { name: 'Style du bot', exact: true })).toBeVisible();
    await expect(c.page.getByRole('combobox', { name: 'Visibilité', exact: true })).toHaveValue(
      'threeOpen',
    );
    await expect(c.page.getByRole('checkbox', { name: 'Deck Random', exact: true })).toBeVisible();
    await fits(c.page);
    await c.page.screenshot({
      path: `.cache/release018-practice-${info.project.name}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await c.context.close();
  }
});
