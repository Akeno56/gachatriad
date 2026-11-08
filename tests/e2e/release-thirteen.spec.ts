import { test, expect, type Page } from '@playwright/test';
import { openStarterPacks } from './helpers';
import dictionary from '../../apps/web/lib/translations-fr.json' with { type: 'json' };
async function french(page: Page) {
  await page.getByRole('button', { name: 'Language: English', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Français', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
}
test('saves French, localizes onboarding and keeps card and rule names intact', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.goto('/cards');
  await expect(page.locator('.account-control')).toHaveText('Login/Register');
  await french(page);
  await expect(page.getByRole('link', { name: 'Cartes', exact: true })).toBeVisible();
  await expect(page.locator('.account-control')).toHaveText('Connexion / Inscription');
  const lang = (await page.locator('.language-selector').boundingBox())!,
    wallet = await page.locator('.wallet').boundingBox(),
    account = (await page.locator('.account-control').boundingBox())!;
  expect(lang.x + lang.width).toBeLessThanOrEqual(account.x + 1);
  if (wallet) expect(wallet.x + wallet.width).toBeLessThanOrEqual(lang.x + 1);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await page.getByLabel('Chercher une carte', { exact: true }).fill('Aha');
  await expect(page.locator('.card-caption strong').first()).toHaveText('Aha');
  await page.goto('/');
  const welcome = page.locator('.starter-welcome');
  await expect(welcome).toContainText('Votre première main commence ici');
  await welcome.getByRole('link', { name: /Ouvrir mes 3 boosters de départ/ }).click();
  await expect(page.getByRole('heading', { name: '15 cartes ajoutées', exact: true })).toBeVisible({
    timeout: 45000,
  });
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await page.goto('/');
  await expect(page.locator('.guided-tutorial')).toContainText('Cinq cartes. Neuf cases.');
  await page.getByRole('link', { name: 'Lire les règles à la place', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Manuel de combat', exact: true })).toBeVisible();
  for (const name of ['Same', 'Plus', 'Combo', 'Elemental'])
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.locator('.rules-content')).toContainText('valeurs ajustées');
  await page.screenshot({ path: info.outputPath('french-rulebook.png'), fullPage: true });
});
test('uses the provider-framed artwork for both new games without changing the original six', async ({
  page,
}, info) => {
  await page.goto('/cards');
  await expect(page.locator('.account-control')).not.toHaveText('Connecting…');
  for (const universe of ['epic-seven', 'star-savior']) {
    await page.getByLabel('Universe', { exact: true }).selectOption(universe);
    const images = page.locator('.catalog-grid .card-art img');
    await expect(images.first()).toBeVisible();
    expect(
      await images.evaluateAll((items) =>
        items.every((img) => (img as HTMLImageElement).src.endsWith('/listing.webp')),
      ),
    ).toBe(true);
    await expect
      .poll(() =>
        images.evaluateAll((items) =>
          items
            .slice(0, 4)
            .every(
              (img) =>
                (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
            ),
        ),
      )
      .toBe(true);
    await page.screenshot({ path: info.outputPath(`${universe}-card-framing.png`) });
  }
  await page.getByLabel('Universe', { exact: true }).selectOption('genshin');
  await expect(page.locator('.catalog-grid .card-art img').first()).toHaveAttribute(
    'src',
    /\/portrait.webp$/,
  );
  await page.goto('/boosters');
  await expect(page.locator('.booster-type-tile')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Starter Booster', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open 3 packs', exact: true })).toBeEnabled();
});
test('localizes every game section, preserves user content and switches languages during a duel', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const renderErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /unique.*key|hydration|hydrated/i.test(message.text()))
      renderErrors.push(message.text());
  });
  await page.context().setExtraHTTPHeaders({
    'x-forwarded-for': `10.92.0.${info.project.name === 'mobile' ? 2 : 1}`,
  });
  await page.goto('/cards');
  await expect(page.locator('.account-control')).toHaveText('Login/Register');
  await french(page);
  await page.locator('.account-control').click();
  await page.getByLabel('Nom du joueur', { exact: true }).fill('Play');
  await page
    .getByLabel('Adresse e-mail', { exact: true })
    .fill(`fr-${crypto.randomUUID()}@test.invalid`);
  await page.getByLabel('Mot de passe', { exact: true }).fill('french-language-test-123');
  await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
  await expect(page.locator('.account-control')).toHaveText('Déconnexion');
  await openStarterPacks(page);
  const ownProfile = await (await page.request.get('/api/profile')).json();
  await page.request.post('/api/tutorial/complete', { data: {} });
  await page.request.post('/api/chat', {
    data: {
      message: 'Play Same Plus Elemental',
      requestId: crypto.randomUUID(),
      channel: 'general',
    },
  });
  const source = Object.entries(dictionary)
    .filter(([en, fr]) => en !== fr && !en.includes('{'))
    .map(([en]) => en);
  for (const path of [
    '/',
    '/cards',
    '/collection',
    '/boosters',
    '/market',
    '/lobbies',
    '/profile',
    '/achievements',
    '/ladder',
    '/rules',
    '/credits',
  ]) {
    await page.goto(path);
    await expect(page.locator('.account-control')).toHaveText('Déconnexion');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    const leftovers = await page.locator('main').evaluate((root, keys) => {
      const known = new Set(keys),
        found = [] as string[],
        walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walk.nextNode())) {
        const el = node.parentElement,
          text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        if (
          !el ||
          el.closest(
            '[translate="no"],script,style,.card-caption,.message-heading,.chat-message p,.chat-user-list a,.profile-header h2,a[href*="/profile?id="]',
          ) ||
          !el.getBoundingClientRect().height
        )
          continue;
        if (known.has(text)) found.push(text);
      }
      return [...new Set(found)];
    }, source);
    expect(leftovers, path).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `French layout overflow on ${path}`,
    ).toBe(true);
  }
  await page.goto('/');
  await page.screenshot({ path: info.outputPath('french-main-menu.png'), fullPage: true });
  const ownChat = page.locator('.chat-message').filter({
    has: page.locator(`.message-heading a[href*="id=${ownProfile.id}"]`),
  });
  await expect(ownChat.locator('.message-heading a')).toHaveText('Play');
  await expect(ownChat.locator('p')).toHaveText('Play Same Plus Elemental');
  await page.getByRole('button', { name: 'Jouer (non classé)', exact: true }).click();
  await expect(page.locator('.mode-rules-dialog')).toContainText('Three Open');
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  const start = await page.request.post('/api/solo', { data: {} });
  expect(start.status()).toBe(200);
  const { matchId } = await start.json();
  try {
    await page.goto(`/?match=${matchId}`);
    await expect(page.locator('.board-cell')).toHaveCount(9);
    await page.getByTestId('player-card').first().click();
    const selected = await page.getByTestId('player-card').first().getAttribute('aria-pressed');
    await page.getByRole('button', { name: 'Langue : Français', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('player-card').first()).toHaveAttribute(
      'aria-pressed',
      selected!,
    );
    expect((await (await page.request.get('/api/profile')).json()).activeMatchId).toBe(matchId);
    await page.screenshot({ path: info.outputPath('language-switch-in-battle.png') });
    expect(renderErrors).toEqual([]);
  } finally {
    await page.request.post(`/api/matches/${matchId}/resign`, { data: {} });
  }
});
