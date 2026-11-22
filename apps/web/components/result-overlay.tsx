'use client';
import { useRef } from 'react';
import Link from 'next/link';
import { isRatedMode, type MatchView } from '@gacha-triad/shared/platform';
import { LocaleView, NoTranslate } from './i18n';
import { Card } from './card';
import { Avatar } from './avatar';
import { Button, GameDialog, HelpTip } from './ui';
import { matchHighlights } from '../lib/match-highlights';
import { matchModeNames } from '../lib/rules';

export function ResultOverlay({
  match,
  busy,
  requeueing,
  offline,
  onClose,
  onClaim,
  onPlayAgain,
  onQueueAgain,
  onReturn,
  onRematch,
  onCancelRematch,
  error,
}: {
  match: MatchView;
  busy: boolean;
  requeueing: boolean;
  offline: boolean;
  onClose: () => void;
  onClaim: (id: string) => void;
  onPlayAgain: () => void;
  onQueueAgain: () => void;
  onReturn: () => void;
  onRematch: () => void;
  onCancelRematch: () => void;
  error?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const result =
    match.winner === 'draw' ? 'Draw' : match.winner === match.seat ? 'Victory' : 'Defeat';
  const other = match.seat === 0 ? 1 : 0;
  const rated = match.ratedResult;
  const delta = rated?.delta;
  const highlights = matchHighlights(match);
  const queueable = match.mode === 'casual' || match.mode === 'roulette' || isRatedMode(match.mode);
  const randomRematch = match.mode === 'ranked-random';
  const rematchPending = match.rematch?.requestedBy === match.players[match.seat].id;
  const rematchButton = match.mode !== 'solo' && match.mode !== 'correspondence' && (
    <Button
      variant={queueable ? 'ghost' : 'primary'}
      disabled={
        busy ||
        offline ||
        match.trade.pending ||
        !!match.rematch?.unavailableReason ||
        rematchPending
      }
      onClick={onRematch}
      title={match.rematch?.unavailableReason ?? undefined}
    >
      {rematchPending
        ? 'Rematch requested'
        : match.rematch?.requestedBy
          ? 'Accept rematch'
          : randomRematch
            ? 'Rematch (no Elo)'
            : 'Rematch'}
    </Button>
  );
  return (
    <LocaleView>
      <GameDialog
        open
        onClose={onClose}
        initialFocus={heading}
        labelledBy="result-title"
        closeLabel="Close results"
        dismissible={!busy}
        className={`result-panel result-overlay result-v15 result-${result.toLowerCase()} ${result === 'Victory' ? 'result-win' : ''}`}
      >
        <div className="result-summary menu-scrollbar">
          <header className="result-hero">
            <div className="result-crest" aria-hidden="true">
              {result === 'Victory' ? '✦' : result === 'Draw' ? '＝' : '◇'}
            </div>
            <div className="eyebrow">
              DUEL RESULT <span>·</span> {matchModeNames[match.mode]}
            </div>
            <h2 id="result-title" ref={heading} tabIndex={-1}>
              {result}
            </h2>
            {match.game && (
              <div className="result-duel">
                <div className="result-player">
                  <Avatar
                    frameId={match.players[match.seat].frameId}
                    card={match.players[match.seat].avatar}
                    name={match.names[match.seat]}
                  />
                  <span>
                    <NoTranslate>{match.names[match.seat]}</NoTranslate>
                  </span>
                  <small>You</small>
                </div>
                <div>
                  <small>
                    {match.game.history.length === 9 ? 'Final score' : 'Score at the end'}
                  </small>
                  <p className="result-score">
                    {match.score[match.seat]} <span>—</span> {match.score[other]}
                  </p>
                </div>
                <div className="result-player">
                  <Avatar
                    frameId={match.players[other].frameId}
                    card={match.players[other].avatar}
                    name={match.names[other]}
                  />
                  <span>
                    <NoTranslate>{match.names[other]}</NoTranslate>
                  </span>
                  <small>Opponent</small>
                </div>
              </div>
            )}
            {match.endReason && <p className="result-end-reason">{match.endReason}</p>}
          </header>
          <div className="result-rewards">
            <section className="result-reward-card" aria-label="Match reward">
              <span className="result-section-label">Match reward</span>
              <p className="prism-reward">
                {match.prismReward > 0
                  ? `+${match.prismReward} Stellar Prisms`
                  : 'No Stellar Prisms awarded.'}
              </p>
            </section>
            <section className="result-reward-card rated-result" aria-label="Season result">
              <span className="result-section-label">
                Rating{' '}
                <HelpTip label="About rating changes">
                  Only eligible matches between human players change Elo. Bot practice never changes
                  your rating.
                </HelpTip>
              </span>
              {rated && delta != null ? (
                <>
                  <strong className={delta != null && delta < 0 ? 'rating-loss' : 'rating-gain'}>
                    {delta == null ? rated.rating : `${delta > 0 ? '+' : ''}${delta} Elo`}
                  </strong>
                  <p className="result-rating-path">
                    {delta != null ? `${rated.rating - delta} → ${rated.rating}` : rated.rating}
                  </p>
                  <small>
                    Season {rated.season} · {matchModeNames[match.mode]}
                  </small>
                  <small>
                    {`${rated.wins}W ${rated.losses}L`}
                    {rated.draws > 0 ? ` · ${rated.draws} draws` : ''}
                  </small>
                </>
              ) : (
                <>
                  <strong>
                    {match.mode === 'solo'
                      ? 'Practice match'
                      : rated
                        ? 'Unrated match'
                        : matchModeNames[match.mode]}
                  </strong>
                  <p>No Elo change.</p>
                </>
              )}
            </section>
          </div>
          {match.game && (
            <section className="result-highlights" aria-label="Your match highlights">
              <div>
                <strong>{highlights.captures}</strong>
                <span>Captures</span>
              </div>
              <div>
                <strong>{highlights.specialTurns}</strong>
                <span>Same / Plus turns</span>
              </div>
              <div>
                <strong>{highlights.bestCombo}</strong>
                <span>Best Combo</span>
              </div>
            </section>
          )}
          <section
            className={`result-settlement ${match.trade.rule === 'one' ? 'has-trade' : ''}`}
            aria-label="Match settlement"
          >
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
          {match.mode !== 'correspondence' && match.rematch?.unavailableReason && (
            <p className="rematch-status" role="status">
              {match.rematch.unavailableReason}
            </p>
          )}
          {match.rematch?.requestedBy && !match.rematch.unavailableReason && (
            <p className="rematch-status" role="status">
              {rematchPending ? (
                <>
                  Waiting for your opponent · expires after five minutes.{' '}
                  <Button variant="ghost" onClick={onCancelRematch} disabled={busy || offline}>
                    Cancel rematch
                  </Button>
                </>
              ) : randomRematch ? (
                'Practice rematch requested. Both decks are drawn again.'
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
          {offline && (
            <p className="rematch-status" role="status">
              You’re offline.
            </p>
          )}
        </div>
        <footer className="duel-result-footer">
          <div className="result-actions">
            {match.mode === 'solo' && (
              <Button variant="primary" busy={busy} disabled={offline} onClick={onPlayAgain}>
                Play again ▶
              </Button>
            )}
            {queueable && (
              <Button
                variant="primary"
                busy={busy}
                disabled={match.trade.pending || offline}
                onClick={onQueueAgain}
              >
                {requeueing ? 'Joining queue…' : 'Queue again'}
              </Button>
            )}
            {!queueable && rematchButton}
            <Link className="outline-button" href={`/replays?match=${match.id}`}>
              Watch replay
            </Link>
            <Button
              disabled={busy || match.trade.pending || (offline && match.mode !== 'correspondence')}
              onClick={onReturn}
            >
              Back to main menu
            </Button>
          </div>
          <div className="result-secondary-actions">
            {queueable && rematchButton}
            <Button variant="ghost" className="result-review" disabled={busy} onClick={onClose}>
              Review board
            </Button>
          </div>
        </footer>
      </GameDialog>
    </LocaleView>
  );
}
