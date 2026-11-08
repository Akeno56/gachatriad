'use client';
import { useEffect, useRef } from 'react';
import type { Card as CardData } from '@gacha-triad/engine';
import { universeName } from '@gacha-triad/shared';
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
    <dialog ref={ref} className="game-dialog card-detail" onCancel={onClose}>
      <button className="dialog-close" aria-label="Close card detail" onClick={onClose}>
        ×
      </button>
      {card && (
        <>
          <Card card={card} showElement modifier={modifier} />
          <h2>{card.name}</h2>
          <p>
            {universeName(card.universeId)} · {card.rarity} stars
          </p>
          <p>
            {card.element || 'No elemental affinity'} · Total{' '}
            {card.stats.reduce((a, b) => a + b, 0) + modifier * 4}
          </p>
          {modifier !== 0 && (
            <small>
              Elemental {modifier > 0 ? '+1' : '−1'} applied. Printed values{' '}
              {card.stats.join(' / ')} still apply to Same and Plus.
            </small>
          )}
        </>
      )}
    </dialog>
  );
}
