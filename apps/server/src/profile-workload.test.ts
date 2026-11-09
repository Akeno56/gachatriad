import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { createPlatform } from './app';
let p: Awaited<ReturnType<typeof createPlatform>>;
const actor = { id: 'profile-workload', name: 'Workload', isAnonymous: false };
beforeAll(async () => {
  p = await createPlatform(resolve('.'), { memory: true, timers: false });
  await p.db.read((sql) =>
    sql(
      `INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt","isAnonymous") VALUES($1,$2,'workload@test.invalid',false,now(),now(),false)`,
      [actor.id, actor.name],
    ),
  );
  const profile = await p.store.profile(actor);
  for (const pack of await p.store.economy.list(profile.id))
    await p.store.economy.open(profile.id, pack.id);
});
afterAll(async () => {
  await p?.app.close();
});

it('does not rewrite an unchanged profile on repeated polling', async () => {
  const profile = await p.store.profile(actor);
  const row = () =>
    p.db.read((sql) =>
      sql<{ version: string }>('SELECT xmin::text AS version FROM profiles WHERE id=$1', [
        profile.id,
      ]),
    );
  const before = await row();
  const results = await Promise.all(Array.from({ length: 30 }, () => p.store.profile(actor)));
  expect(results.every((r) => r.id === profile.id && r.deck.length === 5)).toBe(true);
  expect(await row()).toEqual(before);
});

it('still removes a lost card and avatar, then stops rewriting the repaired deck', async () => {
  const profile = await p.store.profile(actor),
    removed = profile.deck[0];
  await p.db.tx(async (sql) => {
    await sql(
      "UPDATE profiles SET avatar_card=$2,last_seen_at=now()-interval '2 minutes' WHERE id=$1",
      [profile.id, removed],
    );
    await sql('UPDATE inventory SET quantity=0 WHERE profile_id=$1 AND card_id=$2', [
      profile.id,
      removed,
    ]);
  });
  const next = await p.store.profile(actor);
  expect(next.deck).toEqual(profile.deck.filter((id) => id !== removed));
  expect(next.avatarCardId).toBeNull();
  const row = () =>
    p.db.read((sql) =>
      sql<{ version: string }>('SELECT xmin::text AS version FROM profiles WHERE id=$1', [
        profile.id,
      ]),
    );
  const before = await row();
  await p.store.profile(actor);
  expect(await row()).toEqual(before);
});

it('authorizes routine reads without rebuilding the full profile and retains ownership/admin checks', async () => {
  const response = await p.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    remoteAddress: '198.18.11.1',
    payload: {
      name: 'Read workload',
      email: 'read-workload@test.invalid',
      password: 'read-workload-password-123',
    },
  });
  expect(response.statusCode, response.body).toBe(200);
  const headers = { authorization: `Bearer ${response.headers['set-auth-token']}` };
  const initial = await p.app.inject({ method: 'GET', url: '/api/profile', headers });
  expect(initial.statusCode, initial.body).toBe(200);
  const identity = initial.json();
  const full = vi.spyOn(p.store, 'profile');
  try {
    for (const url of ['/api/social', '/api/boosters', '/api/ladder']) {
      const r = await p.app.inject({ method: 'GET', url, headers });
      expect(r.statusCode, r.body).toBe(200);
    }
    expect(full).not.toHaveBeenCalled();
    const forbidden = await p.app.inject({
      method: 'GET',
      url: '/api/social',
      headers: { ...headers, 'x-profile-id': 'another-profile' },
    });
    expect(forbidden.statusCode).toBe(403);
    await p.moderation.action(identity.id, 'promote', 'Workload test');
    const admin = await p.store.identity(response.json().user);
    expect(admin.isAdmin).toBe(true);
    expect(admin).not.toHaveProperty('inventory');
    await p.moderation.action(identity.id, 'suspend', 'Workload test');
    const suspended = await p.app.inject({ method: 'GET', url: '/api/social', headers });
    expect(suspended.statusCode).toBe(403);
  } finally {
    full.mockRestore();
  }
});
