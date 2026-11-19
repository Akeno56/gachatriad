'use client';

import { useRef } from 'react';
import type { MatchView } from '@gacha-triad/shared/platform';
import { LocaleView, NoTranslate } from './i18n';
import { Card } from './card';
import { Avatar } from './avatar';
import { Button, GameDialog } from './ui';
import { matchModeNames } from '../lib/rules';

export function SpectatorResult({
  match,
  onClose,
  onReturn,
}: {
  match: MatchView;
  onClose: () => void;
  onReturn: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const summary = match.spectatorResult;
  const rules = [
    match.rules.allOpen ? 'All Open' : match.rules.threeOpen ? 'Three Open' : 'Closed',
    ...(match.rules.same ? ['Same'] : []),
    ...(match.rules.plus ? ['Plus'] : []),
    ...(match.rules.combo ? ['Combo'] : []),
    ...(match.rules.elemental ? ['Elemental'] : []),
    ...(match.rules.random ? ['Random'] : []),
    ...(match.trade.rule === 'one' ? ['Trade One'] : []),
  ];
  return (
    <LocaleView>
      <GameDialog
        open
        onClose={onClose}
        labelledBy="spectator-result-title"
        initialFocus={heading}
        className="spectator-summary"
        closeLabel="Close match details"
      >
        <header className="spectator-summary-heading">
          <div className="spectator-heading-row">
            <h2 id="spectator-result-title" ref={heading} tabIndex={-1}>
              Match complete
            </h2>
            <div className="eyebrow">SPECTATOR RESULT · {matchModeNames[match.mode]}</div>
          </div>
          <p className="spectator-duel-names">
            <NoTranslate>{match.names[0]}</NoTranslate>
            <span> vs </span>
            <NoTranslate>{match.names[1]}</NoTranslate>
          </p>
          <div className="spectator-outcome-line">
            <p className="spectator-winner">
              {match.winner === 'draw' ? (
                'Draw'
              ) : (
                <>
                  <NoTranslate>{match.names[match.winner ?? 0]}</NoTranslate>{' '}
                  <span>won the match</span>
                </>
              )}
            </p>
            <p className="spectator-final-score">
              <span>{match.game?.history.length === 9 ? 'Final score' : 'Score at the end'}</span>{' '}
              <strong>
                {match.score[0]} — {match.score[1]}
              </strong>
            </p>
            {match.endReason && <p className="spectator-end-reason">{match.endReason}</p>}
          </div>
          <div className="spectator-rule-line">
            <div className="rule-badges" aria-label="Match rules">
              {rules.map((rule) => (
                <span key={rule}>{rule}</span>
              ))}
            </div>
            {summary && ['ranked', 'draft', 'shared-draft'].includes(match.mode) && (
              <small>
                Season {summary.season} · {matchModeNames[match.mode]}
              </small>
            )}
          </div>
        </header>
        <div className="spectator-starting-decks">
          {([0, 1] as const).map((seat) => {
            const rating = summary?.ratings[seat];
            return (
              <section
                key={seat}
                className={`spectator-starting-deck ${match.winner === seat ? 'winning-deck' : ''}`}
                aria-label={`${match.names[seat]} starting deck`}
              >
                <div className="spectator-deck-heading">
                  <Avatar
                    frameId={match.players[seat].frameId}
                    card={match.players[seat].avatar}
                    name={match.names[seat]}
                  />
                  <div>
                    <h3>
                      <NoTranslate>{match.names[seat]}</NoTranslate>
                    </h3>
                    <small>Starting deck</small>
                  </div>
                  <div className="spectator-rating">
                    {rating ? (
                      <>
                        <strong
                          className={rating.delta < 0 ? 'rating-loss' : 'rating-gain'}
                        >{`${rating.delta > 0 ? '+' : ''}${rating.delta} Elo`}</strong>
                        <small>
                          {rating.before} → {rating.after}
                        </small>
                      </>
                    ) : (
                      <span>{summary ? 'No Elo change.' : 'Elo details unavailable.'}</span>
                    )}
                  </div>
                </div>
                {summary?.decks[seat].length ? (
                  <div className="spectator-deck-cards">
                    {summary.decks[seat].map((card) => (
                      <Card
                        key={card.id}
                        card={card}
                        owner={seat}
                        showElement={match.rules.elemental}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="spectator-deck-unavailable">
                    {summary
                      ? 'No hand was locked before this match ended.'
                      : 'Starting deck details unavailable.'}
                  </p>
                )}
              </section>
            );
          })}
        </div>
        <footer className="spectator-summary-actions">
          <Button variant="primary" onClick={onReturn}>
            Back to lobbies
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Review board
          </Button>
        </footer>
      </GameDialog>
    </LocaleView>
  );
}
