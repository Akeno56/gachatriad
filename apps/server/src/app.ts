import Fastify, { LogController, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { Server } from 'socket.io';
import { fromNodeHeaders } from 'better-auth/node';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Database } from './database';
import { createAuth } from './auth';
import { GameStore, GameError, cleanRules } from './store';
import {
  isRatedMode,
  type BoardMoveUpdate,
  type Mode,
  type SiteArea,
} from '@gacha-triad/shared/platform';
import { Trades } from './trades';
import { Wishlist } from './wishlist';
import { BotPopulation } from './bots';
import { allowedOrigins } from './config';
import { Moderation } from './moderation';
import { GuestLifecycle } from './lifecycle';
import { Social } from './social';
import { AccountSecurity } from './account-security';
import { PlayerReview } from './player-review';
import { socialProviders } from './social-auth';
import { Feedback } from './feedback';
import { DailyPuzzles } from './daily-puzzle';
import { DeckLoadouts } from './deck-loadouts';
import { LobbyPresets } from './lobby-presets';
import { PlayerJourney } from './journey';
import { MatchReplays } from './replays';
import { ProfileCustomizations } from './customization';
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
  const security = new AccountSecurity(db);
  const { auth, flushLinks, setGuestCleanup } = await createAuth(db, root, authURL, security);
  const enabledSocialProviders = Object.keys(socialProviders());
  const store = new GameStore(db, (await auth.$context).secret);
  await store.migrate(root);
  const feedback = new Feedback(db, (await auth.$context).secret);
  const puzzles = new DailyPuzzles(db, (await auth.$context).secret);
  const loadouts = new DeckLoadouts(db);
  const lobbyPresets = new LobbyPresets(db);
  const journey = new PlayerJourney(db);
  const replays = new MatchReplays(db);
  const customizations = new ProfileCustomizations(db);
  const review = new PlayerReview(db);
  const achievementGrantsEnabled = process.env.TRIAD_LOCAL_TEST === 'true';
  if (achievementGrantsEnabled)
    await security.action('127.0.0.1', 'allow-shared', 'Isolated PC test save');
  const guests = new GuestLifecycle(store);
  setGuestCleanup((ids) => guests.discard(ids));
  await guests.cleanup();
  const trades = new Trades(db),
    bots = new BotPopulation(store, trades);
  const wishlist = new Wishlist(db);
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
    maxAge: 600,
    exposedHeaders: ['set-auth-token', 'retry-after', 'x-retry-after', 'server-timing'],
  });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });
  const loop = monitorEventLoopDelay({ resolution: 20 });
  let loopMaxMs = 0;
  if (options.timers !== false) loop.enable();
  const performanceTimer =
    options.timers === false
      ? null
      : setInterval(() => {
          loopMaxMs = Math.round(loop.max / 1e6);
          if (loopMaxMs >= 1000)
            app.log.warn(
              { loopMaxMs, databaseQueue: db.queued },
              'Game event loop stalled before request handling',
            );
          loop.reset();
        }, 30000).unref();
  const lastSlowLog = new Map<string, number>();
  app.addHook('onResponse', async (req, reply) => {
    if (reply.elapsedTime < 2000 && reply.statusCode !== 429) return;
    const route = req.routeOptions.url ?? 'unknown';
    const key = `${route}:${reply.statusCode === 429 ? 'limited' : 'slow'}`;
    if (Date.now() - (lastSlowLog.get(key) ?? 0) < 30000) return;
    lastSlowLog.set(key, Date.now());
    req.log.warn(
      { route, status: reply.statusCode, durationMs: Math.round(reply.elapsedTime) },
      'Slow or rate-limited game request',
    );
  });
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
    reply.header('server-timing', `app;dur=${reply.elapsedTime.toFixed(1)}`);
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
      await security.assertAllowed(req.ip);
      if (req.url.split('?')[0].replace(/\/+$/, '') === '/api/auth/sign-up/email') {
        const b = req.body as { name?: unknown; email?: unknown } | null;
        if (typeof b?.name !== 'string' || !b.name.trim().length || b.name.trim().length > 32)
          throw new GameError('Player names must contain 1–32 characters.');
        b.name = b.name.trim();
        if (
          typeof b.email === 'string' &&
          b.email.trim().toLowerCase().endsWith('@discord.gachatriad.invalid')
        )
          throw new GameError('This address is reserved for Discord sign-in.');
      }
      const headers = fromNodeHeaders(req.headers);
      headers.set('x-gacha-client-ip', req.ip);
      const handleAuth = async () => {
        const response = await auth.handler(
          new Request(new URL(req.url, authURL), {
            method: req.method,
            headers,
            ...(req.method === 'POST' ? { body: JSON.stringify(req.body ?? {}) } : {}),
          }),
        );
        if (response.ok) {
          const result = (await response
            .clone()
            .json()
            .catch(() => null)) as { user?: { id: string } } | null;
          if (result?.user?.id) await security.remember(result.user.id, req.ip);
        }
        return response;
      };
      const response =
        authBucket(req.url) === 'signup'
          ? await security.signup(req.ip, handleAuth)
          : req.url.split('?')[0].startsWith('/api/auth/callback/')
            ? await security.signup(req.ip, handleAuth, true)
            : await handleAuth();
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
  async function sessionActor(req: FastifyRequest) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) throw new GameError('Your session has expired. Reload to reconnect.', 401);
    await security.remember(session.user.id, req.ip);
    const requested = req.headers['x-profile-id'];
    return {
      actor: session.user,
      requested: typeof requested === 'string' ? requested : undefined,
    };
  }
  async function profile(req: FastifyRequest) {
    const { actor, requested } = await sessionActor(req);
    return store.identity(actor, requested);
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
      const p = await store.identity(
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
      socket.data.scopedMoves = socket.handshake.auth.scopedMoves === true;
      socket.data.scopedSiteUpdates = socket.handshake.auth.scopedSiteUpdates === true;
      const ip =
        typeof socket.request.headers['x-forwarded-for'] === 'string' &&
        socket.request.socket.remoteAddress?.replace(/^::ffff:/, '') === '127.0.0.1'
          ? socket.request.headers['x-forwarded-for'].split(',').at(-1)!.trim()
          : socket.request.socket.remoteAddress || socket.handshake.address;
      const address = await security.remember(session.user.id, ip);
      socket.data.ip = address.ip;
      socket.data.network = address.network;
      next();
    } catch {
      next(new Error('Session unavailable.'));
    }
  });
  const notify = () => io.emit('platform:changed');
  function notifySite(
    req: FastifyRequest,
    actorId: string,
    own: readonly SiteArea[],
    broadcast: readonly SiteArea[] = [],
    recipients: readonly unknown[] = [actorId],
  ) {
    for (const socket of io.sockets.sockets.values()) {
      const owner = socket.data.profileId;
      const areas = recipients.includes(owner) ? [...broadcast, ...own] : broadcast;
      if (!areas.length) continue;
      if (!socket.data.scopedSiteUpdates) socket.emit('platform:changed');
      else if (owner !== actorId || socket.id !== req.headers['x-game-socket'])
        socket.emit(
          'platform:changed',
          'site',
          areas,
          areas.includes('identity') ? actorId : undefined,
        );
    }
  }
  const publicIdentity = ['identity', 'social', 'ladder'] as const;
  const deckUpdates = ['decks', 'profile'] as const;
  function notifyMove(move: BoardMoveUpdate, players: readonly (string | null)[]) {
    for (const socket of io.sockets.sockets.values()) {
      if (!socket.data.scopedMoves) socket.emit('platform:changed');
      else if (players.includes(socket.data.profileId))
        socket.emit('platform:changed', 'match-move', move);
      // Spectators already authorized by /spectate re-read their own board without receiving private IDs.
      else socket.emit('platform:changed', 'spectator-move');
    }
  }
  store.isOnline = (profileId) =>
    Array.from(io.sockets.sockets.values()).some((socket) => socket.data.profileId === profileId);
  await store.recoverPresence();
  io.on('connection', (socket) => {
    const owner: string = socket.data.profileId;
    const room = `presence:${owner}`;
    const firstConnection = !io.sockets.adapter.rooms.has(room);
    void socket.join(room);
    const publishPresence = (online: boolean) => {
      io.emit('platform:changed', 'social');
      void store
        .presence(owner, online)
        .then((inMatch) => {
          if (inMatch) notify();
        })
        .catch((error) => app.log.error(error));
    };
    if (firstConnection) publishPresence(true);
    socket.on('disconnect', () => {
      if (!shuttingDown && !io.sockets.adapter.rooms.has(room)) publishPresence(false);
    });
  });
  const body = (req: FastifyRequest) =>
    req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const id = (req: FastifyRequest) => (req.params as { id: string }).id;
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/social-providers', async () => enabledSocialProviders);
  app.post('/api/feedback', async (req) => {
    const p = await profile(req),
      address = await security.address(req.ip);
    return feedback.create(p.id, address.network, body(req));
  });
  app.get('/api/admin/feedback', async (req) => {
    if (!(await profile(req)).isAdmin) throw new GameError('Administrator access required.', 403);
    return feedback.list((req.query as { status?: string }).status);
  });
  app.post('/api/admin/feedback/:id', async (req) => {
    if (!(await profile(req)).isAdmin) throw new GameError('Administrator access required.', 403);
    return feedback.update(id(req), body(req).status, body(req).note);
  });
  app.get('/api/local-control/feedback', async (req) => {
    requireHost(req);
    return feedback.list((req.query as { status?: string }).status);
  });
  app.post('/api/local-control/feedback/:id', async (req) => {
    requireHost(req);
    return feedback.update(id(req), body(req).status, body(req).note);
  });
  app.post('/api/lobbies/:id/practice', async (req) => {
    const p = await profile(req);
    const population = await bots.status();
    if (!population.enabled || population.counts.medium + population.counts.hard === 0)
      throw new GameError('No Medium or Hard practice bots are available.', 409);
    const result = await store.enablePractice(p.id, id(req));
    notify();
    return result;
  });
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
    const p = await profile(req),
      target = body(req).playerId;
    await social.friend(p, target, 'request');
    notifySite(req, p.id, ['social'], [], [p.id, target]);
    return { ok: true };
  });
  app.post('/api/friends/:id/accept', async (req) => {
    const p = await profile(req);
    await social.friend(p, id(req), 'accept');
    notifySite(req, p.id, ['social'], [], [p.id, id(req)]);
    return { ok: true };
  });
  app.delete('/api/friends/:id', async (req) => {
    const p = await profile(req);
    await social.friend(p, id(req), 'remove');
    notifySite(req, p.id, ['social'], [], [p.id, id(req)]);
    return { ok: true };
  });
  app.post('/api/chat', async (req) => {
    const result = await social.post(
      await profile(req),
      body(req).message,
      body(req).requestId,
      body(req).channel,
    );
    io.emit('platform:changed', 'social');
    return result;
  });
  app.get('/api/friends/:id/messages', async (req) => social.messages(await profile(req), id(req)));
  app.post('/api/friends/:id/messages', async (req) => {
    const p = await profile(req),
      target = id(req);
    const result = await social.postFriend(p, target, body(req).message, body(req).requestId);
    for (const socket of io.sockets.sockets.values())
      if (socket.data.profileId === p.id || socket.data.profileId === target)
        socket.emit('platform:changed', 'social');
    return result;
  });
  app.post('/api/friends/:id/read', async (req) => {
    const p = await profile(req);
    await social.readMessages(p, id(req), body(req).through);
    for (const socket of io.sockets.sockets.values())
      if (socket.data.profileId === p.id) socket.emit('platform:changed', 'social');
    return { ok: true };
  });
  app.delete('/api/chat/:id', async (req) => {
    await social.deleteMessage(await profile(req), id(req));
    io.emit('platform:changed', 'social');
    return { ok: true };
  });
  app.post('/api/invites', async (req) => {
    const { playerId, turnHours, rules } = body(req);
    const result = await social.invite(await profile(req), playerId, turnHours, rules);
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
  app.get('/api/correspondence', async (req) => store.correspondence((await profile(req)).id));
  app.get('/api/lobby-presets', async (req) => lobbyPresets.list((await profile(req)).id));
  app.post('/api/lobby-presets', async (req) => lobbyPresets.save(await profile(req), body(req)));
  app.delete('/api/lobby-presets/:id', async (req) =>
    lobbyPresets.remove((await profile(req)).id, id(req)),
  );
  app.post('/api/profile/title', async (req) => {
    const p = await profile(req);
    await store.setTitle(p.id, body(req).titleId);
    notifySite(req, p.id, ['profile'], publicIdentity);
    return { ok: true };
  });
  app.get('/api/profile/customization', async (req) =>
    customizations.view((await profile(req)).id),
  );
  app.post('/api/profile/customization', async (req) => {
    const p = await profile(req);
    const result = await customizations.save(p.id, body(req));
    notifySite(req, p.id, ['profile'], publicIdentity);
    return result;
  });
  app.post('/api/profile/frame', async (req) => {
    const p = await profile(req);
    const result = await customizations.equipFrame(p.id, body(req).frameId, body(req).revision);
    notifySite(req, p.id, ['profile'], publicIdentity);
    return result;
  });
  app.post('/api/ranked/acknowledge', async (req) => {
    const p = await profile(req);
    if (!p.registered) throw new GameError('Register before entering ranked.', 403);
    if (body(req).acknowledged !== true) throw new GameError('Acknowledge the Ranked rules.');
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
  if (achievementGrantsEnabled)
    app.post('/api/admin/achievement-grants', async (req) => {
      const admin = await profile(req);
      if (!admin.isAdmin) throw new GameError('Administrator access required.', 403);
      const { profileId, achievementId } = body(req);
      const result = await store.grantAchievement(admin.id, profileId, achievementId);
      if (result.granted) notifySite(req, admin.id, ['profile'], [], [result.profileId]);
      return { granted: result.granted };
    });
  app.get('/api/local-control/users', async (req) => {
    requireHost(req);
    return {
      users: await moderation.users(String((req.query as { search?: string }).search ?? '')),
      log: await moderation.log(),
      networks: await db.read((sql) =>
        sql('SELECT * FROM account_networks ORDER BY network LIMIT 200'),
      ),
      securityLog: await db.read((sql) =>
        sql(
          'SELECT action,network,note,created_at FROM security_log ORDER BY created_at DESC LIMIT 50',
        ),
      ),
    };
  });
  app.get('/api/local-control/battle/:id', async (req) => {
    requireHost(req);
    return store.view('', id(req), true, true);
  });
  app.get('/api/local-control/history/:id', async (req) => {
    requireHost(req);
    return review.history(id(req), Number((req.query as { offset?: string }).offset || 0));
  });
  app.get('/api/admin/players/:id/history', async (req) => {
    if (!(await profile(req)).isAdmin) throw new GameError('Administrator access required.', 403);
    return review.history(id(req), Number((req.query as { offset?: string }).offset || 0));
  });
  app.get('/api/admin/players/:id/collection', async (req) => {
    if (!(await profile(req)).isAdmin) throw new GameError('Administrator access required.', 403);
    return review.collection(id(req));
  });
  app.post('/api/local-control/network', async (req) => {
    requireHost(req);
    const b = body(req),
      network = await security.action(b.network, b.action, b.reason);
    if (b.action === 'block')
      for (const socket of io.sockets.sockets.values())
        if (socket.data.network === network) socket.disconnect(true);
    return { ok: true };
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
          { id: s.data.profileId, name: s.data.name, registered: s.data.registered, ip: s.data.ip },
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
      battles: await db.read((sql) =>
        sql(`SELECT m.id,m.mode,m.status,p.name AS player0,coalesce(o.name,'CPU') AS player1
        FROM matches m JOIN profiles p ON p.id=m.player0 LEFT JOIN profiles o ON o.id=m.player1
        WHERE m.status IN('playing','drafting') ORDER BY m.created_at DESC LIMIT 100`),
      ),
      population: await bots.status(),
      performance: {
        loopMaxMs,
        databaseQueue: db.queued,
        memoryMB: Math.round(process.memoryUsage().rss / 1048576),
      },
      uptime: process.uptime(),
      connections: connected.length,
      players: players.map((p) => ({
        ...p,
        match: active.find((m) => m.player0 === p.id || m.player1 === p.id) ?? null,
      })),
    };
  });
  app.get('/api/profile', async (req) => {
    const { actor, requested } = await sessionActor(req);
    const p = await store.profile(actor, requested);
    return achievementGrantsEnabled ? { ...p, achievementGrantsEnabled: true } : p;
  });
  app.post('/api/tutorial/complete', async (req) => {
    await store.completeTutorial((await profile(req)).id);
    return { ok: true };
  });
  app.get('/api/players/:id', async (req) => {
    await profile(req);
    return store.playerProfile(id(req));
  });
  app.get('/api/players/:id/mini', async (req) => {
    await profile(req);
    return store.playerMiniProfile(id(req));
  });
  app.post('/api/profile/avatar', async (req) => {
    const p = await profile(req),
      cardId = body(req).cardId;
    if (cardId !== null && typeof cardId !== 'string')
      throw new GameError('Choose a card or the default emblem.');
    await store.setAvatar(p.id, cardId as string | null);
    notifySite(req, p.id, ['profile'], publicIdentity);
    return store.playerProfile(p.id);
  });
  app.get('/api/lobbies', async (req) => {
    await profile(req);
    return store.lobbies();
  });
  app.get('/api/achievements', async (req) => store.achievements((await profile(req)).id));
  app.get('/api/replays', async (req) =>
    replays.list(
      (await profile(req)).id,
      req.query as { mode?: string; offset?: string; favorites?: string },
    ),
  );
  app.get('/api/replays/:id', async (req) => replays.get((await profile(req)).id, id(req)));
  app.post('/api/replays/:id/favorite', async (req) => {
    const p = await profile(req);
    const result = await replays.favorite(p.id, id(req), body(req).favorite);
    notifySite(req, p.id, ['replays']);
    return result;
  });
  app.get('/api/journey', async (req) => {
    const { actor, requested } = await sessionActor(req);
    const p = await store.identity(actor, requested);
    return journey.view(p.id, actor.id, p.registered);
  });
  app.post('/api/journey/weekly/claim', async (req) => {
    const { actor, requested } = await sessionActor(req);
    const p = await store.identity(actor, requested);
    const result = await journey.claim(p.id, actor.id, p.registered, body(req).week);
    notifySite(req, p.id, ['profile']);
    return result;
  });
  app.post('/api/journey/weekly/swap', async (req) => {
    const { actor, requested } = await sessionActor(req);
    const p = await store.identity(actor, requested);
    return journey.swap(p.id, actor.id, p.registered, body(req));
  });
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
    notifySite(req, p.id, ['profile']);
    return result;
  });
  app.get('/api/boosters/daily', async (req) => {
    const p = await profile(req);
    return store.economy.daily(p.id, p.registered);
  });
  app.post('/api/boosters/daily', async (req) => {
    const p = await profile(req);
    const result = await store.economy.claimDaily(p.id, p.registered);
    notifySite(req, p.id, ['profile', 'boosters', 'daily-booster']);
    return result;
  });
  app.post('/api/boosters/open-batch', async (req) => {
    const p = await profile(req);
    const result = await store.economy.openBatch(p.id, body(req).packIds);
    notifySite(req, p.id, ['profile', 'boosters']);
    return result;
  });
  app.post('/api/collection/duplicates', async (req) => {
    const p = await profile(req);
    const b = body(req);
    const result = await store.economy.duplicates(p.id, b.kind, b.cards, b.requestId);
    notifySite(req, p.id, ['profile', 'decks']);
    return result;
  });
  app.post('/api/boosters/buy', async (req) => {
    const p = await profile(req);
    const pack = await store.economy.purchase(
      p.id,
      body(req).requestId,
      body(req).quantity,
      body(req).type,
    );
    notifySite(req, p.id, ['profile', 'boosters']);
    return pack;
  });
  app.post('/api/boosters/:id/open', async (req) => {
    const p = await profile(req);
    const pack = await store.economy.open(p.id, id(req));
    notifySite(req, p.id, ['profile', 'boosters']);
    return pack;
  });
  app.get('/api/trades', async (req) => {
    await profile(req);
    const query = req.query as { includeSales?: string; card?: string };
    const offers = await trades.list(typeof query.card === 'string' ? query.card : undefined);
    // Old open clients require a requested card and cannot render currency listings.
    return query.includeSales === 'true' ? offers : offers.filter((o) => o.wanted !== null);
  });
  app.get('/api/wishlist', async (req) => wishlist.list((await profile(req)).id));
  app.post('/api/wishlist', async (req) => {
    const p = await profile(req);
    const { cardId, saved } = body(req);
    const result = await wishlist.save(p.id, cardId, saved);
    notifySite(req, p.id, ['wishlist']);
    return result;
  });
  app.get('/api/market/requests', async (req) => trades.requests((await profile(req)).id));
  app.post('/api/market/requests', async (req) => {
    const p = await profile(req);
    const result = await trades.request(p, body(req).cardId);
    notifySite(req, p.id, [], ['market']);
    return result;
  });
  app.post('/api/market/requests/:id/respond', async (req) => {
    const p = await profile(req);
    const result = await trades.respond(p, id(req), body(req).price);
    notifySite(req, p.id, ['profile'], ['market']);
    return result;
  });
  app.delete('/api/market/requests/:id', async (req) => {
    const p = await profile(req);
    const affected = await trades.cancelRequest(p, id(req));
    notifySite(req, p.id, ['profile'], ['market'], affected);
    return { ok: true };
  });
  app.post('/api/trades', async (req) => {
    const p = await profile(req),
      b = body(req);
    if (
      typeof b.offered !== 'string' ||
      (b.price === undefined && typeof b.wanted !== 'string') ||
      (b.price !== undefined && b.wanted != null)
    )
      throw new GameError('Choose a card exchange or a currency sale.');
    const result = await trades.create(
      p,
      b.offered,
      b.price === undefined ? (b.wanted as string) : null,
      b.price as number | undefined,
    );
    notifySite(req, p.id, ['profile'], ['market']);
    return result;
  });
  app.post('/api/trades/:id/accept', async (req) => {
    const p = await profile(req);
    const affected = await trades.accept(p, id(req));
    notifySite(req, p.id, deckUpdates, ['market'], affected);
    return { ok: true };
  });
  app.delete('/api/trades/:id', async (req) => {
    const p = await profile(req);
    await trades.cancel(p, id(req));
    notifySite(req, p.id, ['profile'], ['market']);
    return { ok: true };
  });
  app.get('/api/deck-loadouts', async (req) => loadouts.list((await profile(req)).id));
  app.post('/api/deck-loadouts', async (req) => {
    const p = await profile(req);
    const result = await loadouts.save(p.id, body(req));
    notifySite(req, p.id, deckUpdates);
    return result;
  });
  app.post('/api/deck-loadouts/:id', async (req) => {
    const p = await profile(req);
    const result = await loadouts.save(p.id, body(req), id(req));
    notifySite(req, p.id, deckUpdates);
    return result;
  });
  app.post('/api/deck-loadouts/:id/activate', async (req) => {
    const p = await profile(req);
    const result = await loadouts.activate(p.id, id(req), body(req).revision);
    notifySite(req, p.id, deckUpdates);
    return result;
  });
  app.delete('/api/deck-loadouts/:id', async (req) => {
    const p = await profile(req);
    const result = await loadouts.remove(p.id, id(req), body(req).revision);
    notifySite(req, p.id, deckUpdates);
    return result;
  });
  app.post('/api/deck', async (req) => {
    const p = await profile(req);
    await store.saveDeck(p.id, body(req).cards as string[]);
    notifySite(req, p.id, deckUpdates);
    return { ok: true };
  });
  app.post('/api/deck/auto', async (req) => {
    const p = await profile(req);
    const result = await store.rebuildDeck(p.id);
    notifySite(req, p.id, deckUpdates);
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
        b.style,
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
      if (result.matchId) notify();
      else notifySite(req, p.id, ['profile'], ['lobbies']);
      return result;
    },
  );
  app.post('/api/lobbies/:id/join', async (req) => {
    const [lobby] = await db.read((sql) =>
      sql<{ mode: string }>('SELECT mode FROM lobbies WHERE id=$1', [id(req)]),
    );
    if (lobby && isRatedMode(lobby.mode))
      throw new GameError('Rated matches are queue only. Join matchmaking.', 403);
    const result = await store.joinLobby(await profile(req), id(req));
    notify();
    return result;
  });
  app.delete('/api/lobbies/:id', async (req) => {
    const p = await profile(req);
    const invited = await store.cancelLobby(p.id, id(req));
    notifySite(req, p.id, ['profile', 'social'], ['lobbies'], [p.id, ...invited]);
    return { ok: true };
  });
  app.get('/api/matches/:id', async (req) => store.view((await profile(req)).id, id(req)));
  app.post('/api/matches/:id/admin-win', async (req) => {
    const p = await profile(req);
    if (!p.isAdmin) throw new GameError('Administrator access required.', 403);
    await store.adminWin(p.id, id(req));
    notify();
    return store.view(p.id, id(req));
  });
  app.get('/api/spectate/:id', async (req) => store.view((await profile(req)).id, id(req), true));
  app.get('/api/matches/:id/chat', async (req) =>
    social.battleMessages(await profile(req), id(req)),
  );
  app.post('/api/matches/:id/chat', async (req) => {
    const { message, requestId, stampId } = body(req);
    const { id: messageId, recipients } = await social.postBattle(
      await profile(req),
      id(req),
      message,
      requestId,
      stampId,
    );
    for (const socket of io.sockets.sockets.values())
      if (recipients.includes(socket.data.profileId))
        socket.emit('platform:changed', 'battle-chat');
    return { id: messageId };
  });
  app.post('/api/matches/:id/move', async (req) => {
    const p = await profile(req),
      b = body(req);
    if (typeof b.cardId !== 'string' || !Number.isInteger(b.cell) || !Number.isInteger(b.version))
      throw new GameError('Invalid move.');
    const move = await store.move(p.id, id(req), b.cardId, b.cell as number, b.version as number);
    if (move) notifyMove(move.update, move.players);
    else notify();
    return store.view(p.id, id(req));
  });
  app.post('/api/matches/:id/draft', async (req) => {
    const p = await profile(req);
    await store.lockDraft(p.id, id(req), body(req).cards as string[]);
    notify();
    return store.view(p.id, id(req));
  });
  app.post('/api/matches/:id/draft/pick', async (req) => {
    const p = await profile(req);
    await store.pickDraft(p.id, id(req), body(req).cardId, body(req).version);
    notify();
    return store.view(p.id, id(req));
  });
  app.get('/api/puzzles/daily', async (req) => {
    const { actor, requested } = await sessionActor(req),
      p = await store.identity(actor, requested);
    return puzzles.view(p.id, p.registered, actor.id);
  });
  app.get('/api/puzzles/archive', async (req) => {
    await profile(req);
    return puzzles.archive((req.query as { before?: string }).before);
  });
  app.get('/api/puzzles/archive/:day', async (req) => {
    await profile(req);
    return puzzles.archived((req.params as { day: string }).day);
  });
  for (const action of ['start', 'move', 'claim'] as const)
    app.post(
      `/api/puzzles/daily/${action}`,
      { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
      async (req) => {
        const { actor, requested } = await sessionActor(req),
          p = await store.identity(actor, requested);
        const result = await puzzles[action](p.id, p.registered, body(req), actor.id);
        return result;
      },
    );
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
              changed = (await db.background(() => bots.tick(notifyMove))) || changed;
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
    if (performanceTimer) clearInterval(performanceTimer);
    loop.disable();
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
  return {
    app,
    store,
    db,
    auth,
    bots,
    trades,
    moderation,
    guests,
    social,
    security,
    review,
    puzzles,
  };
}
