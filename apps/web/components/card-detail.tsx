'use client';
import { LocaleView, NoTranslate } from './i18n';

import { useEffect, useRef } from 'react';
import type { Card as CardData } from '@gacha-triad/engine';
import { universeName, SIDE_NAMES } from '@gacha-triad/shared';
import { Card } from './card';
export function CardDetail({
  card,
  onClose,
  modifier = 0,
}: {
  card: CardData | null;
  onClose: () => void;
  modifier?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (card) ref.current?.showModal();
    else ref.current?.close();
  }, [card]);
  return (
    <LocaleView>
      <dialog
        ref={ref}
        className="game-dialog card-detail"
        aria-labelledby="card-detail-name"
        onCancel={onClose}
      >
        <button className="dialog-close" aria-label="Close card detail" onClick={onClose}>
          ×
        </button>
        {card && (
          <div className="card-detail-layout">
            <div className="card-detail-art">
              <Card card={card} showElement modifier={modifier} />
            </div>
            <div className="card-detail-copy">
              <h2 id="card-detail-name">
                <NoTranslate>{card.name}</NoTranslate>
              </h2>
              <p className="card-detail-universe">{universeName(card.universeId)}</p>
              <dl className="card-detail-facts">
                <div>
                  <dt>Rarity</dt>
                  <dd>{card.rarity}★</dd>
                </div>
                <div>
                  <dt>Total stats</dt>
                  <dd>{card.stats.reduce((a, b) => a + b, 0) + modifier * 4}</dd>
                </div>
                <div>
                  <dt>Element</dt>
                  <dd>{card.element || 'No elemental affinity'}</dd>
                </div>
              </dl>
              {card.holoBonusSide !== undefined && (
                <p>Holo bonus: +1 {SIDE_NAMES[card.holoBonusSide]} · fixed when acquired</p>
              )}
              {modifier !== 0 && (
                <small>
                  Elemental {modifier > 0 ? '+1' : '−1'} applied. Printed values{' '}
                  {card.stats.join(' / ')}. Same and Plus use the adjusted values shown above.
                </small>
              )}
            </div>
          </div>
        )}
      </dialog>
    </LocaleView>
  );
}
