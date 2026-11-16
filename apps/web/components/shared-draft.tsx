'use client';
import { useState } from 'react';
import type { MatchView } from '@gacha-triad/shared/platform';
import { Card } from './card';
import { LocaleView, NoTranslate } from './i18n';
export function SharedDraft({
  match,
  busy,
  onPick,
  onInspect,
  now,
}: {
  match: MatchView;
  busy: boolean;
  onPick: (id: string) => void;
  onInspect: (card: MatchView['draftPool'][number]) => void;
  now: number;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState('opening');
  const draft = match.sharedDraft!;
  const own = draft.picks[match.seat],
    other = draft.picks[1 - match.seat];
  const available = new Set(draft.available),
    legal = new Set(draft.legal);
  const card = match.draftPool.find((card) => card.id === selected);
  const yourTurn = draft.turn === match.seat;
  const total = (card: MatchView['draftPool'][number]) => card.stats.reduce((sum, n) => sum + n, 0);
  const ordered = [...match.draftPool].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id);
    if (sort === 'stats')
      return total(b) - total(a) || b.rarity - a.rarity || a.name.localeCompare(b.name, 'en');
    if (sort === 'rarity')
      return b.rarity - a.rarity || total(b) - total(a) || a.name.localeCompare(b.name, 'en');
    return 0;
  });
  return (
    <LocaleView>
      <div className="shared-draft-selection">
        <header className="menu-window shared-draft-heading">
          <div className="shared-rule-line">
            <h1 className="sr-only">Pick your hand</h1>
            <small>One 5★ and one 4★, or two 4★ without a 5★.</small>
            <details className="shared-draft-help">
              <summary>Draft rules</summary>
              <div>
                <p>
                  Four boosters form one shared pool. Take turns picking five cards each. Picks are
                  public; battles use All Open. Temporary cards never enter your collection.
                </p>
                <p>
                  Each pick allows 45 seconds. A missed pick is chosen automatically; two
                  consecutive missed picks forfeit. The player who picks second starts the battle.
                </p>
              </div>
            </details>
          </div>
          <div className="shared-pool-controls">
            <span>{`${available.size} cards available`}</span>
            <label>
              <span>Order cards</span>
              <select
                aria-label="Order draft cards"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="opening">Booster order</option>
                <option value="rarity">Rarity ↓ · Total stats ↓</option>
                <option value="stats">Total stats ↓ · Rarity ↓</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
          </div>
          <div className={`shared-pick-status ${yourTurn ? 'is-your-turn' : ''}`} role="status">
            <strong>
              {draft.turn === null
                ? 'Waiting for both players to finish opening…'
                : yourTurn
                  ? 'Your pick'
                  : 'Opponent is picking…'}
            </strong>
            {draft.turn !== null && (
              <span>{Math.max(0, Math.ceil(((match.deadline ?? now) - now) / 1000))}s</span>
            )}
          </div>
        </header>
        <div className="shared-hands">
          {([match.seat, 1 - match.seat] as const).map((seat) => (
            <section
              key={seat}
              aria-label={seat === match.seat ? 'Your draft picks' : 'Opponent draft picks'}
            >
              <h2>
                {seat === match.seat ? 'Your picks' : 'Opponent picks'}{' '}
                <small>{draft.picks[seat].length}/5</small>
              </h2>
              <div>
                {Array.from({ length: 5 }, (_, index) => {
                  const card = draft.picks[seat][index];
                  return (
                    <div className="shared-hand-slot" key={index}>
                      {card ? (
                        <>
                          <Card card={card} />
                          <NoTranslate>{card.name}</NoTranslate>
                        </>
                      ) : (
                        <span>?</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <div className="shared-pool draft-grid">
          {ordered.map((card) => {
            const taken = !available.has(card.id),
              canPick = legal.has(card.id);
            return (
              <button
                key={card.id}
                data-card-id={card.id}
                data-card-name={card.name}
                data-rarity={card.rarity}
                data-total={total(card)}
                className={`draft-card ${taken ? 'is-taken' : ''} ${selected === card.id && !taken ? 'is-selected' : ''}`}
                disabled={busy || taken || !canPick || !yourTurn}
                aria-label={`Pick ${card.name}`}
                title={card.name}
                aria-pressed={selected === card.id && !taken}
                onClick={() => setSelected(card.id)}
              >
                <Card card={card} />
                <span className="draft-summary">
                  {taken
                    ? 'Picked'
                    : !canPick
                      ? 'Rarity limit'
                      : `${card.rarity}★ · ${card.stats.reduce((s, n) => s + n, 0)} total`}
                </span>
              </button>
            );
          })}
        </div>
        <div className="shared-pick-confirm menu-window">
          <span className="shared-selected-card">
            {card && available.has(card.id) ? (
              <>
                <NoTranslate>{card.name}</NoTranslate>
                <button className="text-button" disabled={busy} onClick={() => onInspect(card)}>
                  Inspect selected card
                </button>
              </>
            ) : yourTurn ? (
              'Select an available card.'
            ) : (
              'Watch your opponent’s picks while you plan your next choice.'
            )}
          </span>
          <button
            className="primary-button"
            disabled={busy || !yourTurn || !selected || !legal.has(selected)}
            onClick={() => {
              if (selected) {
                onPick(selected);
                setSelected(null);
              }
            }}
          >
            {busy ? 'Picking…' : 'Confirm pick'}
          </button>
        </div>
      </div>
    </LocaleView>
  );
}
