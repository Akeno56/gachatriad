'use client';
import { LocaleView } from './i18n';

import { useEffect, useState } from 'react';
import { assetPath } from '../lib/connection';
const modes = ['All Open', 'Three Open', 'Closed'] as const;
export function VisibilityExample() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setStep((n) => (n + 1) % 3);
    }, 4000);
    return () => clearInterval(timer);
  }, []);
  return (
    <LocaleView>
      <div
        className="rule-animation visibility-example"
        aria-label="Animated hand visibility example"
        data-visibility={step}
      >
        <div className="demo-legend">{modes[step]}</div>
        {['Your hand', 'Opponent’s hand'].map((label, row) => (
          <div key={row} className="visibility-hand">
            <span>{label}</span>
            <div>
              {[0, 1, 2, 3, 4].map((n) => {
                const shown = row === 0 || step === 0 || (step === 1 && [0, 2, 4].includes(n));
                return (
                  <div
                    key={n}
                    className={`visibility-mini ${shown ? 'is-revealed' : 'is-hidden'}`}
                    aria-label={`${label}, card ${n + 1}: ${shown ? 'visible' : 'hidden'}`}
                  >
                    {shown ? (
                      <>
                        <b>{n + 3}</b>
                        <span>◆</span>
                        <b>{7 - n}</b>
                      </>
                    ) : (
                      <img src={assetPath('/assets/ui/triad-logo.webp')} alt="Card back" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <p className="demo-caption">
          {step === 0
            ? 'Both players can see every card in both hands.'
            : step === 1
              ? 'Each player reveals three randomly chosen cards to their opponent. Two stay hidden.'
              : 'Unplayed cards are hidden from the opponent. You always see your own hand.'}
        </p>
        <small>Your hand remains visible to you in every mode.</small>
      </div>
    </LocaleView>
  );
}
