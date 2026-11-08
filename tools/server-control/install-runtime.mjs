import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const version = '24.22.2';
if (process.platform !== 'win32' || process.arch !== 'x64')
  throw Error('Install the latest supported Node.js LTS for your operating system.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const directory = resolve(root, '.tools', `node-v${version}`);
const target = resolve(directory, 'node.exe');
const base = `https://nodejs.org/dist/v${version}/`;
async function download(path) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw Error(`Node.js download failed (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}
const manifest = (await download('SHASUMS256.txt')).toString('utf8');
const expected = manifest.match(/^([a-f0-9]{64})\s+win-x64\/node\.exe\s*$/m)?.[1];
if (!expected) throw Error('The official Node.js checksum is unavailable.');
const checksum = (bytes) => createHash('sha256').update(bytes).digest('hex');
let installed;
try {
  installed = await readFile(target);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (!installed || checksum(installed) !== expected) {
  const bytes = await download('win-x64/node.exe');
  if (checksum(bytes) !== expected)
    throw Error('Node.js checksum mismatch; no executable installed.');
  await mkdir(directory, { recursive: true });
  await writeFile(target + '.download', bytes);
  await rename(target + '.download', target);
}
if (
  execFileSync(target, ['--version'], { windowsHide: true, encoding: 'utf8' }).trim() !==
  `v${version}`
)
  throw Error('Installed Node.js version did not match the release.');
console.log(`Verified project-local Node.js ${version}. System Node.js was not changed.`);
