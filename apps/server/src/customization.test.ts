import { beforeAll, afterAll, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createPlatform } from './app';
import { ProfileCustomizations } from './customization';
import { ALL_CARDS } from '@gacha-triad/shared';
import { COSMETIC_SETS, type CustomizationView } from '@gacha-triad/shared/customization';
import type { AchievementView, PlayerProfileView } from '@gacha-triad/shared/platform';
import { legalMoves, STANDARD, type GameState } from '@gacha-triad/engine';
let p: Awaited<ReturnType<typeof createPlatform>>,
  custom: ProfileCustomizations,
  serial = 0;
beforeAll(async () => {
  p = await createPlatform(resolve('.'), { memory: true, timers: false });
  await p.bots.set(false);
  custom = new ProfileCustomizations(p.db);
});
afterAll(async () => {
  await p.app.close();
});
async function user(guest = false) {
  const n = ++serial,
    r = await p.app.inject({
      method: 'POST',
      url: guest ? '/api/auth/sign-in/anonymous' : '/api/auth/sign-up/email',
      remoteAddress: `198.18.19.${n}`,
      payload: guest
        ? {}
        : {
            name: `Portrait tester ${n}`,
            email: `portrait-${n}@test.invalid`,
            password: 'portrait-test-password',
          },
    });
  expect(r.statusCode, r.body).toBe(200);
  const actor = { ...r.json().user, isAnonymous: guest },
    token = String(r.headers['set-auth-token']);
  let profile = await p.store.profile(actor);
  for (const pack of await p.store.economy.list(profile.id))
    await p.store.economy.open(profile.id, pack.id);
  await p.store.rebuildDeck(profile.id);
  await p.store.completeTutorial(profile.id);
  profile = await p.store.profile(actor);
  return { actor, token, profile };
}
type User = Awaited<ReturnType<typeof user>>;
async function request(u: User, path = '/profile/customization', body?: unknown, headers = {}) {
  return p.app.inject({
    method: body === undefined ? 'GET' : 'POST',
    url: '/api' + path,
    headers: { authorization: `Bearer ${u.token}`, 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}
async function settings(u: User) {
  const r = await request(u);
  expect(r.statusCode, r.body).toBe(200);
  return r.json<CustomizationView>();
}
async function earned(u: User, id: string) {
  await p.db.read((sql) =>
    sql(
      'INSERT INTO achievement_unlocks(profile_id,achievement_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [u.profile.id, id],
    ),
  );
}
it('catches up achievement progress and claims boosters and Prisms exactly once', async () => {
  const a = await user(),
    b = await user();
  const claim = (u: User, id: string) => request(u, `/achievements/${id}/claim`, {});
  expect((await claim(a, 'first-draw')).statusCode).toBe(409);
  expect((await claim(a, 'first-duel')).statusCode).toBe(404);
  expect(
    (await p.app.inject({ method: 'POST', url: '/api/achievements/first-draw/claim', payload: {} }))
      .statusCode,
  ).toBe(401);
  await p.db.tx(async (sql) => {
    await sql('UPDATE profiles SET draws=1,played=1,perfect_wins=1 WHERE id=$1', [a.profile.id]);
    await sql(
      "INSERT INTO achievement_unlocks(profile_id,achievement_id,unlocked_at) VALUES($1,'first-draw','2026-01-02T00:00:00Z')",
      [a.profile.id],
    );
  });
  const response = await request(a, '/achievements');
  expect(response.statusCode, response.body).toBe(200);
  const items = response.json<AchievementView[]>();
  expect(items).toHaveLength(30);
  expect(items.find((item) => item.id === 'first-draw')).toMatchObject({
    progress: 1,
    unlockedAt: '2026-01-02T00:00:00.000Z',
    reward: { kind: 'prisms', amount: 50 },
    rewardClaimed: false,
  });
  expect((await settings(a)).titles.find((title) => title.id === 'card-player')?.unlocked).toBe(
    true,
  );
  expect((await claim(b, 'perfect')).statusCode).toBe(409);
  for (const id of ['first-draw', 'perfect']) {
    const claims = await Promise.all([claim(a, id), claim(a, id)]);
    expect(claims.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(claims.filter((r) => r.json().claimed)).toHaveLength(1);
  }
  expect((await p.store.profile(a.actor)).prisms).toBe(a.profile.prisms + 50);
  const boosters = (await p.store.economy.list(a.profile.id)).filter(
    (pack) => pack.source === 'achievement',
  );
  expect(boosters).toHaveLength(1);
  await p.store.migrate(resolve('.'));
  expect((await p.store.economy.open(a.profile.id, boosters[0].id)).cards).toHaveLength(5);
  const after = (await request(a, '/achievements')).json<AchievementView[]>();
  expect(after.filter((item) => item.rewardClaimed).map(({ id }) => id)).toEqual([
    'first-draw',
    'perfect',
  ]);
});
it('preserves existing avatars and titles, supplies safe defaults and authorizes all customization routes', async () => {
  const a = await user(),
    b = await user(true),
    card = a.profile.deck[0];
  await p.store.setAvatar(a.profile.id, card);
  const initial = await settings(a);
  expect(initial.settings).toMatchObject({
    revision: 1,
    bio: '',
    frameId: 'classic',
    featuredMode: 'ranked',
    featuredCards: [],
    featuredAchievements: [],
    avatarCardId: card,
    titleId: null,
  });
  expect(initial.frames.filter((f) => f.unlocked).map((f) => f.id)).toEqual(['classic']);
  expect((await settings(b)).settings.frameId).toBe('classic');
  for (const path of ['/profile/customization', '/profile/frame'])
    expect(
      (await p.app.inject({ method: 'POST', url: '/api' + path, payload: {} })).statusCode,
    ).toBe(401);
  expect(
    (await request(a, '/profile/customization', undefined, { 'x-profile-id': b.profile.id }))
      .statusCode,
  ).toBe(403);
  const before = await settings(b);
  const saved = await request(a, '/profile/customization', {
    ...initial.settings,
    bio: 'A small bio.',
    profileId: b.profile.id,
    rating: 9999,
    prisms: 999999,
  });
  expect(saved.statusCode, saved.body).toBe(200);
  expect((await settings(a)).settings.bio).toBe('A small bio.');
  expect(await settings(b)).toEqual(before);
  expect((await p.store.profile(a.actor)).rating).toBe(1000);
  expect((await p.store.profile(a.actor)).prisms).toBe(a.profile.prisms);
});
it('validates all fields before changing any part of a profile', async () => {
  const a = await user(),
    initial = await settings(a),
    unowned = ALL_CARDS.find((c) => !a.profile.inventory[c.id])!.id;
  const invalid = [
    { avatarCardId: '' },
    { titleId: '' },
    { frameId: 'gold' },
    { frameId: 'https://unsafe.invalid/frame.svg' },
    { bannerId: 'https://unsafe.invalid/banner.svg' },
    { avatarCardId: unowned },
    { titleId: 'ranked-champion' },
    { featuredCards: [unowned] },
    { featuredCards: [a.profile.deck[0], a.profile.deck[0]] },
    { featuredCards: Array(4).fill(a.profile.deck[0]) },
    { featuredCards: 'one' },
    { featuredAchievements: ['hundred-wins'] },
    { featuredAchievements: [null] },
    { featuredMode: 'solo' },
    { bio: 'a'.repeat(161) },
    { bio: 'q\u0344'.repeat(80) },
    { bio: '👾'.repeat(161) },
    { bio: 'hello\0world' },
    { bio: 'hello\u202eworld' },
    { bio: 'send me your password' },
    { revision: -1 },
  ];
  for (const patch of invalid) {
    const r = await request(a, '/profile/customization', {
      ...initial.settings,
      bio: 'Should not be saved',
      ...patch,
    });
    expect(r.statusCode, r.body).toBe(400);
    expect(await settings(a)).toEqual(initial);
  }
});
it('unlocks milestone cosmetics through recorded games and saves showcase order atomically', async () => {
  const a = await user(),
    b = await user(),
    id = await p.store.solo(a.profile.id, 'easy', STANDARD);
  await p.db.read((sql) =>
    sql('UPDATE profiles SET rated_cosmetic_games=24 WHERE id=$1', [a.profile.id]),
  );
  const locked = await settings(a);
  expect(locked.frames.find((f) => f.id === 'slate')?.unlocked).toBe(false);
  expect(
    (await request(a, '/profile/customization', { ...locked.settings, bannerId: 'slate' }))
      .statusCode,
  ).toBe(400);
  expect(
    (await request(a, '/profile/frame', { frameId: 'slate', revision: locked.settings.revision }))
      .statusCode,
  ).toBe(400);
  await p.store.resign(a.profile.id, id);
  expect((await settings(a)).frames.find((f) => f.id === 'slate')?.unlocked).toBe(false);
  await p.store.acknowledgeRanked(a.profile.id);
  await p.store.acknowledgeRanked(b.profile.id);
  await p.store.createLobby(a.profile, { mode: 'ranked' });
  const { matchId } = await p.store.createLobby(b.profile, { mode: 'ranked' });
  async function finishDuel(match: string) {
    for (let turn = 0; turn < 9; turn++) {
      const [m] = await p.db.read((sql) =>
        sql<{ state: GameState; version: number; player0: string; player1: string }>(
          'SELECT state,version,player0,player1 FROM matches WHERE id=$1',
          [match],
        ),
      );
      const move = legalMoves(m.state)[0];
      await p.store.move(
        m.state.turn === 0 ? m.player0 : m.player1,
        match,
        move.cardId,
        move.cell,
        m.version,
      );
    }
  }
  await finishDuel(matchId!);
  expect((await p.store.profile(a.actor)).ratedCosmeticGames).toBe(25);
  await expect(p.store.rematch(a.profile.id, matchId!)).rejects.toThrow(
    'Rated matches use matchmaking',
  );
  await p.store.createLobby(a.profile, { mode: 'ranked' });
  const { matchId: rematchId } = await p.store.createLobby(b.profile, { mode: 'ranked' });
  // Older rated matches can retain a rematch link in their history.
  await p.db.read((sql) =>
    sql('UPDATE matches SET rematch_match_id=$1 WHERE id=$2', [rematchId, matchId]),
  );
  await finishDuel(rematchId!);
  expect((await p.store.profile(a.actor)).ratedCosmeticGames).toBe(25);
  const initial = await settings(a);
  expect(initial.frames.find((f) => f.id === 'slate')?.unlocked).toBe(true);
  const cards = a.profile.deck.slice(0, 3).reverse(),
    bio = '<img src=x onerror=alert(1)> Bonjour !';
  const before = await p.store.profile(a.actor);
  const r = await request(a, '/profile/customization', {
    ...initial.settings,
    frameId: 'slate',
    bannerId: 'astral',
    featuredMode: 'shared-draft',
    bio,
    featuredCards: cards,
    featuredAchievements: ['first-duel'],
    avatarCardId: cards[0],
    titleId: 'card-player',
  });
  expect(r.statusCode, r.body).toBe(200);
  const after = r.json<CustomizationView>();
  expect(after.settings.revision).toBe(initial.settings.revision + 1);
  const publicView = (await request(a, `/players/${a.profile.id}`)).json<PlayerProfileView>();
  expect(publicView.bio).toBe(bio);
  expect(publicView.frameId).toBe('slate');
  expect(publicView.bannerId).toBe('astral');
  expect(publicView.featuredMode).toBe('shared-draft');
  expect(publicView.featuredCards.map((c) => c.id)).toEqual(cards);
  expect(publicView.featuredAchievements.map((a) => a.id)).toEqual(['first-duel']);
  expect(publicView).not.toHaveProperty('inventory');
  expect(publicView).not.toHaveProperty('showcase_cards');
  expect(publicView).not.toHaveProperty('profile_revision');
  const profile = await p.store.profile(a.actor);
  expect(profile.inventory).toEqual(before.inventory);
  expect(profile.prisms).toBe(before.prisms);
  expect(profile.deck).toEqual(before.deck);
  expect(profile.rating).toBe(before.rating);
  const { bannerId, ...legacySettings } = after.settings;
  expect(bannerId).toBe('astral');
  const legacySave = await request(a, '/profile/customization', {
    ...legacySettings,
    bio: 'Legacy edit',
  });
  expect(legacySave.statusCode, legacySave.body).toBe(200);
  expect(legacySave.json<CustomizationView>().settings.bannerId).toBe('astral');
  expect(profile.unlockedCosmeticSets).toEqual(['slate']);
  const slate = (await p.store.achievements(a.profile.id)).find(({ id }) => id === 'rated-25');
  expect(slate).toMatchObject({ progress: 25, target: 25, unlockedAt: expect.any(String) });
});
it('backfills earned cosmetic achievements and keeps admin grants off the ordinary server', async () => {
  const testers = await Promise.all(COSMETIC_SETS.map(() => user()));
  for (const [i, { games }] of COSMETIC_SETS.entries())
    await p.db.read((sql) =>
      sql('UPDATE profiles SET rated_cosmetic_games=$1 WHERE id=$2', [
        games,
        testers[i].profile.id,
      ]),
    );
  const migration = await readFile(
    resolve('apps/server/migrations/032_cosmetic_achievements.sql'),
    'utf8',
  );
  await p.db.read((sql) => sql('DELETE FROM schema_migrations WHERE version=32'));
  await p.db.exec(migration);
  await p.db.exec(migration);
  for (const [i, tester] of testers.entries()) {
    const expected = COSMETIC_SETS.slice(0, i + 1).map(({ id }) => id);
    expect((await p.store.profile(tester.actor)).unlockedCosmeticSets).toEqual(expected);
    const current = await settings(tester);
    expect(
      current.frames.filter(({ id, unlocked }) => id !== 'classic' && unlocked).map(({ id }) => id),
    ).toEqual(expected);
    expect(
      current.banners
        ?.filter(({ id, unlocked }) => id !== 'classic' && id !== 'astral' && unlocked)
        .map(({ id }) => id),
    ).toEqual(expected);
  }
  const admin = testers[0];
  await p.db.read((sql) =>
    sql('INSERT INTO server_admins(auth_user_id) VALUES($1)', [admin.actor.id]),
  );
  expect(
    (
      await request(admin, '/admin/achievement-grants', {
        profileId: admin.profile.id,
        achievementId: 'rated-500',
      })
    ).statusCode,
  ).toBe(404);
});
it('rejects stale and simultaneous edits, including legacy avatar/title endpoints', async () => {
  const a = await user(),
    initial = await settings(a);
  const outcomes = await Promise.all([
    request(a, '/profile/customization', { ...initial.settings, bio: 'First edit' }),
    request(a, '/profile/customization', { ...initial.settings, bio: 'Second edit' }),
  ]);
  expect(outcomes.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  const current = await settings(a);
  await p.store.setAvatar(a.profile.id, a.profile.deck[0]);
  expect(
    (await request(a, '/profile/customization', { ...current.settings, bio: 'Stale edit' }))
      .statusCode,
  ).toBe(409);
  const latest = await settings(a);
  await p.store.setTitle(a.profile.id, null);
  expect(
    (await request(a, '/profile/frame', { frameId: 'classic', revision: latest.settings.revision }))
      .statusCode,
  ).toBe(409);
  const fresh = await settings(a);
  expect(
    (await request(a, '/profile/frame', { frameId: 'classic', revision: fresh.settings.revision }))
      .statusCode,
  ).toBe(200);
});
it('removes unavailable showcase cards without revealing the rest of the inventory', async () => {
  const a = await user(),
    initial = await settings(a),
    card = a.profile.deck[0];
  await custom.save(a.profile.id, {
    ...initial.settings,
    featuredCards: [card],
    avatarCardId: card,
  });
  await p.db.read((sql) =>
    sql('UPDATE inventory SET reserved=1 WHERE profile_id=$1 AND card_id=$2', [a.profile.id, card]),
  );
  expect((await p.store.playerProfile(a.profile.id)).featuredCards.map((c) => c.id)).toEqual([
    card,
  ]);
  await p.db.read((sql) =>
    sql('DELETE FROM inventory WHERE profile_id=$1 AND card_id=$2', [a.profile.id, card]),
  );
  expect((await p.store.playerProfile(a.profile.id)).featuredCards).toEqual([]);
  const before = (await settings(a)).settings.revision;
  await p.store.profile(a.actor);
  const saved = await settings(a);
  expect(saved.settings.featuredCards).toEqual([]);
  expect(saved.settings.avatarCardId).toBeNull();
  expect(saved.settings.revision).toBe(before + 1);
  expect(
    (
      await p.db.read((sql) =>
        sql<{ showcase_cards: string[] }>('SELECT showcase_cards FROM profiles WHERE id=$1', [
          a.profile.id,
        ]),
      )
    )[0].showcase_cards,
  ).toEqual([]);
});
it('retains milestone frames and earned achievement bars after the collection shrinks', async () => {
  const a = await user();
  await earned(a, 'collector');
  await earned(a, 'rated-100');
  const initial = await settings(a);
  await custom.equipFrame(a.profile.id, 'jade', initial.settings.revision);
  await p.db.read((sql) => sql('DELETE FROM inventory WHERE profile_id=$1', [a.profile.id]));
  expect((await settings(a)).frames.find((f) => f.id === 'jade')?.unlocked).toBe(true);
  expect(
    (await p.store.achievements(a.profile.id)).find((a) => a.id === 'collector'),
  ).toMatchObject({ progress: 50, target: 50 });
  const bio = '👾🙂'.repeat(80),
    fresh = await settings(a);
  expect(
    (await request(a, '/profile/customization', { ...fresh.settings, avatarCardId: null, bio }))
      .statusCode,
  ).toBe(200);
});
it('propagates equipped frames to social and battle identities and retains achievement progress', async () => {
  const a = await user(),
    b = await user();
  await earned(a, 'first-win');
  await earned(a, 'rated-50');
  const initial = await settings(a);
  await custom.equipFrame(a.profile.id, 'ember', initial.settings.revision);
  const social = await p.social.view(a.profile, new Set([a.profile.id, b.profile.id]));
  expect(social.onlinePlayers.find((p) => p.id === a.profile.id)?.frameId).toBe('ember');
  const lobby = await p.store.createLobby(a.profile, { mode: 'custom', allowBots: false }),
    joined = await p.store.joinLobby(b.profile, lobby.lobbyId!);
  expect((await p.store.view(b.profile.id, joined.matchId!)).players[0].frameId).toBe('ember');
  await p.store.resign(b.profile.id, joined.matchId!);
  expect((await settings(a)).settings.frameId).toBe('ember');
});
