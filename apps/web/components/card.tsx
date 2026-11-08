'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  displayValue,
  type Card as CardData,
  type Player,
  type CaptureReason,
} from '@gacha-triad/engine';
import { UNIVERSES } from '@gacha-triad/shared';
import manifest from '../../../data/assets/card-artwork.json';
import { ElementIcon } from './element-icon';
import { assetPath } from '../lib/connection';

export function CardArt({ card }: { card: CardData }) {
  const [failed, setFailed] = useState(false);
  const asset = manifest.find(
    (a) => a.characterId === card.characterId && a.universeId === card.universeId,
  );
  return (
    <div className="card-art" aria-hidden="true">
      {asset && !failed ? (
        <img
          src={assetPath(asset.localPath)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="missing-art">
          <span>{UNIVERSES.find((u) => u.id === card.universeId)?.sigil ?? '?'}</span>
          <small>NO ART</small>
        </div>
      )}
    </div>
  );
}
export function Card({
  card,
  owner,
  hidden = false,
  compact = false,
  captured = false,
  captureReason,
  captureOrder = 0,
  showElement = false,
  modifier = 0,
}: {
  card?: CardData;
  owner?: Player;
  hidden?: boolean;
  compact?: boolean;
  captured?: boolean;
  captureReason?: CaptureReason;
  captureOrder?: number;
  showElement?: boolean;
  modifier?: number;
}) {
  if (!card || hidden)
    return (
      <div className={`playing-card card-back ${compact ? 'compact' : ''}`}>
        <div className="back-emblem" aria-hidden="true">
          <img src={assetPath('/assets/ui/triad-logo.webp')} alt="" draggable={false} />
        </div>
        <small>GACHA TRIAD</small>
      </div>
    );
  const universe = UNIVERSES.find((u) => u.id === card.universeId);
  return (
    <div
      className={`playing-card rarity-${card.rarity} ${card.finish === 'holo' ? 'holo-card' : ''} ${compact ? 'compact' : ''} ${owner === 0 ? 'owned-player' : owner === 1 ? 'owned-cpu' : ''} ${captured ? 'just-captured' : ''}`}
      style={
        {
          '--card-color': universe?.color ?? '#becae0',
          '--capture-delay': `${captureOrder * 140}ms`,
        } as CSSProperties
      }
    >
      <CardArt card={card} />
      {card.finish === 'holo' && (
        <>
          <span className="holo-foil" aria-hidden="true" />
          <span className="sr-only">
            Holographic · +1{' '}
            {card.holoBonusSide !== undefined
              ? ['Top', 'Right', 'Bottom', 'Left'][card.holoBonusSide]
              : 'stat'}
          </span>
        </>
      )}
      {card.rarity === 5 && (
        <span className="rarity-crown" aria-label="Five-star prestige frame">
          <svg viewBox="0 0 32 20" aria-hidden="true">
            <path d="M2 4 9 10 16 1 23 10 30 4 26 18H6Z" />
          </svg>
        </span>
      )}
      <span className="card-set">{universe?.shortName}</span>
      {showElement && card.element && (
        <ElementIcon element={card.element} className="card-element" />
      )}
      {modifier !== 0 && (
        <span
          className={`element-modifier ${modifier > 0 ? 'element-bonus' : 'element-penalty'}`}
          aria-label={`Elemental ${modifier > 0 ? 'bonus +1' : 'penalty −1'} to all sides`}
        >
          {modifier > 0 ? '+1' : '−1'}
        </span>
      )}
      <div
        className="card-values"
        aria-label={`Top ${displayValue(card.stats[0] + modifier)}, right ${displayValue(card.stats[1] + modifier)}, bottom ${displayValue(card.stats[2] + modifier)}, left ${displayValue(card.stats[3] + modifier)}`}
        title={
          modifier
            ? `Printed values: ${card.stats.map(displayValue).join(' / ')}. Same and Plus use printed values.`
            : undefined
        }
      >
        {card.stats.map((v, i) => (
          <span
            className={`value value-${i} ${card.holoBonusSide === i ? 'holo-bonus-value' : ''}`}
            key={i}
          >
            {displayValue(v + modifier)}
          </span>
        ))}
      </div>
      <div className="card-caption">
        <span className="card-stars" aria-label={`${card.rarity} stars`}>
          {'★'.repeat(card.rarity)}
        </span>
        <FittedCardName name={card.name} />
      </div>
      {owner !== undefined && (
        <span className="ownership-mark" aria-hidden="true">
          {owner === 0 ? 'YOU' : 'RIVAL'}
        </span>
      )}
      {captured && captureReason && (
        <span className={`capture-badge reason-${captureReason}`}>
          {captureReason === 'standard' ? 'FLIP' : captureReason.toUpperCase()}
        </span>
      )}
    </div>
  );
}
function FittedCardName({ name }: { name: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let active = true,
      lastWidth = -1;
    const fit = () => {
      if (!active || !el.clientWidth) return;
      el.style.fontSize = '';
      const base = parseFloat(getComputedStyle(el).fontSize),
        ratio = Math.min(1, el.clientWidth / Math.max(1, el.scrollWidth));
      if (ratio < 1)
        el.style.fontSize = `${Math.max(base * 0.48, Math.floor(base * ratio * 10) / 10 - 0.2)}px`;
    };
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      if (width !== lastWidth) {
        lastWidth = width;
        fit();
      }
    });
    observer.observe(el.parentElement!);
    fit();
    void document.fonts.ready.then(fit);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [name]);
  return (
    <strong ref={ref} title={name}>
      {name}
    </strong>
  );
}
