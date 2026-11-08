'use client';
import { useState } from 'react';
import { applyMove } from '@gacha-triad/engine';
import { COMBO_SOLUTION, createComboLesson } from '@gacha-triad/shared/combo-lesson';
import { Card } from './card';
import { CaptureCard } from './capture-card';
import { useGameAudio } from './game-shell';
export function ComboLesson() {
  const [game, setGame] = useState(createComboLesson);
  const sound = useGameAudio();
  const solved = game.history.length === 7;
  const captures = solved ? game.history.at(-1)!.captures : [];
  const billy = game.hands[0].find((c) => c.id === 'zenless:billy-kid');
  return (
    <div className="combo-lesson">
      <p className="lesson-intro">
        A real position, replayed from six legal moves. Billy Kid’s touching sums both equal{' '}
        <b>8</b>: <b>5 + 3</b> against Endministrator and <b>4 + 4</b> against Anby.
      </p>
      <div className="lesson-layout">
        <div className="lesson-hand">
          {billy && (
            <>
              <Card card={billy} owner={0} />
              <span>BILLY KID</span>
            </>
          )}
          {solved && (
            <div className="lesson-success">
              PLUS
              <br />
              <strong>→ COMBO ×2</strong>
            </div>
          )}
        </div>
        <div className="lesson-board board">
          {game.board.map((item, cell) => {
            const capture = captures.find((c) => c.cell === cell);
            return (
              <button
                key={cell}
                className={`board-cell ${cell === 1 && !solved ? 'legal-cell lesson-target' : ''}`}
                disabled={solved || cell !== 1}
                data-testid={`lesson-cell-${cell}`}
                data-owner={item?.owner}
                onClick={() => {
                  setGame(applyMove(game, COMBO_SOLUTION));
                  sound('combo');
                }}
                aria-label={
                  cell === 1 && !solved
                    ? 'Place Billy Kid to trigger Plus and Combo'
                    : `Lesson cell ${cell + 1}${item ? `: ${item.card.name}, ${item.owner === 0 ? 'your' : 'opponent'} card` : ': empty'}`
                }
              >
                {item ? (
                  <CaptureCard
                    stamp={`${game.history.length}:${cell}`}
                    card={item.card}
                    owner={item.owner}
                    fromOwner={capture?.from}
                    captureReason={capture?.reason}
                    captureOrder={captures.findIndex((c) => c.cell === cell)}
                  />
                ) : (
                  <span className="cell-cross">{cell === 1 ? '↓' : '+'}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="lesson-explanation" role="status">
        {solved ? (
          <>
            <strong>PLUS → Anby + Endministrator → COMBO ×2</strong>
            <p>
              Plus flips Anby and Endministrator. Anby’s 4 beats Chixia’s 2; Endministrator’s 9
              beats Yangyang’s 5. Those last two flips are Combo. Ordinary captures alone do not
              start a chain.
            </p>
            <button
              className="outline-button"
              onClick={() => {
                setGame(createComboLesson());
                sound('menu');
              }}
            >
              Replay lesson ↻
            </button>
          </>
        ) : (
          <p>
            Click the glowing bottom-middle space to place Billy Kid. Watch the three enemy cards
            turn blue in sequence.
          </p>
        )}
      </div>
    </div>
  );
}
