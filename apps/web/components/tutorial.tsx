'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { STARTER_DECK } from '@gacha-triad/shared';
import { Card } from './card';
import { useSession } from './session';
import { api } from '../lib/platform';
export function FirstDuelTutorial() {
  const { profile, refresh } = useSession(),
    pathname = usePathname();
  const [step, setStep] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const required =
    !!profile &&
    profile.played === 0 &&
    !profile.tutorialCompleted &&
    !profile.activeMatchId &&
    ['/', '/lobbies'].includes(pathname.replace(/\/$/, '') || '/');
  useEffect(() => {
    if (required) ref.current?.showModal();
    else ref.current?.close();
  }, [required]);
  if (!required) return null;
  async function finish() {
    setBusy(true);
    try {
      await api('/tutorial/complete', {});
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="game-dialog menu-window tutorial-dialog"
      aria-labelledby="tutorial-title"
      onCancel={(e) => e.preventDefault()}
    >
      <div className="eyebrow">YOUR FIRST DUEL · {step + 1}/3</div>
      <h2 id="tutorial-title">
        {['Five cards. Nine spaces.', 'Capture and count.', 'Choose your table.'][step]}
      </h2>
      <div className="tutorial-layout">
        <div className="tutorial-card">
          <Card card={STARTER_DECK[0]} showElement />
        </div>
        <div>
          {step === 0 ? (
            <>
              <p>
                Bring five different cards. You and your rival take turns placing one card in an
                empty space on the 3×3 board.
              </p>
              <p>
                The four numbers face up, right, down and left. A means 10. Select a card, then
                choose a space.
              </p>
            </>
          ) : step === 1 ? (
            <>
              <p>
                A higher number captures the touching side of an adjacent enemy card. Equal numbers
                do not capture normally.
              </p>
              <p>
                After nine placements, count the cards you control, including the last unplayed
                card. More than five wins; 5–5 is a draw.
              </p>
            </>
          ) : (
            <>
              <p>
                Unranked uses Three Open: three cards in each starting hand are revealed. Practice
                against the CPU to get comfortable.
              </p>
              <p>
                Same and Plus can trigger Combo chains. Elemental cells add +1 for matching cards
                and −1 for others. Ranked uses Trade One: the winner takes a real card, including on
                a forfeit.
              </p>
            </>
          )}
        </div>
      </div>
      <p className="error-message" role="alert">
        {error}
      </p>
      <div className="result-actions">
        {step > 0 && (
          <button className="outline-button" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {step < 2 ? (
          <button className="primary-button" onClick={() => setStep(step + 1)}>
            Continue tutorial ▶
          </button>
        ) : (
          <button className="primary-button" disabled={busy} onClick={finish}>
            I’m ready to play
          </button>
        )}
        <Link className="text-button" href="/rules">
          Read the rulebook instead
        </Link>
        <Link className="text-button" href="/cards">
          Browse cards first
        </Link>
      </div>
    </dialog>
  );
}
export function RulebookAcknowledgement() {
  const { profile, refresh } = useSession();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  if (!profile || profile.played > 0 || profile.tutorialCompleted) return null;
  return (
    <section className="menu-window rulebook-onboarding">
      <h2>Ready for your first duel?</h2>
      <p>Reading this manual also completes your first-duel tutorial.</p>
      <button
        className="primary-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api('/tutorial/complete', {});
            await refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        I’ve read the rules · Unlock duels
      </button>
      <p className="error-message" role="alert">
        {error}
      </p>
    </section>
  );
}
