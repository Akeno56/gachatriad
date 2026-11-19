'use client';
import { LocaleView } from './i18n';

import { useState } from 'react';
import type { Card } from '@gacha-triad/engine';
import artwork from '../../../data/assets/card-artwork.json';
import { assetPath } from '../lib/connection';
import type { PortraitFrame } from '@gacha-triad/shared/customization';
import { FrameArt, frameClass } from './portrait-frame';
const assets = new Map(artwork.map((a) => [`${a.universeId}:${a.characterId}`, a]));
export function Avatar({
  card,
  name,
  className = '',
  frameId = 'classic',
  decorative = false,
}: {
  card: Card | null | undefined;
  name: string;
  className?: string;
  frameId?: PortraitFrame | null;
  decorative?: boolean;
}) {
  return (
    <LocaleView>
      <span
        className={`player-avatar ${frameClass(frameId)} ${className}`}
        aria-label={decorative ? undefined : `${name} avatar`}
        aria-hidden={decorative || undefined}
      >
        <Portrait key={card?.id ?? name} card={card} name={name} />
        <FrameArt frameId={frameId} />
      </span>
    </LocaleView>
  );
}
function Portrait({ card, name }: { card: Card | null | undefined; name: string }) {
  const [portrait, setPortrait] = useState(false),
    [failed, setFailed] = useState(false);
  const asset = card && assets.get(`${card.universeId}:${card.characterId}`);
  return (
    <LocaleView>
      <>
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
      </>
    </LocaleView>
  );
}
