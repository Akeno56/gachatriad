import { it, expect } from 'vitest';
import { resolve } from 'node:path';
import { createPlatform } from './app';
import { resetGameplay } from './reset-gameplay';
it('resets all game progress once, retaining login credentials, admins and three new Starter packs', async () => {
  const p = await createPlatform(resolve('.'), { memory: true, timers: false });
  try {
    const signup = await p.app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { origin: 'http://127.0.0.1:3000' },
      payload: {
        name: 'Reset tester',
        email: 'reset@test.invalid',
        password: 'reset-password-123',
      },
    });
    expect(signup.statusCode).toBe(200);
    const cookie = signup.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
      authId = signup.json().user.id;
    const request = (path: string, body?: unknown) =>
      p.app.inject({
        method: body ? 'POST' : 'GET',
        url: '/api' + path,
        headers: { cookie, origin: 'http://127.0.0.1:3000' },
        ...(body ? { payload: body } : {}),
      });
    const profile = (await request('/profile')).json();
    for (const pack of (await request('/boosters')).json())
      await request(`/boosters/${pack.id}/open`, {});
    await p.store.economy.grant(profile.id, 'prisms', 555, 'reset-test-currency', 'test');
    await p.db.read(async (sql) => {
      await sql('INSERT INTO server_admins(auth_user_id) VALUES($1)', [authId]);
      await sql(
        "UPDATE profiles SET rating=1500,draft_rating=1300,played=5,wins=4,losses=1,prisms=555,tutorial_completed=true,ranked_acknowledged=true,peak_rating=1500,best_ranked_position=1,selected_title='card-player' WHERE id=$1",
        [profile.id],
      );
      await sql(
        "INSERT INTO achievement_unlocks(profile_id,achievement_id) VALUES($1,'first-duel')",
        [profile.id],
      );
      await sql(
        "INSERT INTO chat_messages(id,profile_id,body,request_id) VALUES('reset-chat',$1,'Old chat','reset-chat')",
        [profile.id],
      );
    });
    const solo = (await request('/solo', {})).json();
    await request(`/matches/${solo.matchId}/resign`, {});
    expect((await request('/profile')).json().played).toBeGreaterThan(0);
    expect((await resetGameplay(p.store)).applied).toBe(true);
    const after = (await request('/profile')).json();
    expect(after).toMatchObject({
      id: profile.id,
      registered: true,
      isAdmin: true,
      prisms: 0,
      played: 0,
      wins: 0,
      losses: 0,
      rating: 1000,
      draftRating: 1000,
      starterBoosters: 3,
      unopenedBoosters: 3,
      tutorialCompleted: false,
      rankedAcknowledged: false,
      inventory: {},
      deck: [],
      titleId: null,
      avatarCardId: null,
      activeMatchId: null,
    });
    for (const table of [
      'matches',
      'lobbies',
      'inventory',
      'chat_messages',
      'friend_messages',
      'friendships',
      'prism_ledger',
      'achievement_unlocks',
      'admin_grants',
    ])
      expect(await p.db.read((sql) => sql(`SELECT * FROM ${table}`))).toEqual([]);
    expect(await resetGameplay(p.store)).toEqual({ applied: false });
    expect((await request('/boosters')).json()).toHaveLength(3);
    expect(
      (
        await p.app.inject({
          method: 'POST',
          url: '/api/auth/sign-in/email',
          headers: { origin: 'http://127.0.0.1:3000' },
          payload: { email: 'reset@test.invalid', password: 'reset-password-123' },
        })
      ).statusCode,
    ).toBe(200);
  } finally {
    await p.app.close();
  }
});
