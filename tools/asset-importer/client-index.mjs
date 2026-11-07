import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export async function writeClientIndex(root, manifest, catalog) {
  const index = manifest
    .filter((a) => a.assetType === 'portrait')
    .map((a) => ({ characterId: a.characterId, universeId: a.universeId, localPath: a.localPath }))
    .sort((a, b) =>
      `${a.universeId}:${a.characterId}`.localeCompare(`${b.universeId}:${b.characterId}`),
    );
  await writeFile(
    resolve(root, 'data/assets/card-artwork.json'),
    JSON.stringify(index, null, 2) + '\n',
  );
  if (catalog)
    await writeFile(
      resolve(root, 'data/characters/gallery.json'),
      JSON.stringify(
        catalog.map(({ id, name, universeId, sourcePage, assets }) => ({
          id,
          name,
          universeId,
          sourcePage,
          assets,
        })),
        null,
        2,
      ) + '\n',
    );
}
