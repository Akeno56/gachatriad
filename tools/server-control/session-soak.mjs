// Isolated local load fixture. Never connects to an existing/public server or player save.
import { mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = await mkdtemp(resolve('.cache/session-soak-'));
process.env.DATA_DIR = directory;
process.env.LOCAL_BOTS = 'true';
process.env.POPULATE_BOTS = 'true';
const { createPlatform } = await import('../../apps/server/src/app.ts');
const platform = await createPlatform(resolve('.'), { timers: true });
platform.store.isOnline = () => true;
const results = [],
  failures = [],
  samples = [];
const minutes = Math.max(
  1,
  Math.min(120, Number(process.argv.find((a) => a.startsWith('--minutes='))?.split('=')[1] || 60)),
);
let recent = [],
  active = null,
  games = 0;
try {
  const r = await platform.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    remoteAddress: '198.18.200.1',
    payload: {
      name: 'Isolated soak',
      email: 'soak@test.invalid',
      password: 'soak-test-password-123',
    },
  });
  if (r.statusCode !== 200) throw new Error(r.body);
  const token = r.headers['set-auth-token'],
    actor = r.json().user;
  let profile = await platform.store.profile(actor);
  for (const pack of await platform.store.economy.list(profile.id))
    await platform.store.economy.open(profile.id, pack.id);
  await platform.store.completeTutorial(profile.id);
  await platform.app.listen({ host: '127.0.0.1', port: 0 });
  const origin = `http://127.0.0.1:${platform.app.server.address().port}`;
  async function api(path, body) {
    const start = performance.now();
    const response = await fetch(origin + '/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    const ms = performance.now() - start;
    recent.push(ms);
    samples.push(ms);
    if (!response.ok) failures.push({ status: response.status, path, ms });
    return data;
  }
  const start = Date.now();
  let reported = start;
  while (Date.now() - start < minutes * 60000) {
    const [p] = await Promise.all([api('/profile'), api('/social')]);
    profile = p;
    if (p.activeMatchId) {
      active = await api('/matches/' + p.activeMatchId);
      if (active.status === 'playing' && active.game?.turn === active.seat) {
        const card = active.game.hands[active.seat].find((c) => c.card)?.card;
        const cell = active.game.board.findIndex((c) => !c);
        if (card && cell >= 0)
          await api('/matches/' + active.id + '/move', {
            cardId: card.id,
            cell,
            version: active.version,
          });
      }
    } else if (!p.waitingLobbyId && !p.pendingTrade) {
      await api('/lobbies', { mode: 'casual', allowBots: true });
      games++;
    }
    if (Date.now() - reported >= 30000) {
      const sorted = recent.sort((a, b) => a - b);
      const row = {
        seconds: Math.round((Date.now() - start) / 1000),
        requests: samples.length,
        p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] || 0),
        maxMs: Math.round(sorted.at(-1) || 0),
        queued: platform.db.queued,
        memoryMB: Math.round(process.memoryUsage().rss / 1048576),
        games,
        failures: failures.length,
      };
      results.push(row);
      console.log(JSON.stringify(row));
      recent = [];
      reported = Date.now();
      await writeFile(
        resolve(directory, 'results.json'),
        JSON.stringify({ minutes, results, failures }, null, 2),
      );
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  const sorted = samples.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      complete: true,
      minutes,
      requests: samples.length,
      p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
      failures: failures.length,
      report: resolve(directory, 'results.json'),
    }),
  );
} finally {
  await platform.app.close();
}
