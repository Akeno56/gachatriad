'use client';
import { LocaleView, NoTranslate } from './i18n';

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
  onRematch,
  onCancelRematch,
  error,
}: {
  match: MatchView;
  busy: boolean;
  onClose: () => void;
  onClaim: (id: string) => void;
  onPlayAgain: () => void;
  onRematch: () => void;
  onCancelRematch: () => void;
  error?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    result = match.winner === 'draw' ? 'Draw' : match.winner === match.seat ? 'Victory' : 'Defeat';
  useEffect(() => {
    ref.current?.showModal();
    heading.current?.focus();
  }, []);
  return (
    <LocaleView>
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
        {match.ratedResult && (
          <section className="rated-result" aria-label="Season result">
            <p>
              Rating: <strong>{match.ratedResult.rating}</strong>
              {match.ratedResult.delta !== null && (
                <span className={match.ratedResult.delta < 0 ? 'rating-loss' : 'rating-gain'}>
                  {' '}
                  ({match.ratedResult.delta > 0 ? '+' : ''}
                  {match.ratedResult.delta})
                </span>
              )}{' '}
              <strong>{`${match.ratedResult.wins}W ${match.ratedResult.losses}L`}</strong>
              {match.ratedResult.draws > 0 && (
                <small> · {`${match.ratedResult.draws} draws`}</small>
              )}
            </p>
            <small>
              Season {match.ratedResult.season} · {match.mode === 'draft' ? 'Draft' : 'Ranked'}
            </small>
          </section>
        )}
        {(match.mode === 'ranked' || match.mode === 'draft') && !match.ratingApplies && (
          <p>No Elo change.</p>
        )}
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
            <p>
              <NoTranslate>{match.trade.claimedCard.name}</NoTranslate> transferred to the winner.
            </p>
          ) : match.trade.rule === 'one' && match.winner === 'draw' ? (
            <p>A draw trades no cards.</p>
          ) : null}
        </section>
        <div className="result-actions">
          {match.mode === 'solo' && (
            <button className="primary-button" disabled={busy} onClick={onPlayAgain}>
              Play again ▶
            </button>
          )}
          {match.mode !== 'solo' && (
            <button
              className="primary-button"
              disabled={
                busy ||
                match.trade.pending ||
                !!match.rematch?.unavailableReason ||
                match.rematch?.requestedBy === match.players[match.seat].id
              }
              onClick={onRematch}
              title={match.rematch?.unavailableReason ?? undefined}
            >
              {match.rematch?.requestedBy === match.players[match.seat].id
                ? 'Rematch requested'
                : match.rematch?.requestedBy
                  ? 'Accept rematch'
                  : 'Rematch'}
            </button>
          )}
          <Link className="outline-button" href="/lobbies">
            Lobby list
          </Link>
          <button className="text-button" onClick={onClose}>
            Review board
          </button>
        </div>
        {match.rematch?.unavailableReason && (
          <p className="rematch-status" role="status">
            {match.rematch.unavailableReason}
          </p>
        )}
        {match.rematch?.requestedBy && !match.rematch?.unavailableReason && (
          <p className="rematch-status" role="status">
            {match.rematch.requestedBy === match.players[match.seat].id ? (
              <>
                Waiting for your opponent · expires after five minutes.{' '}
                <button className="text-button" onClick={onCancelRematch} disabled={busy}>
                  Cancel rematch
                </button>
              </>
            ) : (
              'Your opponent requested a rematch with the same rules.'
            )}
          </p>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </dialog>
    </LocaleView>
  );
}
