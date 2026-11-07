'use client';
import { useState } from 'react';
import type { Card } from '@gacha-triad/engine';
import artwork from '../../../data/assets/card-artwork.json';
import { assetPath } from '../lib/connection';
export function Avatar({
  card,
  name,
  className = '',
}: {
  card: Card | null | undefined;
  name: string;
  className?: string;
}) {
  const [portrait, setPortrait] = useState(false),
    [failed, setFailed] = useState(false);
  const asset =
    card &&
    artwork.find((a) => a.characterId === card.characterId && a.universeId === card.universeId);
  return (
    <span className={`player-avatar ${className}`} aria-label={`${name} avatar`}>
      {asset && !failed ? (
        <img
          src={assetPath(
            portrait ? asset.localPath : asset.localPath.replace('/portrait.webp', '/icon.webp'),
          )}
          alt=""
          loading="lazy"
          onError={() => (portrait ? setFailed(true) : setPortrait(true))}
        />
      ) : (
        <span aria-hidden="true">{name.trim().slice(0, 1).toUpperCase() || 'GT'}</span>
      )}
    </span>
  );
}
