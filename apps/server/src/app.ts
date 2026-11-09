import Fastify, { LogController, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { Server } from 'socket.io';
import { fromNodeHeaders } from 'better-auth/node';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Database } from './database';
import { createAuth } from './auth';
import { GameStore, GameError, cleanRules } from './store';
import type { Mode } from '@gacha-triad/shared/platform';
import { Trades } from './trades';
import { BotPopulation } from './bots';
import { allowedOrigins } from './config';
import { Moderation } from './moderation';
import { GuestLifecycle } from './lifecycle';
import { Social } from './social';
export async function createPlatform(
  root: string,
  options: { memory?: boolean; timers?: boolean; logger?: boolean } = {},
) {
  await mkdir(process.env.DATA_DIR || resolve(root, '.data'), { recursive: true });
  const db = new Database(
    options.memory
      ? undefined
      : resolve(process.env.DATA_DIR || resolve(root, '.data'), 'postgres'),
  );
  const origin = process.env.CLIENT_ORIGIN || 'http://127.0.0.1:3000';
  const origins = allowedOrigins();
  const authURL = process.env.BETTER_AUTH_URL || origin;
  const { auth, flushLinks, setGuestCleanup } = await createAuth(db, root, authURL);
  const store = new GameStore(db, (await auth.$context).secret);
  await store.migrate(root);
  const guests = new GuestLifecycle(store);
  setGuestCleanup((ids) => guests.discard(ids));
  await guests.cleanup();
  const trades = new Trades(db),
    bots = new BotPopulation(store, trades);
  const moderation = new Moderation(db);
  const social = new Social(store);
  if (!bots.available) await bots.set(false);
  else if (process.env.POPULATE_BOTS === 'true') await bots.set(true);
  else if (process.env.POPULATE_BOTS === 'false') await bots.set(false);
  else if ((await bots.status()).enabled) await bots.set(true);
  if (process.env.BOT_DIFFICULTY)
    await bots.set((await bots.status()).enabled, process.env.BOT_DIFFICULTY);
  const app = Fastify({
    trustProxy: '127.0.0.1',
    logger: options.logger ?? false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 32768,
  });
  await app.register(cors, {
    origin: origins,
    methods: ['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'],
    credentials: true,
    exposedHeaders: ['set-auth-token'],
  });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });
  app.setErrorHandler((error, req, reply) => {
    const code =
      error instanceof GameError
        ? error.statusCode
        : ((error as { statusCode?: number }).statusCode ?? 500);
    if (code >= 500) req.log.error(error);
    reply.code(code).send({
      error: code >= 500 ? 'The server could not complete that action.' : (error as Error).message,
    });
  });
  app.addHook('onRequest', async (req) => {
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      req.headers.origin &&
      !origins.includes(req.headers.origin)
    )
      throw new GameError('Origin is not allowed.', 403);
  });
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('cache-control', 'no-store');
    reply.header('referrer-policy', 'no-referrer');
    return payload;
  });
  const authBucket = (url: string) =>
    url.includes('/sign-up')
      ? 'signup'
      : url.includes('/sign-in/anonymous')
        ? 'guest'
        : url.includes('/sign-in')
          ? 'login'
          : 'session';
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    config: {
      rateLimit: {
        max: (req: FastifyRequest) =>
          ({ signup: 5, guest: 20, login: 10, session: 60 })[authBucket(req.url)],
        timeWindow: '1 minute',
        keyGenerator: (req: FastifyRequest) => `${req.ip}:auth:${authBucket(req.url)}`,
      },
    },
    handler: async (req, reply) => {
      if (req.url.split('?')[0].replace(/\/+$/, '') === '/api/auth/sign-up/email') {
        const b = req.body as { name?: unknown } | null;
        if (typeof b?.name !== 'string' || !b.name.trim().length || b.name.trim().length > 32)
          throw new GameError('Player names must contain 1–32 characters.');
        b.name = b.name.trim();
      }
      const headers = fromNodeHeaders(req.headers);
      headers.set('x-gacha-client-ip', req.ip);
      const response = await auth.handler(
        new Request(new URL(req.url, authURL), {
          method: req.method,
          headers,
          ...(req.method === 'POST' ? { body: JSON.stringify(req.body ?? {}) } : {}),
        }),
      );
      await flushLinks();
      reply.code(response.status);
      response.headers.forEach((v, k) => {
        if (k !== 'set-cookie') reply.header(k, v);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.send(await response.text());
    },
  });
  async function profile(req: FastifyRequest) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) throw new GameError('Your session has expired. Reload to reconnect.', 401);
    const requested = req.headers['x-profile-id'];
    return store.profile(session.user, typeof requested === 'string' ? requested : undefined);
  }
  let shuttingDown = false;
  const transports = new Set<string>();
  const upgradedSockets = new Set<import('node:stream').Duplex>();
  const io = new Server(app.server, {
    cors: { origin: origins, credentials: true },
    maxHttpBufferSize: 8192,
    connectTimeout: 10000,
    allowRequest: (req, callback) =>
      callback(
        null,
        !shuttingDown &&
          transports.size < 200 &&
          (!req.headers.origin || origins.includes(req.headers.origin)),
      ),
  });
  io.engine.on('connection', (socket) => {
    transports.add(socket.id);
    socket.once('close', () => transports.delete(socket.id));
  });
  // Track upgrades even before Engine.IO/Socket.IO authentication has finished.
  // http.Server.close() does not close upgraded TCP connections itself.
  app.server.on('upgrade', (_req, socket) => {
    upgradedSockets.add(socket);
    socket.once('close', () => upgradedSockets.delete(socket));
    if (shuttingDown) socket.destroy();
  });
  io.use(async (socket, next) => {
    try {
      const headers = fromNodeHeaders(socket.request.headers);
      if (typeof socket.handshake.auth.token === 'string')
        headers.set('authorization', `Bearer ${socket.handshake.auth.token}`);
      const session = await auth.api.getSession({
        headers,
      });
      if (!session) throw new Error('Sign in first.');
      const p = await store.profile(
        session.user,
        typeof socket.handshake.auth.profileId === 'string'
          ? socket.handshake.auth.profileId
          : undefined,
      );
      if (
        Array.from(io.sockets.sockets.values()).filter((s) => s.data.profileId === p.id).length >= 5
      )
        throw new Error('Too many active connections for this account.');
      socket.data.profileId = p.id;
      socket.data.name = p.name;
      socket.data.registered = p.registered;
      next();
    } catch {
      next(new Error('Session unavailable.'));
    }
  });
  const notify = () => io.emit('platform:changed');
  store.isOnline = (profileId) =>
    Array.from(io.sockets.sockets.values()).some((socket) => socket.data.profileId === profileId);
  await store.recoverPresence();
  io.on('connection', (socket) => {
    void store
      .presence(socket.data.profileId, true)
      .then(notify)
      .catch((error) => app.log.error(error));
    notify();
    socket.on('disconnect', () => {
      if (!shuttingDown && !store.isOnline!(socket.data.profileId))
        void store
          .presence(socket.data.profileId, false)
          .then(notify)
          .catch((error) => app.log.error(error));
      notify();
    });
  });
  const body = (req: FastifyRequest) =>
    req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const id = (req: FastifyRequest) => (req.params as { id: string }).id;
  app.get('/api/health', async () => ({ ok: true }));
  function requireHost(req: FastifyRequest) {
    if (
      !process.env.LOCAL_CONTROL_SECRET ||
      req.headers['x-local-control'] !== process.env.LOCAL_CONTROL_SECRET
    )
      throw new GameError('Not found.', 404);
  }
  app.post('/api/local-control/grant', async (req) => {
    requireHost(req);
    const b = body(req);
    const result = await store.economy.grant(b.profileId, b.kind, b.amount, b.requestId, 'host');
    notify();
    return result;
  });
  app.post('/api/local-control/delete-account', async (req) => {
    requireHost(req);
    const b = body(req);
    const ids = await guests.deleteAccount(b.profileId, b.confirmation);
    if (!ids) throw new GameError('The selected account name must match your confirmation.', 409);
    for (const socket of io.sockets.sockets.values())
      if (ids.includes(socket.data.profileId)) socket.disconnect(true);
    notify();
    return { ok: true };
  });
  app.get('/api/social', async (req) =>
    social.view(
      await profile(req),
      new Set(Array.from(io.sockets.sockets.values()).map((s) => s.data.profileId)),
    ),
  );
  app.get('/api/players/search', async (req) =>
    social.search(await profile(req), (req.query as { search?: string }).search),
  );
  app.post('/api/friends/request', async (req) => {
    await social.friend(await profile(req), body(req).playerId, 'request');
    notify();
    return { ok: true };
  });
  app.post('/api/friends/:id/accept', async (req) => {
    await social.friend(await profile(req), id(req), 'accept');
    notify();
    return { ok: true };
  });
  app.delete('/api/friends/:id', async (req) => {
    await social.friend(await profile(req), id(req), 'remove');
    notify();
    return { ok: true };
  });
  app.post('/api/chat', async (req) => {
    const result = await social.post(
      await profile(req),
      body(req).message,
      body(req).requestId,
      body(req).channel,
    );
    notify();
    return result;
  });
  app.get('/api/friends/:id/messages', async (req) => social.messages(await profile(req), id(req)));
  app.post('/api/friends/:id/messages', async (req) => {
    const p = await profile(req),
      target = id(req);
    const result = await social.postFriend(p, target, body(req).message, body(req).requestId);
    for (const socket of io.sockets.sockets.values())
      if (socket.data.profileId === p.id || socket.data.profileId === target)
        socket.emit('platform:changed');
    return result;
  });
  app.post('/api/friends/:id/read', async (req) => {
    const p = await profile(req);
    await social.readMessages(p, id(req), body(req).through);
    for (const socket of io.sockets.sockets.values())
      if (socket.data.profileId === p.id) socket.emit('platform:changed');
    return { ok: true };
  });
  app.delete('/api/chat/:id', async (req) => {
    await social.deleteMessage(await profile(req), id(req));
    notify();
    return { ok: true };
  });
  app.post('/api/invites', async (req) => {
    const result = await social.invite(await profile(req), body(req).playerId);
    notify();
    return result;
  });
  app.post('/api/invites/:id/respond', async (req) => {
    if (typeof body(req).accept !== 'boolean')
      throw new GameError('Accept or decline the invitation.');
    const result = await social.respond(await profile(req), id(req), body(req).accept as boolean);
    notify();
    return result;
  });
  app.get('/api/ladder', async (req) => {
    await profile(req);
    return social.ladder((req.query as { mode?: string }).mode);
  });
  app.post('/api/profile/title', async (req) => {
    await store.setTitle((await profile(req)).id, body(req).titleId);
    notify();
    return { ok: true };
  });
  app.post('/api/ranked/acknowledge', async (req) => {
    const p = await profile(req);
    if (!p.registered) throw new GameError('Register before entering ranked.', 403);
    if (body(req).acknowledged !== true) throw new GameError('Acknowledge the Trade One warning.');
    await store.acknowledgeRanked(p.id);
    return { ok: true };
  });
  app.post('/api/admin/grants', async (req) => {
    const p = await profile(req);
    if (!p.isAdmin) throw new GameError('Administrator access required.', 403);
    const b = body(req),
      result = await store.economy.grant(b.profileId, b.kind, b.amount, b.requestId, p.id);
    notify();
    return result;
  });
  app.get('/api/local-control/users', async (req) => {
    requireHost(req);
    return {
      users: await moderation.users(String((req.query as { search?: string }).search ?? '')),
      log: await moderation.log(),
    };
  });
  app.post('/api/local-control/moderation', async (req) => {
    requireHost(req);
    const b = body(req);
    const ids = await moderation.action(b.profileId, b.action, b.reason);
    if (b.action === 'suspend' || b.action === 'disconnect') {
      for (const socket of io.sockets.sockets.values())
        if (ids.includes(socket.data.profileId)) socket.disconnect(true);
    }
    if (b.action === 'suspend') {
      const pending = await db.read((sql) =>
        sql<{ id: string; player0: string; player1: string | null }>(
          "SELECT id,player0,player1 FROM matches WHERE status IN('playing','drafting') AND (player0=ANY($1::text[]) OR player1=ANY($1::text[]))",
          [ids],
        ),
      );
      await db.read((sql) =>
        sql(
          "UPDATE lobbies SET status='closed' WHERE host_id=ANY($1::text[]) AND status='waiting'",
          [ids],
        ),
      );
      for (const match of pending)
        await store.resign(ids.includes(match.player0) ? match.player0 : match.player1!, match.id);
    }
    notify();
    return { ok: true };
  });
  app.post('/api/local-control/bots', async (req) => {
    requireHost(req);
    if (typeof body(req).enabled !== 'boolean') throw new GameError('Choose enabled or disabled.');
    const result = await bots.set(
      body(req).enabled as boolean,
      body(req).difficulty,
      body(req).mix,
    );
    notify();
    return result;
  });
  app.get('/api/local-control/status', async (req) => {
    requireHost(req);
    const connected = Array.from(io.sockets.sockets.values());
    const players = [
      ...new Map(
        connected.map((s) => [
          s.data.profileId,
          { id: s.data.profileId, name: s.data.name, registered: s.data.registered },
        ]),
      ).values(),
    ];
    const ids = players.map((p) => p.id);
    const active = ids.length
      ? await db.read((sql) =>
          sql<{ id: string; player0: string; player1: string; mode: string; status: string }>(
            "SELECT id,player0,player1,mode,status FROM matches WHERE status IN('playing','drafting') AND (player0=ANY($1::text[]) OR player1=ANY($1::text[]))",
            [ids],
          ),
        )
      : [];
    return {
      population: await bots.status(),
      uptime: process.uptime(),
      connections: connected.length,
      players: players.map((p) => ({
        ...p,
        match: active.find((m) => m.player0 === p.id || m.player1 === p.id) ?? null,
      })),
    };
  });
  app.get('/api/profile', profile);
  app.post('/api/tutorial/complete', async (req) => {
    await store.completeTutorial((await profile(req)).id);
    return { ok: true };
  });
  app.get('/api/players/:id', async (req) => {
    await profile(req);
    return store.playerProfile(id(req));
  });
  app.post('/api/profile/avatar', async (req) => {
    const p = await profile(req),
      cardId = body(req).cardId;
    if (cardId !== null && typeof cardId !== 'string')
      throw new GameError('Choose a card or the default emblem.');
    await store.setAvatar(p.id, cardId as string | null);
    notify();
    return store.playerProfile(p.id);
  });
  app.get('/api/lobbies', async (req) => {
    await profile(req);
    return store.lobbies();
  });
  app.get('/api/achievements', async (req) => store.achievements((await profile(req)).id));
  app.get('/api/local-bots', async (req) => {
    if (!(await profile(req)).isAdmin) throw new GameError('Administrator access required.', 403);
    return bots.status();
  });
  app.post('/api/local-bots', async (req) => {
    if (!(await profile(req)).isAdmin) throw new GameError('Administrator access required.', 403);
    if (typeof body(req).enabled !== 'boolean') throw new GameError('Choose enabled or disabled.');
    const status = await bots.set(
      body(req).enabled as boolean,
      body(req).difficulty,
      body(req).mix,
    );
    notify();
    return status;
  });
  app.get('/api/boosters', async (req) => store.economy.list((await profile(req)).id));
  app.post('/api/cards/buy', async (req) => {
    const p = await profile(req);
    const result = await store.economy.purchaseCard(p.id, body(req).cardId, body(req).requestId);
    notify();
    return result;
  });
  app.get('/api/boosters/daily', async (req) => {
    const p = await profile(req);
    return store.economy.daily(p.id, p.registered);
  });
  app.post('/api/boosters/daily', async (req) => {
    const p = await profile(req);
    const result = await store.economy.claimDaily(p.id, p.registered);
    notify();
    return result;
  });
  app.post('/api/boosters/open-batch', async (req) => {
    const result = await store.economy.openBatch((await profile(req)).id, body(req).packIds);
    notify();
    return result;
  });
  app.post('/api/collection/duplicates', async (req) => {
    const b = body(req);
    const result = await store.economy.duplicates(
      (await profile(req)).id,
      b.kind,
      b.cards,
      b.requestId,
    );
    notify();
    return result;
  });
  app.post('/api/boosters/buy', async (req) => {
    const pack = await store.economy.purchase(
      (await profile(req)).id,
      body(req).requestId,
      body(req).quantity,
      body(req).type,
    );
    notify();
    return pack;
  });
  app.post('/api/boosters/:id/open', async (req) => {
    const pack = await store.economy.open((await profile(req)).id, id(req));
    notify();
    return pack;
  });
  app.get('/api/trades', async (req) => {
    await profile(req);
    return trades.list();
  });
  app.post('/api/trades', async (req) => {
    const p = await profile(req),
      b = body(req);
    if (typeof b.offered !== 'string' || typeof b.wanted !== 'string')
      throw new GameError('Choose two cards.');
    const result = await trades.create(p, b.offered, b.wanted);
    notify();
    return result;
  });
  app.post('/api/trades/:id/accept', async (req) => {
    await trades.accept(await profile(req), id(req));
    notify();
    return { ok: true };
  });
  app.delete('/api/trades/:id', async (req) => {
    await trades.cancel(await profile(req), id(req));
    notify();
    return { ok: true };
  });
  app.post('/api/deck', async (req) => {
    const p = await profile(req);
    await store.saveDeck(p.id, body(req).cards as string[]);
    notify();
    return { ok: true };
  });
  app.post('/api/deck/auto', async (req) => {
    const result = await store.rebuildDeck((await profile(req)).id);
    notify();
    return { cards: result };
  });
  app.post(
    '/api/solo',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const p = await profile(req);
      const b = body(req);
      const matchId = await store.solo(
        p.id,
        b.difficulty === 'normal' ? 'normal' : 'easy',
        cleanRules(b.rules),
      );
      notify();
      return { matchId };
    },
  );
  app.post(
    '/api/lobbies',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const p = await profile(req);
      const b = body(req);
      const result = await store.createLobby(p, {
        mode: b.mode as Mode,
        name: typeof b.name === 'string' ? b.name : undefined,
        rules: b.rules,
        tradeRule: typeof b.tradeRule === 'string' ? b.tradeRule : undefined,
        allowBots: typeof b.allowBots === 'boolean' ? b.allowBots : undefined,
      });
      notify();
      return result;
    },
  );
  app.post('/api/lobbies/:id/join', async (req) => {
    const result = await store.joinLobby(await profile(req), id(req));
    notify();
    return result;
  });
  app.delete('/api/lobbies/:id', async (req) => {
    await store.cancelLobby((await profile(req)).id, id(req));
    notify();
    return { ok: true };
  });
  app.get('/api/matches/:id', async (req) => store.view((await profile(req)).id, id(req)));
  app.get('/api/matches/:id/chat', async (req) =>
    social.battleMessages(await profile(req), id(req)),
  );
  app.post('/api/matches/:id/chat', async (req) => {
    const p = await profile(req),
      matchId = id(req);
    const result = await social.postBattle(p, matchId, body(req).message, body(req).requestId);
    const players = (await store.view(p.id, matchId)).players;
    for (const socket of io.sockets.sockets.values())
      if (players.some((player) => player.id === socket.data.profileId))
        socket.emit('platform:changed');
    return result;
  });
  app.post('/api/matches/:id/move', async (req) => {
    const p = await profile(req),
      b = body(req);
    if (typeof b.cardId !== 'string' || !Number.isInteger(b.cell) || !Number.isInteger(b.version))
      throw new GameError('Invalid move.');
    await store.move(p.id, id(req), b.cardId, b.cell as number, b.version as number);
    notify();
    return store.view(p.id, id(req));
  });
  app.post('/api/matches/:id/draft', async (req) => {
    const p = await profile(req);
    await store.lockDraft(p.id, id(req), body(req).cards as string[]);
    notify();
    return store.view(p.id, id(req));
  });
  app.post('/api/matches/:id/draft/reveal', async (req) => {
    const p = await profile(req);
    await store.revealDraft(p.id, id(req), body(req).step);
    notify();
    return store.view(p.id, id(req));
  });
  app.post('/api/matches/:id/rematch', async (req) => {
    const p = await profile(req);
    await store.rematch(p.id, id(req), body(req).cancel === true);
    notify();
    return store.view(p.id, id(req));
  });
  app.post('/api/matches/:id/leave', async (req) => {
    await store.leaveResult((await profile(req)).id, id(req));
    notify();
    return { ok: true };
  });
  app.post('/api/matches/:id/resign', async (req) => {
    const p = await profile(req);
    await store.resign(p.id, id(req));
    notify();
    return store.view(p.id, id(req));
  });
  app.post('/api/matches/:id/claim', async (req) => {
    const p = await profile(req);
    if (typeof body(req).cardId !== 'string') throw new GameError('Choose a card.');
    await store.claimCard(p.id, id(req), body(req).cardId as string);
    notify();
    return store.view(p.id, id(req));
  });
  let ticking = false,
    lastBots = 0,
    lastGuestCleanup = Date.now();
  const timer =
    options.timers === false
      ? null
      : setInterval(async () => {
          if (ticking) return;
          ticking = true;
          try {
            let changed = (await store.tick()).length > 0;
            if (Date.now() - lastGuestCleanup > 300000) {
              lastGuestCleanup = Date.now();
              changed = (await guests.cleanup()) > 0 || changed;
            }
            if (Date.now() - lastBots > 1000) {
              lastBots = Date.now();
              changed = (await bots.tick()) || changed;
            }
            if (changed) notify();
          } catch (error) {
            app.log.error(error);
          } finally {
            ticking = false;
          }
        }, 250);
  app.addHook('preClose', async () => {
    shuttingDown = true;
    bots.shutdown();
    app.log.info('Stopping game timers and player connections.');
    if (timer) clearInterval(timer);
    io.engine?.close();
    for (const socket of upgradedSockets) socket.destroy();
    while (ticking) await new Promise((r) => setTimeout(r, 10));
    app.log.info('Game activity stopped.');
  });
  app.addHook('onClose', async () => {
    await new Promise<void>((r) => io.close(() => r()));
    const release = await db.lease();
    try {
      await db.close();
      app.log.info('Game database flushed and closed.');
    } finally {
      release();
    }
  });
  return { app, store, db, auth, bots, trades, moderation, guests, social };
}
