'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ruleExample, type ExampleRule } from '@gacha-triad/shared/rule-examples';
export function RuleAnimation({ rule }: { rule: ExampleRule }) {
  const example = useMemo(() => ruleExample(rule), [rule]);
  const [step, setStep] = useState(0),
    [playing, setPlaying] = useState(true),
    [visible, setVisible] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const total = rule === 'combo' ? 5 : 4;
  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => {
      if (motion.matches) setPlaying(false);
    };
    change();
    motion.addEventListener('change', change);
    const visibility = () => setVisible(!document.hidden);
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      motion.removeEventListener('change', change);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    if (!playing || !visible) return;
    const timer = setTimeout(() => setStep((s) => (s + 1) % total), step === 1 ? 1500 : 2000);
    return () => clearTimeout(timer);
  }, [playing, visible, step, total]);
  const caption = [
    'Blue to play. Place your card in the center.',
    'Your card touches the two red cards.',
    rule === 'same'
      ? '4 = 4 and 7 = 7. Two touching pairs match.'
      : '3 + 6 = 9 and 5 + 4 = 9. Two touching sums match.',
    rule === 'same'
      ? 'SAME! Both matching enemy cards turn blue.'
      : 'PLUS! Both matching enemy cards turn blue.',
    'COMBO! The newly captured card’s 8 beats 2. The corner turns blue.',
  ][step];
  return (
    <div
      className={`rule-animation demo-${rule}`}
      ref={root}
      data-step={step}
      aria-label={`${rule} animated gameplay example`}
    >
      <div className="demo-legend">
        <span>■ You</span>
        <span>■ Opponent</span>
      </div>
      <div className="demo-board" aria-label="Example board">
        {example.before.board.map((item, cell) => {
          const capture = example.captures.find((c) => c.cell === cell);
          const flipped = !!capture && step >= (capture.reason === 'combo' ? 4 : 3);
          const card = cell === 4 && step > 0 ? example.placed : item?.card;
          const owner = cell === 4 || flipped ? 0 : item?.owner;
          const comparing = step === 2 && [1, 4, 5].includes(cell);
          return (
            <div
              key={cell}
              className={`demo-cell ${card ? 'has-card' : ''} ${cell === 4 && step === 1 ? 'is-placed' : ''} ${comparing ? 'is-comparing' : ''} ${flipped ? 'is-flipped' : ''}`}
              data-owner={card ? owner : undefined}
            >
              {card ? (
                <div
                  className="demo-card"
                  aria-label={`${cell === 4 ? 'Placed' : item?.card.name} card: top ${card.stats[0]}, right ${card.stats[1]}, bottom ${card.stats[2]}, left ${card.stats[3]}. ${owner === 0 ? 'Blue' : 'Red'}`}
                >
                  {card.stats.map((n, i) => (
                    <span
                      key={i}
                      className={`demo-value side-${i} ${step === 2 && ((cell === 4 && i < 2) || (cell === 1 && i === 2) || (cell === 5 && i === 3)) ? 'is-touching' : ''}`}
                    >
                      {n}
                    </span>
                  ))}
                  <b>
                    {cell === 4
                      ? 'YOU'
                      : flipped
                        ? capture?.reason === 'combo'
                          ? 'COMBO'
                          : rule === 'same'
                            ? 'SAME'
                            : 'PLUS'
                        : owner === 0
                          ? '◆'
                          : '◇'}
                  </b>
                </div>
              ) : (
                <span className="demo-empty">{cell === 4 ? '↓' : '·'}</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="demo-caption" aria-live="off">
        {caption}
      </p>
      <div className="demo-controls">
        <button
          className="text-button"
          onClick={() => setPlaying(!playing)}
          aria-label={`${playing ? 'Pause' : 'Play'} ${rule} example`}
        >
          {playing ? 'Ⅱ Pause' : '▶ Play'}
        </button>
        <button
          className="text-button"
          onClick={() => {
            setPlaying(false);
            setStep((s) => (s + 1) % total);
          }}
        >
          Next step
        </button>
        <button
          className="text-button"
          onClick={() => {
            root.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
            setStep(0);
            setPlaying(true);
          }}
          aria-label={`Replay ${rule} example`}
        >
          ↻ Replay
        </button>
      </div>
    </div>
  );
}
