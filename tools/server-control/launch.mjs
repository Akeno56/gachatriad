import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12))
    throw Error('Install Node.js 24 LTS, then reopen Start Server Control.cmd.');

  // Match the controller's environment, including a custom control port/save path.
  try {
    process.loadEnvFile(resolve(root, '.env'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const port = Number(process.env.CONTROL_PORT || 3030);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error('CONTROL_PORT must be a port number between 1 and 65535.');
  const url = `http://127.0.0.1:${port}`;

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
    return true;
  }

  if (!(await ready())) {
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
