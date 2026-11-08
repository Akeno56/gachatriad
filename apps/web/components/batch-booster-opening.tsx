'use client';
import { useEffect, useRef, useState } from 'react';
import type { BoosterView } from '@gacha-triad/shared/platform';
import { Card } from './card';
import { useSession } from './session';
import { useGameAudio } from './game-shell';
import { api } from '../lib/platform';
export function BatchBoosterOpening({
  packs,
  onClose,
}: {
  packs: BoosterView[];
  onClose: () => void;
}) {
  const { refresh } = useSession(),
    play = useGameAudio();
  const dialog = useRef<HTMLDialogElement>(null);
  const [results, setResults] = useState<BoosterView[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const cards = results
    ?.flatMap((p) => p.cards)
    .reduce<{ card: BoosterView['cards'][number]; count: number; fresh: boolean }[]>(
      (rows, card) => {
        const existing = rows.find((r) => r.card.id === card.id);
        if (existing) existing.count++;
        else
          rows.push({ card, count: 1, fresh: results.some((p) => p.newCardIds.includes(card.id)) });
        return rows;
      },
      [],
    )
    .sort(
      (a, b) =>
        b.card.rarity - a.card.rarity ||
        Number(!!b.card.finish) - Number(!!a.card.finish) ||
        a.card.name.localeCompare(b.card.name),
    );
  return (
    <dialog
      ref={dialog}
      className="game-dialog menu-window pack-opening batch-opening"
      aria-labelledby="batch-opening-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header className="pack-opening-header">
        <div>
          <h2 id="batch-opening-title">
            {results ? `${results.length * 5} cards added` : `Open ${packs.length} boosters`}
          </h2>
          <span>
            {results
              ? 'Saved to your Collection'
              : 'Five cards per pack · one guaranteed 3★ or higher per pack'}
          </span>
        </div>
        <button className="text-button" disabled={busy} onClick={onClose}>
          Close ×
        </button>
      </header>
      <p className="error-message" role="alert">
        {error}
      </p>
      {!results ? (
        <div className="pack-ceremony">
          <div className="pack-aura" aria-hidden="true" />
          <div className="batch-pack-emblem">
            <span className="booster-pack-art" aria-hidden="true">
              <span>GT</span>
              <b>BOOSTER</b>
              <i>★★★★★</i>
            </span>
            <strong>×{packs.length}</strong>
          </div>
          <button
            className="primary-button"
            disabled={busy}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              setError('');
              try {
                const result = await api<BoosterView[]>('/boosters/open-batch', {
                  packIds: packs.map((p) => p.id),
                });
                setResults(result);
                play('victory');
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Opening…' : `Open ${packs.length} boosters`}
          </button>
        </div>
      ) : (
        <>
          <div className="batch-card-grid">
            {cards?.map(({ card, count, fresh }, i) => (
              <article key={card.id} style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}>
                <Card card={card} showElement />
                <p>
                  {fresh && <b>NEW · </b>}
                  {count > 1 ? `×${count} copies` : '1 copy'}
                </p>
              </article>
            ))}
          </div>
          <button className="primary-button" onClick={onClose}>
            Keep cards
          </button>
        </>
      )}
    </dialog>
  );
}
