import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { normalizeStaticExport } from './normalize-static-export.mjs';
it('publishes Windows segment payloads at browser URLs without changing existing Linux exports', async () => {
  const root = await mkdtemp(resolve('.cache/export-paths-'));
  await mkdir(join(root, 'cards/__next.cards/children/detail'), { recursive: true });
  await writeFile(join(root, 'cards/__next.cards/__PAGE__.txt'), 'page payload');
  await writeFile(join(root, 'cards/__next.cards/children/detail/__PAGE__.txt'), 'nested payload');
  await writeFile(join(root, '__next.__PAGE__.txt'), 'linux payload');
  expect(await normalizeStaticExport(root)).toBe(2);
  expect(await readFile(join(root, 'cards/__next.cards.__PAGE__.txt'), 'utf8')).toBe(
    'page payload',
  );
  expect(
    await readFile(join(root, 'cards/__next.cards.children.detail.__PAGE__.txt'), 'utf8'),
  ).toBe('nested payload');
  expect(await normalizeStaticExport(root)).toBe(0);
  expect(await readFile(join(root, '__next.__PAGE__.txt'), 'utf8')).toBe('linux payload');
});
it('fails instead of overwriting a conflicting navigation payload', async () => {
  const root = await mkdtemp(resolve('.cache/export-conflict-'));
  await mkdir(join(root, '__next.cards'));
  await writeFile(join(root, '__next.cards/__PAGE__.txt'), 'new payload');
  await writeFile(join(root, '__next.cards.__PAGE__.txt'), 'different payload');
  await expect(normalizeStaticExport(root)).rejects.toThrow(
    'Conflicting static navigation payload',
  );
  expect(await readFile(join(root, '__next.cards.__PAGE__.txt'), 'utf8')).toBe('different payload');
});
