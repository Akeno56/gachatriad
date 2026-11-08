import type { Card } from '@gacha-triad/engine';
import manifest from '../../../data/assets/card-artwork.json';
import { assetPath } from './connection';
const paths = new Map(manifest.map((a) => [`${a.universeId}:${a.characterId}`, a.localPath]));
export function artworkPath(card: Card) {
  const path = paths.get(`${card.universeId}:${card.characterId}`);
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
    img.onload = () => {
      void img
        .decode()
        .catch(() => {})
        .then(resolve);
    };
    img.onerror = () => {
      loaded.delete(path);
      resolve();
    };
    img.src = path;
  });
  loaded.set(path, pending);
  return pending;
}
