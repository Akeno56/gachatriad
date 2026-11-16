'use client';
import { useState } from 'react';
import type { MatchView } from '@gacha-triad/shared/platform';
import { Card } from './card';
import { LocaleView, NoTranslate } from './i18n';
export function SharedDraft({
  match,
  busy,
  onPick,
  now,
}: {
  match: MatchView;
  busy: boolean;
  onPick: (id: string) => void;
  now: number;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const draft = match.sharedDraft!;
  const own = draft.picks[match.seat],
    other = draft.picks[1 - match.seat];
  const available = new Set(draft.available),
    legal = new Set(draft.legal);
  const card = match.draftPool.find((card) => card.id === selected);
  const yourTurn = draft.turn === match.seat;
  return (
    <LocaleView>
      <div className="shared-draft-selection">
        <header className="menu-window shared-draft-heading">
          <div>
            <div className="eyebrow">FOUR BOOSTERS · ONE SHARED POOL</div>
            <h1>Pick your hand</h1>
            <p>
              Take turns picking five cards each. A picked card leaves the pool for both players.
            </p>
            <small>
              One 5★ and one 4★, or two 4★ without a 5★. Public picks · All Open · No card loss.
            </small>
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
            <small>{`Your hand ${own.length}/5 · Opponent ${other.length}/5`}</small>
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
          {match.draftPool.map((card) => {
            const taken = !available.has(card.id),
              canPick = legal.has(card.id);
            return (
              <button
                key={card.id}
                className={`draft-card ${taken ? 'is-taken' : ''} ${selected === card.id && !taken ? 'is-selected' : ''}`}
                disabled={busy || taken || !canPick || !yourTurn}
                aria-label={`Pick ${card.name}`}
                aria-pressed={selected === card.id && !taken}
                onClick={() => setSelected(card.id)}
              >
                <Card card={card} />
                <span className="draft-summary">
                  {taken
                    ? 'Picked'
                    : `${card.rarity}★ · ${card.stats.reduce((s, n) => s + n, 0)} total`}
                </span>
              </button>
            );
          })}
        </div>
        <div className="shared-pick-confirm menu-window">
          <span>
            {card && available.has(card.id) ? (
              <NoTranslate>{card.name}</NoTranslate>
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
        <p className="shared-draft-policy">
          Each pick allows 45 seconds. A missed pick is chosen automatically; two consecutive missed
          picks forfeit. The player who picks second starts the battle.
        </p>
      </div>
    </LocaleView>
  );
}
