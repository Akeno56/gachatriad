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
  const { auth, flushLinks } = await createAuth(db, root, authURL);
  const store = new GameStore(db, (await auth.$context).secret);
  await store.migrate(root);
  const trades = new Trades(db),
    bots = new BotPopulation(store, trades);
  const moderation = new Moderation(db);
  if (!bots.available) await bots.set(false);
  else if (process.env.POPULATE_BOTS === 'true') await bots.set(true);
  else if (process.env.POPULATE_BOTS === 'false') await bots.set(false);
  const app = Fastify({
    trustProxy: '127.0.0.1',
    logger: options.logger ?? false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 32768,
  });
  await app.register(cors, {
    origin: origins,
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
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (req, reply) => {
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
  const io = new Server(app.server, {
    cors: { origin: origins, credentials: true },
    maxHttpBufferSize: 8192,
    allowRequest: (req, callback) =>
      callback(null, !req.headers.origin || origins.includes(req.headers.origin)),
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
      socket.data.profileId = p.id;
      socket.data.name = p.name;
      socket.data.registered = p.registered;
      next();
    } catch {
      next(new Error('Session unavailable.'));
    }
  });
  const notify = () => io.emit('platform:changed');
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
    const result = await bots.set(body(req).enabled as boolean);
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
    const status = await bots.set(body(req).enabled as boolean);
    notify();
    return status;
  });
  app.get('/api/boosters', async (req) => store.economy.list((await profile(req)).id));
  app.post('/api/boosters/buy', async (req) => {
    const pack = await store.economy.purchase((await profile(req)).id, body(req).requestId);
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
  app.post('/api/solo', async (req) => {
    const p = await profile(req);
    const b = body(req);
    const matchId = await store.solo(
      p.id,
      b.difficulty === 'normal' ? 'normal' : 'easy',
      cleanRules(b.rules),
    );
    notify();
    return { matchId };
  });
  app.post('/api/lobbies', async (req) => {
    const p = await profile(req);
    const b = body(req);
    const result = await store.createLobby(p, {
      mode: b.mode as Mode,
      name: typeof b.name === 'string' ? b.name : undefined,
      rules: b.rules,
      tradeRule: typeof b.tradeRule === 'string' ? b.tradeRule : undefined,
    });
    notify();
    return result;
  });
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
    lastBots = 0;
  const timer =
    options.timers === false
      ? null
      : setInterval(async () => {
          if (ticking) return;
          ticking = true;
          try {
            let changed = (await store.tick()).length > 0;
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
    bots.shutdown();
    app.log.info('Stopping game timers and player connections.');
    if (timer) clearInterval(timer);
    io.engine?.close();
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
  return { app, store, db, auth, bots, trades, moderation };
}
