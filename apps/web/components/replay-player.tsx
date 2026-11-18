'use client';
import { useEffect, useMemo, useState } from 'react';
import { elementalModifier, type Card as CardData, type Player } from '@gacha-triad/engine';
import type { ReplayView } from '@gacha-triad/shared/replays';
import { Card } from './card';
import { CardDetail } from './card-detail';
import { ElementIcon } from './element-icon';
import { BotStyle } from './bot-style';
import { LocaleView, LocalizedDate, NoTranslate } from './i18n';
import { Button } from './ui';
import { ruleNames } from '../lib/rules';
export function ReplayPlayer({
  replay,
  favoriteBusy,
  onFavorite,
}: {
  replay: ReplayView;
  favoriteBusy: boolean;
  onFavorite: () => void;
}) {
  const [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState('1'),
    [detail, setDetail] = useState<CardData | null>(null),
    [modifier, setModifier] = useState(0);
  const cards = useMemo(
    () => new Map(replay.decks.flat().map((card) => [card.id, card])),
    [replay],
  );
  const last = replay.frames.length - 1,
    index = Math.min(step, last),
    frame = replay.frames[index];
  useEffect(() => {
    setStep(0);
    setPlaying(false);
    setDetail(null);
  }, [replay.id]);
  useEffect(() => {
    if (!playing || detail) return;
    const timer = setInterval(
      () => {
        setStep((n) => {
          return Math.min(last, n + 1);
        });
      },
      speed === '2' ? 650 : 1300,
    );
    const hidden = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [playing, speed, last, detail]);
  useEffect(() => {
    if (playing && index === last) setPlaying(false);
  }, [playing, index, last]);
  function seek(n: number) {
    setPlaying(false);
    setStep(Math.max(0, Math.min(last, n)));
  }
  function inspect(card: CardData, value = 0) {
    setPlaying(false);
    setModifier(value);
    setDetail(card);
  }
  const owner = (seat: Player) => (seat === replay.seat ? 0 : 1) as Player;
  const finalScore = replay.frames[last].score,
    result = replay.winner === 'draw' ? 'Draw' : replay.winner === replay.seat ? 'Win' : 'Loss';
  const scoreState = { rules: replay.rules, cellElements: replay.cellElements };
  const action = frame.move,
    moved = action ? cards.get(action.cardId) : null;
  return (
    <LocaleView>
      <section className="replay-player" aria-label="Match replay">
        <header className="replay-match-heading">
          <div>
            <h2>
              <NoTranslate>{replay.players[0].name}</NoTranslate>
              <span> vs </span>
              <NoTranslate>{replay.players[1].name}</NoTranslate>
            </h2>
            <p>
              <b>{result}</b> · {finalScore.join(' – ')} ·{' '}
              <LocalizedDate value={replay.completedAt} format="datetime" />
            </p>
          </div>
          <Button disabled={favoriteBusy} aria-pressed={replay.favorite} onClick={onFavorite}>
            {replay.favorite ? '★ Favourite' : '☆ Add favourite'}
          </Button>
        </header>
        <div className="replay-rule-line">
          <div className="rule-badges">
            {ruleNames(replay.rules).map((rule) => (
              <span key={rule}>{rule}</span>
            ))}
            {replay.tradeRule === 'one' && <span>Trade One</span>}
          </div>
          <span>Season {replay.season}</span>
          {replay.ratings[replay.seat] && (
            <span>{`${replay.ratings[replay.seat]!.after - replay.ratings[replay.seat]!.before >= 0 ? '+' : ''}${replay.ratings[replay.seat]!.after - replay.ratings[replay.seat]!.before} Elo`}</span>
          )}
        </div>
        {replay.endReason && <p className="replay-end-reason">{replay.endReason}</p>}
        <div className="menu-window replay-controls" role="group" aria-label="Replay controls">
          <div className="replay-transport">
            <Button aria-label="First turn" disabled={!index} onClick={() => seek(0)}>
              ⏮
            </Button>
            <Button aria-label="Previous turn" disabled={!index} onClick={() => seek(index - 1)}>
              ◀
            </Button>
            <Button
              className="replay-play"
              disabled={!last}
              onClick={() => {
                if (index === last) setStep(0);
                setPlaying(!playing);
              }}
            >
              {playing ? 'Pause' : 'Play'}
            </Button>
            <Button
              aria-label="Next turn"
              disabled={index === last}
              onClick={() => seek(index + 1)}
            >
              ▶
            </Button>
            <Button aria-label="Last turn" disabled={index === last} onClick={() => seek(last)}>
              ⏭
            </Button>
          </div>
          <label className="replay-scrubber">
            <span>{`Turn ${index} / ${last}`}</span>
            <input
              type="range"
              name="replay-turn"
              aria-label="Replay turn"
              min="0"
              disabled={!last}
              max={last}
              value={index}
              onChange={(e) => seek(Number(e.target.value))}
            />
          </label>
          <label className="replay-speed">
            Speed
            <select name="replay-speed" value={speed} onChange={(e) => setSpeed(e.target.value)}>
              <option value="1">1×</option>
              <option value="2">2×</option>
            </select>
          </label>
        </div>
        <div className="replay-workspace">
          <section className="replay-board-panel" aria-label="Replay board">
            <div className="replay-score">
              <span className="score-blue">{frame.score[replay.seat]}</span>
              <span>–</span>
              <span className="score-red">{frame.score[1 - replay.seat]}</span>
            </div>
            <div className={`replay-board ${replay.rules.elemental ? 'elemental-board' : ''}`}>
              {frame.board.map((slot, cell) => {
                const card = slot ? cards.get(slot.cardId) : null,
                  capture = frame.captures.find((c) => c.cell === cell),
                  element = replay.cellElements[cell],
                  bonus = card ? elementalModifier(scoreState, card, cell) : 0;
                return (
                  <button
                    key={cell}
                    className={`replay-cell ${action?.cell === cell ? 'replay-last-move' : ''} ${capture ? 'replay-captured' : ''}`}
                    disabled={!card}
                    aria-label={
                      card
                        ? `Inspect ${card.name}`
                        : `Empty cell ${String.fromCharCode(65 + Math.floor(cell / 3))}${(cell % 3) + 1}`
                    }
                    onClick={() => card && inspect(card, bonus)}
                  >
                    {card && slot ? (
                      <Card
                        card={card}
                        owner={owner(slot.owner)}
                        modifier={bonus}
                        showElement={!!replay.rules.elemental}
                      />
                    ) : (
                      <span className="replay-empty-cell">
                        {String.fromCharCode(65 + Math.floor(cell / 3))}
                        {(cell % 3) + 1}
                        {element && <ElementIcon element={element} />}
                      </span>
                    )}
                    {card && element && (
                      <span className="replay-cell-element" title="Cell element">
                        <ElementIcon element={element} />
                      </span>
                    )}
                    {capture && (
                      <span className="replay-capture-tag">
                        {capture.reason === 'standard'
                          ? 'Capture'
                          : capture.reason === 'same'
                            ? 'Same'
                            : capture.reason === 'plus'
                              ? 'Plus'
                              : 'Combo'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
          <aside className="replay-sidebar">
            <div className="menu-window replay-move-info" role="status" aria-live="polite">
              {action ? (
                <>
                  <NoTranslate>{replay.players[action.player].name}</NoTranslate>
                  <span> · </span>
                  <NoTranslate>{moved?.name}</NoTranslate>
                  <span>
                    {' '}
                    · {String.fromCharCode(65 + Math.floor(action.cell / 3))}
                    {(action.cell % 3) + 1}
                  </span>
                  {!!frame.captures.length && (
                    <b>
                      {frame.captures.length === 1
                        ? '1 capture'
                        : `${frame.captures.length} captures`}
                    </b>
                  )}
                </>
              ) : last ? (
                'Starting position'
              ) : (
                'No moves recorded'
              )}
            </div>
            <div className="replay-hands">
              {([replay.seat, 1 - replay.seat] as Player[]).map((seat) => (
                <section className="menu-window replay-hand" key={seat}>
                  <h3>
                    <NoTranslate>{replay.players[seat].name}</NoTranslate>
                    <span>{frame.hands[seat].length}/5</span>
                  </h3>
                  <BotStyle style={replay.players[seat].botStyle} />
                  <div className="replay-hand-cards">
                    {frame.hands[seat].map((id) => {
                      const card = cards.get(id)!;
                      return (
                        <button
                          key={id}
                          aria-label={`Inspect ${card.name}`}
                          onClick={() => inspect(card)}
                        >
                          <Card
                            card={card}
                            owner={owner(seat)}
                            showElement={!!replay.rules.elemental}
                          />
                        </button>
                      );
                    })}
                  </div>
                  {!frame.hands[seat].length && <p>No cards remaining</p>}
                </section>
              ))}
            </div>
            <details className="menu-window replay-starting-decks">
              <summary>Starting decks</summary>
              {([0, 1] as Player[]).map((seat) => (
                <section key={seat}>
                  <h3>
                    <NoTranslate>{replay.players[seat].name}</NoTranslate>
                  </h3>
                  <div className="replay-deck-cards">
                    {replay.decks[seat].map((card) => (
                      <button
                        key={card.id}
                        aria-label={`Inspect ${card.name}`}
                        onClick={() => inspect(card)}
                      >
                        <Card
                          card={card}
                          owner={owner(seat)}
                          showElement={!!replay.rules.elemental}
                        />
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </details>
            {replay.claimedCardId && (
              <p className="replay-trade-note">
                <span>Trade One: </span>
                <NoTranslate>{cards.get(replay.claimedCardId)?.name}</NoTranslate>
              </p>
            )}
            {replay.tradePending && <p className="replay-trade-note">Trade pending</p>}
          </aside>
        </div>
        <CardDetail card={detail} modifier={modifier} onClose={() => setDetail(null)} />
      </section>
    </LocaleView>
  );
}
