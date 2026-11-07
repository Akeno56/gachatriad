import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicRoot = resolve(root, 'apps/web/public');
const catalog = JSON.parse(await readFile(resolve(root, 'data/characters/catalog.json'), 'utf8'));
const assets = JSON.parse(await readFile(resolve(root, 'data/assets/manifest.json'), 'utf8'));
const errors = [];
const keys = new Set();
for (const asset of assets) {
  const key = `${asset.universeId}:${asset.characterId}:${asset.assetType}`;
  if (keys.has(key)) errors.push(`Duplicate asset: ${key}`);
  keys.add(key);
  const path = resolve(publicRoot, '.' + asset.localPath);
  const rel = relative(publicRoot, path);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
    errors.push(`Unsafe path: ${key}`);
    continue;
  }
  try {
    const file = await stat(path);
    if (!file.size) errors.push(`Empty file: ${key}`);
    const meta = await sharp(path).metadata();
    if (meta.width !== asset.width || meta.height !== asset.height)
      errors.push(`Incorrect dimensions: ${key}`);
  } catch (e) {
    errors.push(`Missing or unreadable ${key}: ${e.message}`);
  }
  if (!asset.sourcePage || !asset.sha256 || (!asset.savedReference && !asset.sourceUrl))
    errors.push(`Incomplete provenance: ${key}`);
}
if (new Set(catalog.map((c) => c.id)).size !== catalog.length)
  errors.push('Duplicate character IDs.');
for (const c of catalog)
  if (!c.assets.some((a) => a.type === 'portrait')) errors.push(`Missing portrait: ${c.id}`);
console.log(
  JSON.stringify(
    {
      characters: catalog.length,
      assets: assets.length,
      portraits: assets.filter((a) => a.assetType === 'portrait').length,
      icons: assets.filter((a) => a.assetType === 'icon').length,
      universes: Object.fromEntries(
        [...new Set(catalog.map((c) => c.universeId))].map((u) => [
          u,
          catalog.filter((c) => c.universeId === u).length,
        ]),
      ),
      errors,
    },
    null,
    2,
  ),
);
if (errors.length) process.exitCode = 1;
