/** Offline, resumable catalog/artwork import. No HTTP requests, no script execution. */
import { mkdir, readFile, writeFile, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parseSavedPage } from './saved-pages.mjs';
import { writeClientIndex } from './client-index.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const input = resolve(flag('--input', resolve(root, 'prydwenData')));
const dryRun = args.includes('--dry-run');
const overwrite = args.includes('--overwrite');
const selected = JSON.parse(await readFile(resolve(root, 'data/assets/selected.json'), 'utf8'));
const manifestPath = resolve(root, 'data/assets/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const catalogPath = resolve(root, 'data/characters/catalog.json');
let catalog = [];
try {
  catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
} catch {}
const found = new Map();
const warnings = [];
const failures = [];
const files = (await readdir(input, { withFileTypes: true }))
  .filter((f) => f.isFile() && f.name.endsWith('.html'))
  .map((f) => resolve(input, f.name));
for (const file of files) {
  const html = await readFile(file, 'utf8');
  const parsed = parseSavedPage(html, file, input);
  warnings.push(...parsed.warnings);
  for (const entry of parsed.characters) {
    const existing = found.get(entry.id);
    if (existing) {
      existing.sourceRarity ||= entry.sourceRarity;
      existing.sourceElement ||= entry.sourceElement;
      existing.sourceRole ||= entry.sourceRole;
      for (const placement of entry.tierPlacements)
        if (!existing.tierPlacements.some((p) => JSON.stringify(p) === JSON.stringify(placement)))
          existing.tierPlacements.push(placement);
      for (const a of entry.assets)
        if (!existing.assets.some((b) => b.type === a.type && b.localFile === a.localFile))
          existing.assets.push(a);
    } else found.set(entry.id, entry);
  }
}
let imported = 0,
  cached = 0;
for (const entry of found.values()) {
  const match = selected.find((s) => s.sourcePage === entry.sourcePage);
  const characterId = match?.characterId || entry.slug;
  const assets = [];
  for (const type of ['portrait', 'icon']) {
    const choices = entry.assets.filter((a) => a.type === type && a.localFile);
    let chosen, bytes;
    for (const candidate of choices) {
      try {
        bytes = await readFile(candidate.localFile);
        chosen = candidate;
        break;
      } catch {}
    }
    if (!chosen) {
      if (type === 'portrait')
        failures.push({ id: entry.id, type, reason: 'No saved portrait file found.' });
      continue;
    }
    const hash = createHash('sha256').update(bytes).digest('hex');
    const localPath = `/assets/characters/${entry.universeId}/${characterId}/${type}.webp`;
    const destination = resolve(root, 'apps/web/public' + localPath);
    const existing = manifest.find(
      (a) =>
        a.characterId === characterId &&
        a.universeId === entry.universeId &&
        (a.assetType || 'portrait') === type,
    );
    let cachedFile = false;
    try {
      await access(destination);
      cachedFile = true;
    } catch {}
    if (existing?.sha256 === hash && cachedFile && !overwrite) {
      cached++;
      assets.push({ type, localPath });
      continue;
    }
    if (dryRun) {
      imported++;
      assets.push({ type, localPath });
      continue;
    }
    try {
      const info = await sharp(bytes).metadata();
      await mkdir(dirname(destination), { recursive: true });
      const output = await sharp(bytes)
        .rotate()
        .resize({
          width: type === 'icon' ? 256 : 640,
          height: type === 'icon' ? 256 : 960,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: type === 'icon' ? 85 : 88 })
        .toFile(destination);
      const record = {
        assetId: `${entry.universeId}-${characterId}-${type}-v1`,
        cardId: match?.cardId || null,
        characterId,
        universeId: entry.universeId,
        assetType: type,
        localPath,
        source: 'Prydwen (user-saved page)',
        sourcePage: entry.sourcePage,
        sourceUrl: chosen.sourceUrl,
        savedReference: chosen.savedReference,
        savedPage: chosen.savedPage,
        importedAt: new Date().toISOString(),
        originalWidth: info.width,
        originalHeight: info.height,
        width: output.width,
        height: output.height,
        sha256: hash,
        rightsReview: 'development-only-unreviewed',
        publicDistributionApproved: false,
        version: 1,
        crop: null,
      };
      const index = manifest.findIndex(
        (a) =>
          a.characterId === characterId &&
          a.universeId === entry.universeId &&
          (a.assetType || 'portrait') === type,
      );
      if (index < 0) manifest.push(record);
      else manifest[index] = record;
      imported++;
      assets.push({ type, localPath });
    } catch (error) {
      failures.push({ id: entry.id, type, reason: error.message });
    }
  }
  const character = {
    id: entry.id,
    characterId,
    universeId: entry.universeId,
    slug: entry.slug,
    name: entry.name,
    sourcePage: entry.sourcePage,
    gameplayCardId: match?.cardId || null,
    gameplayStatus: match ? 'test-card' : 'unbalanced-not-playable',
    sourceRarity: entry.sourceRarity,
    sourceElement: entry.sourceElement,
    sourceRole: entry.sourceRole,
    tierPlacements: entry.tierPlacements,
    assets,
  };
  const index = catalog.findIndex((c) => c.id === entry.id);
  if (index < 0) catalog.push(character);
  else catalog[index] = character;
}
catalog.sort((a, b) => a.universeId.localeCompare(b.universeId) || a.name.localeCompare(b.name));
const summary = {
  runAt: new Date().toISOString(),
  input,
  offline: true,
  dryRun,
  pages: files.length,
  characters: found.size,
  imported,
  cached,
  byUniverse: Object.fromEntries(
    [...new Set([...found.values()].map((c) => c.universeId))].map((id) => [
      id,
      [...found.values()].filter((c) => c.universeId === id).length,
    ]),
  ),
  warnings,
  failures,
};
if (!dryRun) {
  await mkdir(dirname(catalogPath), { recursive: true });
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await writeClientIndex(root, manifest, catalog);
  await writeFile(
    resolve(root, 'data/assets/import-report.json'),
    JSON.stringify(summary, null, 2) + '\n',
  );
}
console.log(JSON.stringify(summary, null, 2));
if (failures.length) process.exitCode = 1;
