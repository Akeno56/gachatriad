import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat, chmod } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { resolve, dirname, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
export async function createController(options = {}) {
  const dataDir = resolve(options.dataDir || process.env.DATA_DIR || resolve(root, '.data'));
  await mkdir(dataDir, { recursive: true });
  const settingsPath = resolve(dataDir, 'server-control.json');
  let config = {
    frontendURL: 'https://akeno56.github.io/gachatriad/',
    gamePort: Number(options.gamePort || process.env.SERVER_PORT || 3001),
    allowBots: false,
    botDifficulty: 'medium',
  };
  try {
    config = { ...config, ...JSON.parse(await readFile(settingsPath, 'utf8')) };
  } catch {}
  const port = Number(options.port || process.env.CONTROL_PORT || 3030),
    previewPort = Number(options.previewPort || process.env.PREVIEW_PORT || 3000);
  const csrf = randomBytes(32).toString('hex'),
    controlSecret = randomBytes(32).toString('hex');
  let child = null,
    tunnel = null,
    preview = null,
    publicURL = '',
    busy = false,
    closing = false,
    lastError = '',
    logs = [];
  const binary =
    process.env.CLOUDFLARED_PATH ||
    resolve(root, '.tools', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  const log = (kind, line) => {
    for (const text of String(line).split(/\r?\n/).filter(Boolean)) {
      logs.push({ at: new Date().toISOString(), kind, text: text.slice(0, 1000) });
    }
    logs = logs.slice(-160);
  };
  const alive = (proc) => proc && proc.exitCode === null && proc.signalCode === null;
  const localAPI = () => `http://127.0.0.1:${config.gamePort}`;
  async function gameHealth() {
    try {
      return (await fetch(localAPI() + '/api/health', { signal: AbortSignal.timeout(1000) })).ok;
    } catch {
      return false;
    }
  }
  async function state(search = '') {
    let online = null;
    let moderation = { users: [], log: [] };
    try {
      const response = await fetch(localAPI() + '/api/local-control/status', {
        headers: { 'x-local-control': controlSecret },
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) online = await response.json();
    } catch {}
    if (online) {
      try {
        const response = await fetch(
          localAPI() +
            '/api/local-control/users?search=' +
            encodeURIComponent(search.slice(0, 100)),
          {
            headers: { 'x-local-control': controlSecret },
            signal: AbortSignal.timeout(1500),
          },
        );
        if (response.ok) moderation = await response.json();
      } catch {}
    }
    const running = alive(child);
    let base = '/gachatriad';
    try {
      base = JSON.parse(
        await readFile(resolve(root, 'apps/web/out/build-info.json'), 'utf8'),
      ).basePath;
    } catch {}
    const link = new URL(config.frontendURL);
    if (publicURL) link.searchParams.set('server', publicURL);
    return {
      config,
      busy,
      running,
      external: !running && (await gameHealth()),
      serverURL: localAPI(),
      online,
      moderation,
      publicURL,
      shareURL: publicURL ? link.href : '',
      tunnelInstalled: existsSync(binary),
      tunnelRunning: alive(tunnel),
      previewURL: preview
        ? `http://127.0.0.1:${previewPort}${base}/?server=${encodeURIComponent(localAPI())}`
        : '',
      lastError,
      logs,
    };
  }
  async function stopProcess(proc, label) {
    if (!alive(proc)) return;
    const exited = once(proc, 'exit');
    if (proc.connected) proc.send('shutdown');
    else proc.kill('SIGTERM');
    let timer;
    await Promise.race([exited, new Promise((r) => (timer = setTimeout(r, 15000)))]);
    clearTimeout(timer);
    if (alive(proc)) {
      proc.kill('SIGKILL');
      await Promise.race([exited, new Promise((r) => setTimeout(r, 2000))]);
    }
    log('control', `${label} stopped.`);
  }
  async function startGame() {
    if (alive(child)) return;
    if (await gameHealth())
      throw Error(
        'A game server is already running outside this control panel. Stop pnpm dev/start first.',
      );
    const origin = new URL(config.frontendURL).origin;
    child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: resolve(root, 'apps/server'),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        DATA_DIR: dataDir,
        SERVER_PORT: String(config.gamePort),
        SERVER_HOST: '127.0.0.1',
        NODE_ENV: 'production',
        CLIENT_ORIGIN: origin,
        ALLOWED_ORIGINS: `http://127.0.0.1:${previewPort},http://localhost:${previewPort},http://127.0.0.1:3000,http://localhost:3000`,
        BETTER_AUTH_URL: publicURL || localAPI(),
        LOCAL_CONTROL_SECRET: controlSecret,
        LOCAL_BOTS: 'true',
        POPULATE_BOTS: config.allowBots ? 'true' : 'false',
        BOT_DIFFICULTY: config.botDifficulty,
      },
    });
    const current = child;
    current.stdout.on('data', (x) => log('game', x));
    current.stderr.on('data', (x) => log('game', x));
    current.on('error', (e) => {
      lastError = e.message;
      log('error', e.message);
    });
    current.on('exit', (code, signal) => {
      log('control', `Game process exited (${signal || code}).`);
      if (child === current) child = null;
    });
    for (let i = 0; i < 70; i++) {
      if (await gameHealth()) {
        log('control', 'Game server is ready.');
        return;
      }
      if (!alive(current)) throw Error('The game server exited. See its log below.');
      await new Promise((r) => setTimeout(r, 200));
    }
    await stopProcess(current, 'Game');
    throw Error('The game server did not become ready in time.');
  }
  async function stopTunnel() {
    await stopProcess(tunnel, 'HTTPS tunnel');
    tunnel = null;
    publicURL = '';
  }
  async function installTunnel() {
    if (process.platform !== 'win32' && process.platform !== 'linux')
      throw Error('Install cloudflared and set CLOUDFLARED_PATH on this platform.');
    const assetName =
      process.platform === 'win32' ? 'cloudflared-windows-amd64.exe' : 'cloudflared-linux-amd64';
    if (process.arch !== 'x64')
      throw Error('Install the cloudflared build for your CPU and set CLOUDFLARED_PATH.');
    log('control', 'Downloading the official Cloudflare tunnel helper…');
    const response = await fetch(
      'https://api.github.com/repos/cloudflare/cloudflared/releases/latest',
      { headers: { 'user-agent': 'GachaTriad-local-control' }, signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok) throw Error('Cannot read the official Cloudflare release.');
    const release = await response.json(),
      asset = release.assets.find((a) => a.name === assetName);
    if (
      !asset?.browser_download_url?.startsWith(
        'https://github.com/cloudflare/cloudflared/releases/download/',
      )
    )
      throw Error('Official tunnel asset is missing.');
    const download = await fetch(asset.browser_download_url, {
      signal: AbortSignal.timeout(180000),
    });
    if (!download.ok) throw Error('Tunnel helper download failed.');
    const bytes = Buffer.from(await download.arrayBuffer());
    if (bytes.length !== asset.size) throw Error('Incomplete tunnel helper download.');
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (asset.digest && asset.digest !== `sha256:${digest}`)
      throw Error('Tunnel helper checksum mismatch.');
    await mkdir(dirname(binary), { recursive: true });
    await writeFile(binary, bytes);
    if (process.platform !== 'win32') await chmod(binary, 0o700);
    log('control', `Installed official cloudflared ${release.tag_name}.`);
  }
  async function startTunnel() {
    if (!alive(child)) throw Error('Start the game server first.');
    if (alive(tunnel)) return;
    if (!existsSync(binary)) throw Error('Install the tunnel helper first.');
    publicURL = '';
    tunnel = spawn(binary, ['tunnel', '--no-autoupdate', '--url', localAPI()], {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const current = tunnel;
    let collected = '';
    const output = (x) => {
      const text = String(x);
      log('tunnel', text);
      collected = (collected + text).slice(-4096);
      const found = collected.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/);
      if (found) publicURL = found[0];
    };
    current.stdout.on('data', output);
    current.stderr.on('data', output);
    current.on('error', (e) => {
      lastError = e.message;
      log('error', e.message);
    });
    current.on('exit', () => {
      if (tunnel === current) {
        tunnel = null;
        publicURL = '';
      }
      log('control', 'HTTPS tunnel closed.');
    });
    for (let i = 0; i < 150; i++) {
      if (publicURL) {
        log('control', 'Public session link is ready.');
        return;
      }
      if (!alive(current)) throw Error('The HTTPS tunnel exited. See its log.');
      await new Promise((r) => setTimeout(r, 200));
    }
    await stopTunnel();
    throw Error('The HTTPS tunnel did not produce an address.');
  }
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.mp3': 'audio/mpeg',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
  };
  async function startPreview() {
    if (preview) return;
    if (!existsSync(resolve(root, 'apps/web/out/index.html'))) return;
    const publicRoot = resolve(root, 'apps/web/out');
    let base = '/gachatriad';
    try {
      base = JSON.parse(await readFile(resolve(publicRoot, 'build-info.json'), 'utf8')).basePath;
    } catch {}
    const server = createServer(async (req, res) => {
      try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname === '/' && base) {
          res.writeHead(302, { location: `${base}/?server=${encodeURIComponent(localAPI())}` });
          res.end();
          return;
        }
        if (base && pathname !== base && !pathname.startsWith(base + '/')) throw Error();
        const rel = pathname.slice(base.length) || '/';
        let file = resolve(publicRoot, '.' + rel);
        if (file !== publicRoot && !file.startsWith(publicRoot + sep)) throw Error();
        let info = await stat(file);
        if (info.isDirectory()) {
          file = resolve(file, 'index.html');
          info = await stat(file);
        }
        let start = 0,
          end = info.size - 1,
          status = 200;
        const headers = {
          'content-type': mime[extname(file)] || 'application/octet-stream',
          'accept-ranges': 'bytes',
          'cache-control': 'no-store',
        };
        if (req.headers.range) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
          if (!match) {
            res.writeHead(416);
            res.end();
            return;
          }
          start = Number(match[1]);
          end = match[2] ? Math.min(Number(match[2]), end) : end;
          if (start > end) {
            res.writeHead(416, { 'content-range': `bytes */${info.size}` });
            res.end();
            return;
          }
          status = 206;
          headers['content-range'] = `bytes ${start}-${end}/${info.size}`;
        }
        headers['content-length'] = String(end - start + 1);
        res.writeHead(status, headers);
        if (req.method === 'HEAD' || info.size === 0) {
          res.end();
          return;
        }
        createReadStream(file, { start, end })
          .on('error', () => res.destroy())
          .pipe(res);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(previewPort, '127.0.0.1', resolve);
      });
      preview = server;
      log('control', `Static local preview ready on ${previewPort}.`);
    } catch {
      log(
        'control',
        `Local preview port ${previewPort} is occupied; GitHub Pages is still available.`,
      );
    }
  }
  const server = createServer(async (req, res) => {
    const expected = `http://127.0.0.1:${port}`;
    if (
      req.headers.host !== `127.0.0.1:${port}` ||
      (req.headers.origin && req.headers.origin !== expected)
    ) {
      res.writeHead(403);
      res.end('Local control only');
      return;
    }
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    if (req.method === 'GET' && req.url === '/') {
      const html = (
        await readFile(resolve(root, 'tools/server-control/control.html'), 'utf8')
      ).replace('__CSRF__', csrf);
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(html);
      return;
    }
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && new URL(req.url, expected).pathname === '/state') {
      res.end(
        JSON.stringify(await state(new URL(req.url, expected).searchParams.get('search') || '')),
      );
      return;
    }
    if (req.method !== 'POST' || req.headers['x-control-token'] !== csrf) {
      res.writeHead(403);
      res.end(JSON.stringify({ error: 'Local control token required.' }));
      return;
    }
    if (busy) {
      res.writeHead(409);
      res.end(JSON.stringify({ error: 'Another control action is still running.' }));
      return;
    }
    busy = true;
    lastError = '';
    try {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 4096) throw Error('Request too large.');
      }
      const body = raw ? JSON.parse(raw) : {};
      if (req.url === '/exit') {
        res.end(JSON.stringify({ ok: true }));
        setTimeout(() => void close().catch((error) => log('error', error.message)), 50);
        return;
      }
      if (req.url === '/start') await startGame();
      else if (req.url === '/stop') {
        await stopTunnel();
        await stopProcess(child, 'Game');
        child = null;
      } else if (req.url === '/restart') {
        await stopProcess(child, 'Game');
        child = null;
        await startGame();
      } else if (req.url === '/tunnel/install') await installTunnel();
      else if (req.url === '/tunnel/start') await startTunnel();
      else if (req.url === '/tunnel/stop') await stopTunnel();
      else if (['/moderation', '/population', '/grant', '/delete-account'].includes(req.url)) {
        if (!alive(child)) throw Error('Start the game server first.');
        const population = req.url === '/population';
        if (population && typeof body.enabled !== 'boolean')
          throw Error('Choose enabled or disabled.');
        const response = await fetch(
          localAPI() +
            {
              '/population': '/api/local-control/bots',
              '/moderation': '/api/local-control/moderation',
              '/grant': '/api/local-control/grant',
              '/delete-account': '/api/local-control/delete-account',
            }[req.url],
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-local-control': controlSecret },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30000),
          },
        );
        const result = await response.json();
        if (!response.ok) throw Error(result.error || 'The server rejected this action.');
        if (population) {
          config = { ...config, allowBots: body.enabled, botDifficulty: result.difficulty };
          await writeFile(settingsPath, JSON.stringify(config, null, 2));
        }
        log(
          'control',
          population
            ? `Bot population ${body.enabled ? 'enabled' : 'paused'}.`
            : `User action: ${body.action || req.url.slice(1)} (${body.profileId}).`,
        );
      } else if (req.url === '/settings') {
        const url = new URL(body.frontendURL);
        if (
          url.protocol !== 'https:' &&
          !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
        )
          throw Error('Use the HTTPS GitHub Pages URL.');
        if (url.username || url.password || url.search || url.hash)
          throw Error('Use a site URL without credentials or query parameters.');
        config = { ...config, frontendURL: url.href, allowBots: body.allowBots === true };
        await writeFile(settingsPath, JSON.stringify(config, null, 2));
        if (alive(child)) {
          await stopProcess(child, 'Game');
          child = null;
          await startGame();
        }
      } else throw Error('Unknown control action.');
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      lastError = error.message;
      log('error', lastError);
      res.writeHead(400);
      res.end(JSON.stringify({ error: lastError }));
    } finally {
      busy = false;
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  await startPreview();
  async function close() {
    if (closing) return;
    closing = true;
    await stopTunnel();
    await stopProcess(child, 'Game');
    child = null;
    if (preview) await new Promise((r) => preview.close(r));
    await new Promise((r) => server.close(r));
  }
  return { server, state, close, url: `http://127.0.0.1:${port}` };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = await createController();
  console.log(`Gacha Triad control panel: ${controller.url}`);
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, async () => {
      await controller.close();
      process.exit(0);
    });
}
