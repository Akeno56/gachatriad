'use client';
import { LocaleView } from './i18n';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { elementalModifier, randomDeck, scores, seededRandom } from '@gacha-triad/engine';
import { TRAINING_HANDS, TRAINING_STEPS } from '@gacha-triad/shared/training-duel';
import { Card } from './card';
import { CaptureCard } from './capture-card';
import { ElementIcon } from './element-icon';
import { useSession } from './session';
import { useGameAudio } from './game-shell';
import { api } from '../lib/platform';
export function FirstDuelTutorial() {
  const { profile, refresh } = useSession(),
    pathname = usePathname(),
    play = useGameAudio();
  const [step, setStep] = useState(0),
    [manual, setManual] = useState(false),
    [done, setDone] = useState(false),
    [selected, setSelected] = useState(false),
    [visibility, setVisibility] = useState('all'),
    [claimed, setClaimed] = useState(''),
    [seed, setSeed] = useState(0),
    [drawn, setDrawn] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const ref = useRef<HTMLDialogElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const required =
    !!profile &&
    profile.played === 0 &&
    profile.deck.length === 5 &&
    !profile.starterBoosters &&
    !profile.tutorialCompleted &&
    !profile.activeMatchId &&
    ['/', '/lobbies'].includes(pathname.replace(/\/$/, '') || '/');
  const visible = required || manual,
    lesson = TRAINING_STEPS[step],
    game = done && lesson.after ? lesson.after : lesson.before;
  const score = scores(game),
    latest = done ? game.history.at(-1) : undefined;
  const randomHand = useMemo(
    () => randomDeck(TRAINING_HANDS.flat(), seededRandom(seed + 42)),
    [seed],
  );
  function goToStep(next: number) {
    setDone(false);
    setSelected(false);
    setClaimed('');
    setDrawn(false);
    setError('');
    setStep(next);
  }
  useEffect(() => {
    const show = () => {
      goToStep(0);
      setManual(true);
    };
    window.addEventListener('triad:show-tutorial', show);
    return () => window.removeEventListener('triad:show-tutorial', show);
  }, []);
  useEffect(() => {
    goToStep(0);
    setManual(false);
  }, [profile?.id, pathname]);
  useEffect(() => {
    if (visible) ref.current?.showModal();
    else ref.current?.close();
  }, [visible]);
  useEffect(() => {
    heading.current?.focus();
    if (!visible || lesson.kind !== 'rival') return;
    const timer = setTimeout(() => {
      setDone(true);
      play('capture');
    }, 700);
    return () => clearTimeout(timer);
  }, [step, visible, lesson.kind, play]);
  if (!visible) return null;
  const ready = !['play', 'rival'].includes(lesson.kind) || done;
  const canContinue =
    ready && (lesson.kind !== 'trade' || !!claimed) && (lesson.kind !== 'random' || drawn);
  async function finish() {
    if (busy) return;
    setBusy(true);
    try {
      if (!profile?.tutorialCompleted) {
        await api('/tutorial/complete', {});
        await refresh();
      }
      setManual(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <LocaleView>
      <dialog
        ref={ref}
        className="game-dialog menu-window tutorial-dialog guided-tutorial"
        aria-labelledby="tutorial-title"
        data-step={step}
        data-ready={canContinue}
        onCancel={(e) => (required ? e.preventDefault() : setManual(false))}
      >
        {manual && !required && (
          <button
            className="dialog-close"
            aria-label="Close tutorial"
            onClick={() => setManual(false)}
          >
            ×
          </button>
        )}
        <div className="eyebrow">
          TRAINING DUEL · {step + 1}/{TRAINING_STEPS.length} · NO REAL STAKES
        </div>
        <h2 id="tutorial-title" ref={heading} tabIndex={-1}>
          {lesson.title}
        </h2>
        <p className="training-explanation">{lesson.text}</p>
        {lesson.kind === 'visibility' && (
          <div className="training-visibility" role="group" aria-label="Training hand visibility">
            {['all', 'three', 'closed'].map((mode) => (
              <button
                key={mode}
                className="outline-button"
                aria-pressed={visibility === mode}
                onClick={() => setVisibility(mode)}
              >
                {mode === 'all' ? 'All Open' : mode === 'three' ? 'Three Open' : 'Closed'}
              </button>
            ))}
          </div>
        )}
        <div className="training-layout">
          <section className="training-arena" aria-label="Training battle">
            <div className="training-score">
              You <strong>{score[0]}</strong> — <strong>{score[1]}</strong> Rival
            </div>
            <div className="training-board">
              {game.board.map((item, cell) => {
                const capture = latest?.captures.find((c) => c.cell === cell),
                  target = lesson.kind === 'play' && !done && lesson.move?.cell === cell,
                  affinity = game.cellElements?.[cell];
                return (
                  <button
                    key={cell}
                    className={`training-cell ${target ? 'training-target' : ''} ${target && selected ? 'training-legal' : ''}`}
                    disabled={!target || !selected || busy}
                    aria-label={`Training cell ${cell + 1}${target ? ', highlighted' : ''}`}
                    onClick={() => {
                      setDone(true);
                      play(lesson.title.startsWith('Combo') ? 'combo' : 'capture');
                    }}
                  >
                    {item ? (
                      <CaptureCard
                        card={item.card}
                        owner={item.owner}
                        fromOwner={capture?.from}
                        captureReason={capture?.reason}
                        captureOrder={latest?.captures.findIndex((c) => c.cell === cell) ?? 0}
                        stamp={`${step}:${game.history.length}:${cell}`}
                        showElement
                        modifier={elementalModifier(game, item.card, cell)}
                      />
                    ) : (
                      <>
                        {affinity && <ElementIcon element={affinity} />}
                        <span>{target ? 'Place here' : ''}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            {latest && (
              <p className="training-captures" role="status">
                {[...new Set(latest.captures.map((c) => c.reason))]
                  .map((reason) => (reason === 'standard' ? 'Capture' : reason.toUpperCase()))
                  .join(' + ') || 'Card placed'}
                {latest.captures.length
                  ? ` · ${latest.captures.length} card${latest.captures.length === 1 ? '' : 's'} flipped`
                  : ''}
              </p>
            )}
          </section>
          <section className="training-hand-panel" aria-label="Training hands">
            <h3>Your hand</h3>
            <div className="training-hand">
              {game.hands[0].map((card) => (
                <button
                  key={card.id}
                  disabled={
                    lesson.kind !== 'play' || done || card.id !== lesson.move?.cardId || busy
                  }
                  className={`training-hand-card ${lesson.move?.cardId === card.id && !done ? 'training-choice' : ''} ${selected && lesson.move?.cardId === card.id ? 'is-selected' : ''}`}
                  aria-label={`Select training ${card.name}`}
                  aria-pressed={selected && lesson.move?.cardId === card.id}
                  onClick={() => {
                    setSelected(true);
                    play('select');
                  }}
                >
                  <Card card={card} owner={0} showElement />
                </button>
              ))}
            </div>
            <h3>Rival’s hand</h3>
            <div className="training-hand rival-training-hand">
              {game.hands[1].map((card, i) => (
                <div className="training-hand-card" key={card.id}>
                  <Card
                    card={card}
                    owner={1}
                    showElement
                    hidden={
                      lesson.kind === 'visibility' &&
                      (visibility === 'closed' || (visibility === 'three' && i >= 3))
                    }
                  />
                </div>
              ))}
            </div>
            {lesson.kind === 'play' && !done && (
              <p className="training-action-hint">
                {selected
                  ? 'Place it in the highlighted cell.'
                  : `Select ${game.hands[0].find((c) => c.id === lesson.move?.cardId)?.name}, then choose the highlighted cell.`}
              </p>
            )}
            {step === 11 && (
              <div className="training-element-note">
                <p>Printed: 1 / 3 / 1 / 1</p>
                <p>Matching Fire: 2 / 4 / 2 / 2</p>
                <p>Different or no affinity: 0 / 2 / 0 / 0</p>
              </div>
            )}
          </section>
        </div>
        {lesson.kind === 'trade' && (
          <div className="training-trade">
            <p>Choose one training card from the rival’s original deck:</p>
            <div>
              {TRAINING_HANDS[1].map((card) => (
                <button
                  key={card.id}
                  aria-label={`Practice taking ${card.name}`}
                  className={claimed === card.id ? 'is-selected' : ''}
                  aria-pressed={claimed === card.id}
                  onClick={() => {
                    setClaimed(card.id);
                    play('select');
                  }}
                >
                  <Card card={card} owner={claimed === card.id ? 0 : 1} />
                </button>
              ))}
            </div>
            {claimed && (
              <p role="status">Training choice made. Your real collection is unchanged.</p>
            )}
          </div>
        )}
        {lesson.kind === 'random' && (
          <div className="training-random">
            <button
              className="outline-button"
              onClick={() => {
                setSeed((n) => n + 1);
                setDrawn(true);
                play('select');
              }}
            >
              Draw a training Random hand
            </button>
            {drawn && (
              <div>
                {randomHand.map((card) => (
                  <div key={card.id}>
                    <Card card={card} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <p className="error-message" role="alert">
          {error}
        </p>
        <div className="result-actions">
          {step > 0 && (
            <button className="outline-button" disabled={busy} onClick={() => goToStep(step - 1)}>
              Back
            </button>
          )}
          {step < TRAINING_STEPS.length - 1 ? (
            <button
              className="primary-button"
              disabled={!canContinue || busy}
              onClick={() => goToStep(step + 1)}
            >
              Continue tutorial ▶
            </button>
          ) : (
            <button
              className="primary-button"
              disabled={!canContinue || busy}
              onClick={() => void finish()}
            >
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
    </LocaleView>
  );
}

export function RulebookAcknowledgement() {
  const { profile, refresh } = useSession();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  if (!profile || profile.played > 0 || profile.tutorialCompleted) return null;
  return (
    <LocaleView>
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
    </LocaleView>
  );
}
