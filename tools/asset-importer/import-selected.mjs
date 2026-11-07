/** Downloads only the individually selected image URLs in data/assets/selected.json. No crawling. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeClientIndex } from './client-index.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const nextPackage = require.resolve('next/package.json', { paths: [resolve(root, 'apps/web')] });
const sharp = require(require.resolve('sharp', { paths: [dirname(nextPackage)] }));
const selected = JSON.parse(await readFile(resolve(root, 'data/assets/selected.json'), 'utf8'));
const manifestPath = resolve(root, 'data/assets/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const args = process.argv.slice(2);
const requested = args.includes('--card') ? args[args.indexOf('--card') + 1] : null;
let failures = 0;
for (const asset of selected.filter((a) => !requested || a.cardId === requested)) {
  if (new URL(asset.sourceUrl).hostname !== 'cdn.prydwen.gg')
    throw new Error('Unexpected asset host.');
  if (!/^[a-z0-9-]+$/.test(asset.characterId) || !/^[a-z0-9-]+$/.test(asset.universeId))
    throw new Error('Invalid stable ID.');
  if (args.includes('--dry-run')) {
    console.log(`${asset.cardId}: ${asset.sourceUrl}`);
    continue;
  }
  const localPath = `/assets/characters/${asset.universeId}/${asset.characterId}/portrait.webp`;
  const destination = resolve(root, 'apps/web/public' + localPath);
  const existing = manifest.find(
    (a) => a.cardId === asset.cardId && a.sourceUrl === asset.sourceUrl,
  );
  if (existing && !args.includes('--overwrite')) {
    try {
      await access(destination);
      console.log(`${asset.cardId}: cached`);
      continue;
    } catch {
      /* repair missing file */
    }
  }
  try {
    const response = await fetch(asset.sourceUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.headers.get('content-type')?.startsWith('image/'))
      throw new Error('Not an image.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 20_000_000) throw new Error('Image exceeds selected-import size limit.');
    const original = await sharp(bytes).metadata();
    await mkdir(dirname(destination), { recursive: true });
    const output = await sharp(bytes)
      .rotate()
      .resize({ width: 640, height: 960, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88 })
      .toFile(destination);
    // Preserve an independently imported source icon when replacing its portrait.
    if (
      !manifest.some(
        (a) =>
          a.characterId === asset.characterId &&
          a.universeId === asset.universeId &&
          a.assetType === 'icon',
      )
    ) {
      await sharp(bytes)
        .rotate()
        .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 85 })
        .toFile(resolve(dirname(destination), 'icon.webp'));
    }
    const entry = {
      ...asset,
      assetId: `${asset.characterId}-portrait-v1`,
      assetType: 'portrait',
      localPath,
      iconPath: localPath.replace('portrait.webp', 'icon.webp'),
      source: 'Prydwen',
      importedAt: new Date().toISOString(),
      originalWidth: original.width,
      originalHeight: original.height,
      width: output.width,
      height: output.height,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      rightsReview: 'development-only-unreviewed',
      publicDistributionApproved: false,
      version: 1,
      crop: null,
    };
    const index = manifest.findIndex(
      (a) => a.cardId === asset.cardId && a.assetType === 'portrait',
    );
    if (index === -1) manifest.push(entry);
    else manifest[index] = entry;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    await writeClientIndex(root, manifest);
    console.log(
      `${asset.cardId}: imported ${output.width}x${output.height} (${bytes.length} original bytes)`,
    );
  } catch (error) {
    failures++;
    console.error(`${asset.cardId}: ${error.message}`);
  }
}
if (failures) process.exitCode = 1;
