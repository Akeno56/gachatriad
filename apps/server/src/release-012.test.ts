import { beforeAll, afterAll, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { createPlatform } from './app';
import { CARDS } from '@gacha-triad/shared';
let p: Awaited<ReturnType<typeof createPlatform>>,
  serial = 0;
beforeAll(async () => {
  p = await createPlatform(resolve('.'), { memory: true, timers: false });
  p.store.isOnline = () => true;
});
afterAll(async () => {
  await p.app.close();
});
async function user() {
  const n = ++serial,
    ip = `198.18.12.${n}`;
  const r = await p.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    remoteAddress: ip,
    payload: {
      name: `Patch twelve ${n}`,
      email: `patch12-${n}@test.invalid`,
      password: 'test-password-twelve',
    },
  });
  expect(r.statusCode, r.body).toBe(200);
  const actor = { ...r.json().user, isAnonymous: false },
    token = String(r.headers['set-auth-token']);
  let profile = await p.store.profile(actor);
  for (const pack of await p.store.economy.list(profile.id))
    await p.store.economy.open(profile.id, pack.id);
  await p.store.completeTutorial(profile.id);
  await p.store.acknowledgeRanked(profile.id);
  profile = await p.store.profile(actor);
  return { actor, profile, ip, token };
}
type Client = Awaited<ReturnType<typeof user>>;
function req(c: Client, path: string, body?: object) {
  return p.app.inject({
    method: body ? 'POST' : 'GET',
    url: '/api' + path,
    remoteAddress: c.ip,
    headers: { authorization: `Bearer ${c.token}` },
    ...(body ? { payload: body } : {}),
  });
}
it('atomically trades twenty duplicate copies for four rewards and retries without another debit', async () => {
  const c = await user(),
    card = CARDS.find((c) => c.rarity === 1)!;
  await p.db.read((sql) =>
    sql(
      'INSERT INTO inventory(profile_id,card_id,quantity) VALUES($1,$2,21) ON CONFLICT(profile_id,card_id) DO UPDATE SET quantity=21,reserved=0',
      [c.profile.id, card.id],
    ),
  );
  const body = {
    kind: 'trade-up',
    cards: [{ cardId: card.id, count: 20 }],
    requestId: 'batch-twelve-0001',
  };
  const r = await req(c, '/collection/duplicates', body);
  expect(r.statusCode, r.body).toBe(200);
  expect(r.json().cards).toHaveLength(4);
  expect(r.json().cards.every((v: { rarity: number }) => v.rarity === 2)).toBe(true);
  expect((await req(c, '/collection/duplicates', body)).json()).toEqual(r.json());
  expect((await p.store.profile(c.actor)).inventory[card.id].quantity).toBe(1);
  expect(
    (await req(c, '/collection/duplicates', { ...body, requestId: 'batch-twelve-0002' }))
      .statusCode,
  ).toBe(409);
  expect(
    (await req(c, '/collection/duplicates', { ...body, cards: [{ cardId: card.id, count: 5 }] }))
      .statusCode,
  ).toBe(409);
});
it('keeps feedback private, retry-safe, bounded and restricted to admins', async () => {
  const c = await user(),
    other = await user();
  const body = {
    kind: 'bug',
    subject: '<img src=x onerror=alert(1)>',
    details: 'This is a report with literal markup.',
    requestId: 'feedback-test-001',
    context: { page: '/collection?token=private#secret', password: 'never store this' },
  };
  const r = await req(c, '/feedback', body);
  expect(r.statusCode, r.body).toBe(200);
  expect((await req(c, '/feedback', body)).json()).toEqual(r.json());
  expect((await req(c, '/admin/feedback')).statusCode).toBe(403);
  expect(
    (await req(other, `/admin/feedback/${r.json().id}`, { status: 'resolved', note: '' }))
      .statusCode,
  ).toBe(403);
  await p.db.read((sql) =>
    sql('INSERT INTO server_admins(auth_user_id) VALUES($1)', [other.actor.id]),
  );
  const reports = (await req(other, '/admin/feedback')).json();
  expect(reports).toHaveLength(1);
  expect(reports[0].subject).toBe(body.subject);
  expect(reports[0].context).toEqual({ page: '/collection' });
  expect(
    (await req(other, `/admin/feedback/${r.json().id}`, { status: 'resolved', note: 'Reviewed' }))
      .statusCode,
  ).toBe(200);
  for (let i = 2; i <= 3; i++)
    expect(
      (await req(c, '/feedback', { ...body, requestId: `feedback-test-00${i}` })).statusCode,
    ).toBe(200);
  expect((await req(c, '/feedback', { ...body, requestId: 'feedback-test-004' })).statusCode).toBe(
    429,
  );
  expect(
    (await req(c, '/feedback', { ...body, details: 'short', requestId: 'feedback-test-005' }))
      .statusCode,
  ).toBe(400);
});
it('waits for humans in both rated queues even when bots are requested, then permits explicit practice only for the owner', async () => {
  await p.bots.set(true, 'medium');
  try {
    for (const mode of ['ranked', 'draft']) {
      const a = await user(),
        b = await user();
      const queue = await req(a, '/lobbies', { mode, allowBots: true });
      expect(queue.statusCode, queue.body).toBe(200);
      const id = queue.json().lobbyId;
      expect((await req(a, '/profile')).json().waitingLobby.allowBots).toBe(false);
      expect((await req(b, `/lobbies/${id}/practice`, {})).statusCode).toBe(409);
      const joined = await req(b, '/lobbies', { mode });
      expect(joined.json().matchId).toBeTruthy();
      expect((await req(a, `/lobbies/${id}/practice`, {})).statusCode).toBe(409);
      await req(a, `/matches/${joined.json().matchId}/resign`, {});
      const c = await user(),
        practice = await req(c, '/lobbies', { mode });
      const qid = practice.json().lobbyId;
      expect((await req(c, `/lobbies/${qid}/practice`, {})).statusCode).toBe(200);
      expect((await req(c, '/profile')).json().waitingLobby.allowBots).toBe(true);
      await p.db.read((sql) =>
        sql("UPDATE lobbies SET created_at=now()-interval '10 seconds' WHERE id=$1", [qid]),
      );
      await new Promise((resolve) => setTimeout(resolve, 4100));
      await p.bots.tick();
      const after = (await req(c, '/profile')).json();
      expect(after.activeMatchId).toBeTruthy();
      const result = await req(c, `/matches/${after.activeMatchId}/resign`, {});
      expect(result.statusCode, result.body).toBe(200);
      const final = (await req(c, '/profile')).json();
      expect(final.rating).toBe(c.profile.rating);
      expect(final.draftRating).toBe(c.profile.draftRating);
    }
  } finally {
    await p.bots.set(false);
  }
});
it('does not expose provider secrets or allow credential accounts to claim Discord fallback addresses', async () => {
  const r = await p.app.inject({ url: '/api/social-providers' });
  expect(r.statusCode).toBe(200);
  expect(r.json()).toEqual([]);
  const denied = await p.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    remoteAddress: '198.18.12.250',
    payload: {
      name: 'Fake Discord',
      email: 'discord-123@discord.gachatriad.invalid',
      password: 'test-password-twelve',
    },
  });
  expect(denied.statusCode).toBe(400);
});
it('preserves existing OAuth login on an occupied network while denying a new account', async () => {
  const c = await user();
  let ran = false;
  await p.security.signup(
    c.ip,
    async () => {
      ran = true;
      expect(p.security.canRegister()).toBe(false);
    },
    true,
  );
  expect(ran).toBe(true);
  await expect(p.security.signup(c.ip, async () => {})).rejects.toMatchObject({ statusCode: 403 });
});
it('starts configured social sign-in with state/PKCE and rejects a forged callback without creating accounts', async () => {
  const saved = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
  };
  Object.assign(process.env, {
    GOOGLE_CLIENT_ID: 'local-google-id',
    GOOGLE_CLIENT_SECRET: 'local-google-secret',
    DISCORD_CLIENT_ID: 'local-discord-id',
    DISCORD_CLIENT_SECRET: 'local-discord-secret',
  });
  let q: Awaited<ReturnType<typeof createPlatform>> | undefined;
  try {
    q = await createPlatform(resolve('.'), { memory: true, timers: false });
    const list = await q.app.inject({ url: '/api/social-providers' });
    expect(list.json()).toEqual(['google', 'discord']);
    expect(list.body).not.toContain('secret');
    for (const provider of ['google', 'discord']) {
      const r = await q.app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/social',
        remoteAddress: '198.18.12.230',
        headers: { origin: 'http://127.0.0.1:3000' },
        payload: { provider, callbackURL: 'http://127.0.0.1:3000/profile', disableRedirect: true },
      });
      expect(r.statusCode, r.body).toBe(200);
      const url = new URL(r.json().url);
      expect(url.searchParams.get('state')).toBeTruthy();
      expect(url.searchParams.get('redirect_uri')).toBe(
        `http://127.0.0.1:3000/api/auth/callback/${provider}`,
      );
      expect(url.href).not.toContain('local-google-secret');
      expect(url.href).not.toContain('local-discord-secret');
      if (provider === 'google') expect(url.searchParams.get('code_challenge')).toBeTruthy();
      expect(
        (
          await q.app.inject({
            url: `/api/auth/callback/${provider}?code=fake&state=forged`,
            remoteAddress: '198.18.12.230',
          })
        ).statusCode,
      ).toBeGreaterThanOrEqual(300);
    }
    expect(await q.db.read((sql) => sql('SELECT id FROM "user"'))).toHaveLength(0);
    const badOrigin = await q.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      headers: { origin: 'https://malicious.invalid' },
      payload: {
        provider: 'google',
        callbackURL: 'https://malicious.invalid',
        disableRedirect: true,
      },
    });
    expect(badOrigin.statusCode).toBe(403);
  } finally {
    await q?.app.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
