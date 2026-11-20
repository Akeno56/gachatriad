import type { Card } from '@gacha-triad/engine';
import manifest from '../../../data/assets/card-artwork.json';
import framing from '../../../data/assets/artwork-framing.json';
import { assetPath } from './connection';
const paths = new Map(manifest.map((a) => [`${a.universeId}:${a.characterId}`, a.localPath]));
export function artworkPath(card: Card) {
  const id = `${card.universeId}:${card.characterId}`;
  const path = (framing as Record<string, { localPath: string }>)[id]?.localPath ?? paths.get(id);
  return path ? assetPath(path) : null;
}
const loaded = new Map<string, Promise<void>>();
export function preloadArtwork(card: Card): Promise<void> {
  const path = artworkPath(card);
  if (!path || typeof Image === 'undefined') return Promise.resolve();
  let pending = loaded.get(path);
  if (pending) return pending;
  pending = new Promise<void>((resolve) => {
    const img = new Image();
    img.fetchPriority = 'low';
    const finish = () => {
      clearTimeout(timeout);
      img.onload = null;
      img.onerror = null;
      resolve();
    };
    const fail = () => {
      loaded.delete(path);
      finish();
      img.removeAttribute('src');
    };
    const timeout = setTimeout(fail, 5000);
    img.onload = () => {
      void img
        .decode()
        .catch(() => {})
        .then(finish);
    };
    img.onerror = fail;
    img.src = path;
  });
  loaded.set(path, pending);
  return pending;
}
