'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { MatchView } from '@gacha-triad/shared/platform';
import { Card } from './card';
export function ResultOverlay({
  match,
  busy,
  onClose,
  onClaim,
  onPlayAgain,
}: {
  match: MatchView;
  busy: boolean;
  onClose: () => void;
  onClaim: (id: string) => void;
  onPlayAgain: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    result = match.winner === 'draw' ? 'Draw' : match.winner === match.seat ? 'Victory' : 'Defeat';
  useEffect(() => {
    ref.current?.showModal();
    heading.current?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      className={`game-dialog result-panel result-overlay menu-window ${result === 'Victory' ? 'result-win' : ''}`}
      aria-labelledby="result-title"
    >
      <div className="eyebrow">DUEL RESULT</div>
      <h2 id="result-title" ref={heading} tabIndex={-1}>
        {result}
      </h2>
      {match.game && (
        <p className="result-score">
          {match.score[match.seat]} <span>—</span> {match.score[match.seat === 0 ? 1 : 0]}
        </p>
      )}
      {match.endReason && <p>{match.endReason}</p>}
      <section className="result-settlement" aria-label="Match settlement">
        <p className="prism-reward">
          {match.prismReward > 0
            ? `+${match.prismReward} Stellar Prisms`
            : 'No Stellar Prisms awarded.'}
        </p>
        <h3>{match.trade.rule === 'one' ? 'TRADE ONE' : 'NO CARD TRADE'}</h3>
        {match.trade.pending ? (
          <>
            <p>
              {match.trade.canClaim
                ? 'Choose one card from your opponent’s five-card deck.'
                : 'The winner is choosing one of your cards.'}{' '}
              Automatic selection after two minutes.
            </p>
            {match.trade.canClaim && (
              <div className="trade-choices">
                {match.trade.choices.map((card) => (
                  <button
                    key={card.id}
                    disabled={busy}
                    aria-label={`Claim ${card.name}`}
                    onClick={() => onClaim(card.id)}
                  >
                    <Card card={card} showElement={!!match.rules.elemental} />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : match.trade.claimedCard ? (
          <p>{match.trade.claimedCard.name} transferred to the winner.</p>
        ) : match.trade.rule === 'one' && match.winner === 'draw' ? (
          <p>A draw trades no cards.</p>
        ) : (
          <p>Your collection stays with you.</p>
        )}
      </section>
      <div className="result-actions">
        {match.mode === 'solo' && (
          <button className="primary-button" disabled={busy} onClick={onPlayAgain}>
            Play again ▶
          </button>
        )}
        <Link className="outline-button" href="/lobbies">
          Lobby list
        </Link>
        <button className="text-button" onClick={onClose}>
          Review board
        </button>
      </div>
    </dialog>
  );
}
