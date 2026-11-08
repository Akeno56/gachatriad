import { readFile, writeFile, access } from 'node:fs/promises';
const characters = JSON.parse(await readFile('data/characters/catalog.json', 'utf8'));
const framing = {};
for (const character of characters.filter((c) =>
  ['epic-seven', 'star-savior'].includes(c.universeId),
)) {
  const asset = character.assets.find((a) => a.type === 'listing');
  if (!asset) throw Error(`Missing listing artwork: ${character.id}`);
  await access('apps/web/public' + asset.localPath);
  framing[character.id] = { localPath: asset.localPath, source: 'provider-curated-listing' };
}
await writeFile('data/assets/artwork-framing.json', JSON.stringify(framing, null, 2) + '\n');
console.log(
  `Selected ${Object.keys(framing).length} provider-framed portraits. Full artwork and icons are retained.`,
);
