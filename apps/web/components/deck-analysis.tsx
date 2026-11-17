'use client';
import type { Card } from '@gacha-triad/engine';
import { analyseDeck, SIDE_NAMES, CORNER_NAMES } from '../lib/deck-analysis';
import { LocaleView, NoTranslate } from './i18n';
import { HelpTip } from './ui';

export function DeckAnalysis({
  cards,
  comparison,
}: {
  cards: readonly Card[];
  comparison?: readonly Card[];
}) {
  const analysis = analyseDeck(cards),
    before = comparison ? analyseDeck(comparison) : null;
  return (
    <LocaleView>
      <section className="deck-analysis" aria-labelledby="deck-analysis-title">
        <div className="builder-section-heading">
          <h2 id="deck-analysis-title">Deck outlook</h2>
          <HelpTip label="About deck analysis">
            Printed values, including Holographic bonuses. Elemental board modifiers are not
            applied. This is a planning aid, not a win-rate prediction.
          </HelpTip>
        </div>
        {!cards.length ? (
          <p>Add cards to see your side coverage.</p>
        ) : (
          <>
            <p className="deck-outlook-summary">
              {analysis.balanced ? (
                'Your average side values are balanced.'
              ) : (
                <>
                  <span>Strongest side:</span> <b>{analysis.strongest.name}</b>
                  <span> · Lowest average:</span> <b>{analysis.weakest.name}</b>
                </>
              )}
            </p>
            <div className="deck-side-coverage">
              {analysis.sides.map((side, i) => (
                <div className="deck-side-row" key={side.name}>
                  <strong>{side.name}</strong>
                  <span className="deck-side-bar" aria-hidden="true">
                    <i style={{ width: `${side.average * 10}%` }} />
                  </span>
                  <span className="side-average">
                    {side.average.toFixed(1)}
                    <small> / A</small>
                  </span>
                  {before && (
                    <small
                      className={`side-change ${side.average < before.sides[i].average ? 'negative' : ''}`}
                    >{`${side.average - before.sides[i].average > 0 ? '+' : ''}${(side.average - before.sides[i].average).toFixed(1)}`}</small>
                  )}
                </div>
              ))}
            </div>
            <div className="deck-value-counts">
              <span>
                <b>{analysis.high}</b>{' '}
                <span>{analysis.high === 1 ? 'high side (7–A)' : 'high sides (7–A)'}</span>
              </span>
              <span>
                <b>{analysis.low}</b>{' '}
                <span>{analysis.low === 1 ? 'low side (1–3)' : 'low sides (1–3)'}</span>
              </span>
            </div>
            <p className="analysis-note">
              Averages describe your hand. Low sides can be protected against the board edge.
            </p>
            <details className="deck-placement-notes">
              <summary>Corner placement ideas</summary>
              <p>
                These corners expose each card’s strongest pair of adjacent sides. Check the
                opponent and active rules before playing.
              </p>
              {cards.map((card) => {
                const suggestion = analysis.corners.find((row) => row.cardId === card.id)!;
                return (
                  <div className="placement-row" key={card.id}>
                    <NoTranslate>{card.name}</NoTranslate>
                    <span>{CORNER_NAMES[suggestion.corner]}</span>
                    <small>
                      {suggestion.exposed.map((side, index) => (
                        <span key={side}>
                          {index ? ' · ' : ''}
                          <span>{SIDE_NAMES[side]}</span>{' '}
                          {card.stats[side] === 10 ? 'A' : card.stats[side]}
                        </span>
                      ))}
                    </small>
                  </div>
                );
              })}
            </details>
          </>
        )}
      </section>
    </LocaleView>
  );
}
