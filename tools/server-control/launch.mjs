import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeStaticExport } from '../normalize-static-export.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function main() {
  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  const minimum = major === 22 ? [23, 4] : major === 24 ? [22, 1] : major === 26 ? [12, 1] : null;
  if (
    (minimum && (minor < minimum[0] || (minor === minimum[0] && patch < minimum[1]))) ||
    (!minimum && (major < 28 || major % 2 !== 0))
  )
    throw Error(
      'Update to current Node.js LTS (24.22.2 or newer), or run node tools/server-control/install-runtime.mjs for the project-local Windows copy. Then reopen Start Server Control.cmd.',
    );

  // Match the controller's environment, including a custom control port/save path.
  try {
    process.loadEnvFile(resolve(root, '.env'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const buildPreview = process.argv.includes('--local-test');
  const localTest = buildPreview || process.argv.includes('--test-server');
  if (localTest) {
    Object.assign(process.env, {
      TRIAD_LOCAL_TEST: 'true',
      CONTROL_PORT: '3040',
      PREVIEW_PORT: '3100',
      SERVER_PORT: '3101',
      DATA_DIR: resolve(root, '.data-local'),
      EXTERNAL_GAME_SERVER: 'false',
      FRONTEND_URL: 'https://akeno56.github.io/gachatriad/',
    });
    delete process.env.BOT_DIFFICULTY;
    delete process.env.BETTER_AUTH_SECRET;
  }
  const port = Number(process.env.CONTROL_PORT || 3030);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error('CONTROL_PORT must be a port number between 1 and 65535.');
  const url = `http://127.0.0.1:${port}`;

  let activeState = null;
  async function ready() {
    let response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(700) });
    } catch {
      return false;
    }
    const html = await response.text();
    const ours = response.ok && html.includes('<title>Gacha Triad · Server Control</title>');
    if (!ours) throw Error(`Another application is using ${url}. Close it and try again.`);
    if (localTest) {
      let state;
      try {
        state = await (await fetch(url + '/state', { signal: AbortSignal.timeout(1500) })).json();
      } catch {
        return false;
      }
      activeState = state;
      if (!state.localTest)
        throw Error(`${url} is not the isolated local test panel. Close that other panel first.`);
    }
    return true;
  }

  let running = await ready();
  const desiredRevision = localTest
    ? createHash('sha256')
        .update(await readFile(resolve(root, 'tools/server-control/index.mjs')))
        .digest('hex')
    : '';
  if (localTest && running && (buildPreview || activeState?.controlRevision !== desiredRevision)) {
    const html = await (await fetch(url)).text();
    const token = html.match(/const token = '([^']+)'/)?.[1];
    const stopped = await fetch(url + '/exit', {
      method: 'POST',
      headers: { origin: url, 'content-type': 'application/json', 'x-control-token': token },
      body: '{}',
    });
    if (!stopped.ok)
      throw Error('The local test server is busy. Wait for its current action, then retry.');
    const until = Date.now() + 30000;
    while (await ready()) {
      if (Date.now() > until)
        throw Error('The old test panel is still shutting down. Retry shortly.');
      await new Promise((done) => setTimeout(done, 200));
    }
    running = false;
  }
  if (buildPreview) {
    const cli = createRequire(resolve(root, 'apps/web/package.json')).resolve('next/dist/bin/next');
    console.log('Building the current code for localhost. Test data: .data-local');
    await new Promise((done, reject) => {
      const build = spawn(process.execPath, [cli, 'build', '--webpack'], {
        cwd: resolve(root, 'apps/web'),
        windowsHide: true,
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'production',
          STATIC_EXPORT: 'true',
          NEXT_PUBLIC_BASE_PATH: '',
          NEXT_PUBLIC_LOCAL_TEST: 'true',
          NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3101',
          NEXT_PUBLIC_SERVER_URL: 'http://127.0.0.1:3101',
        },
      });
      build.once('error', reject);
      build.once('exit', (code) =>
        code === 0
          ? done()
          : reject(Error('The local test build failed. See the build output above.')),
      );
    });
    console.log(
      `Normalized ${await normalizeStaticExport(resolve(root, 'apps/web/out'))} static navigation payloads.`,
    );
    await writeFile(
      resolve(root, 'apps/web/out/build-info.json'),
      JSON.stringify({ basePath: '', apiOrigin: 'http://127.0.0.1:3101', hosting: 'local-test' }),
    );
  }
  if (!running) {
    try {
      createRequire(resolve(root, 'apps/server/package.json')).resolve('tsx');
    } catch {
      throw Error(
        'Project dependencies are missing. Complete the one-time pnpm install in docs/ONLINE_DEMO.md.',
      );
    }
    const dataDir = resolve(process.env.DATA_DIR || resolve(root, '.data'));
    await mkdir(dataDir, { recursive: true });
    const logPath = resolve(dataDir, 'control-launcher.log');
    const log = openSync(logPath, 'a');
    let child;
    try {
      child = spawn(process.execPath, [resolve(root, 'tools/server-control/index.mjs')], {
        cwd: root,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', log, log],
      });
    } finally {
      closeSync(log);
    }
    let spawnError;
    child.on('error', (error) => {
      spawnError = error;
    });
    child.unref();
    const deadline = Date.now() + 10000;
    while (!(await ready())) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || Date.now() > deadline)
        throw Error(`The control panel could not start. See ${logPath}`);
      await new Promise((done) => setTimeout(done, 200));
    }
  }

  console.log(`Gacha Triad control panel: ${url}`);
  if (!process.argv.includes('--no-browser')) {
    // Explorer can silently ignore URL arguments; use Windows' registered URL handler.
    await new Promise((done, reject) => {
      const browser = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Start-Process -FilePath '${url}' -ErrorAction Stop`,
        ],
        { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
      );
      let errorText = '';
      browser.stderr.on('data', (chunk) => {
        errorText += chunk;
      });
      browser.once('error', reject);
      browser.once('exit', (code) => {
        if (code === 0) done();
        else
          reject(
            Error(`Windows could not open your browser. Open ${url} manually. ${errorText.trim()}`),
          );
      });
    });
    console.log('Asked Windows to open your default browser.');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
