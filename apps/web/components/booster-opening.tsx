'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { BoosterView } from '@gacha-triad/shared/platform';
import { Card, CardArt } from './card';
import { useGameAudio } from './game-shell';
import { useSession } from './session';
import { api } from '../lib/platform';
const colors = ['', '#b7c1d7', '#88c9ae', '#85b9ff', '#c5a1ff', '#f6d383'];
export function BoosterOpening({
  pack,
  onClose,
  onNext,
}: {
  pack: BoosterView;
  onClose: () => void;
  onNext?: () => void;
}) {
  const { refresh } = useSession(),
    play = useGameAudio(),
    dialog = useRef<HTMLDialogElement>(null);
  const [receipt, setReceipt] = useState<BoosterView | null>(pack.openedAt ? pack : null),
    [stage, setStage] = useState(pack.openedAt ? 'summary' : 'sealed'),
    [index, setIndex] = useState(0),
    [revealed, setRevealed] = useState<number[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    setReceipt(pack.openedAt ? pack : null);
    setStage(pack.openedAt ? 'summary' : 'sealed');
    setIndex(0);
    setRevealed([]);
    setError('');
  }, [pack.id]);
  useEffect(() => {
    if (stage !== 'opening') return;
    const timer = setTimeout(
      () => setStage('reveal'),
      matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650,
    );
    return () => clearTimeout(timer);
  }, [stage]);
  const current = receipt?.cards[index],
    faceUp = revealed.includes(index),
    best = receipt?.cards.reduce(
      (best, c) =>
        c.rarity * 10 + (c.finish === 'holo' ? 1 : 0) >
        best.rarity * 10 + (best.finish === 'holo' ? 1 : 0)
          ? c
          : best,
      receipt.cards[0],
    );
  async function open() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await api<BoosterView>(`/boosters/${pack.id}/open`, {});
      setReceipt(next);
      setStage('opening');
      play('place');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function advance() {
    if (stage !== 'reveal' || !current) return;
    if (!faceUp) {
      setRevealed([...revealed, index]);
      play(current.rarity >= 4 || current.finish === 'holo' ? 'victory' : 'capture');
    } else if (index < 4) {
      setIndex(index + 1);
      play('select');
    } else setStage('summary');
  }
  function all() {
    setRevealed([0, 1, 2, 3, 4]);
    setStage('summary');
    play('victory');
  }
  return (
    <dialog
      ref={dialog}
      className={`game-dialog menu-window pack-opening pack-stage-${stage}`}
      aria-labelledby="pack-opening-title"
      onCancel={onClose}
      onKeyDown={(e) => {
        if (e.code === 'Space' && stage === 'reveal') {
          e.preventDefault();
          advance();
        }
      }}
      style={
        {
          '--pack-aura':
            stage === 'reveal' && faceUp && current ? colors[current.rarity] : '#d5b77d',
        } as CSSProperties
      }
    >
      <header className="pack-opening-header">
        <div>
          <h2 id="pack-opening-title">
            {stage === 'summary'
              ? 'Your booster'
              : pack.source === 'starter'
                ? 'Starter booster'
                : pack.source === 'admin'
                  ? 'Gift booster'
                  : 'Standard booster'}
          </h2>
          <span>
            {stage === 'reveal'
              ? `${index + 1} / 5`
              : stage === 'summary'
                ? `${receipt?.newCardIds.length ?? 0} new · ${5 - (receipt?.newCardIds.length ?? 0)} duplicate copies`
                : 'Five cards · one guaranteed 3★ or higher'}
          </span>
        </div>
        <button
          className="text-button"
          disabled={busy}
          aria-label="Close booster opening"
          onClick={onClose}
        >
          Close ×
        </button>
      </header>
      <p className="error-message" role="alert">
        {error}
      </p>
      {(stage === 'sealed' || stage === 'opening') && (
        <div className="pack-ceremony">
          <div className="pack-aura" aria-hidden="true" />
          <button
            className={`sealed-pack ${stage === 'opening' ? 'is-opening' : ''}`}
            disabled={busy || stage === 'opening'}
            onClick={() => void open()}
            aria-label="Open this booster"
          >
            <span className="pack-seal-top" />
            <span className="pack-brand">GACHA TRIAD</span>
            <span className="pack-medallion" aria-hidden="true">
              ◇<b>GT</b>
            </span>
            <strong>{pack.source === 'starter' ? 'STARTER' : 'CROSSWORLDS'}</strong>
            <span>5 CARDS</span>
            <span className="pack-seal-bottom" />
          </button>
          <p>{stage === 'opening' ? 'Opening…' : 'Select the pack to break the seal.'}</p>
          <button
            className="primary-button"
            disabled={busy || stage === 'opening'}
            onClick={() => void open()}
          >
            {busy || stage === 'opening' ? 'Opening…' : 'Open booster'}
          </button>
        </div>
      )}
      {stage === 'reveal' && current && (
        <div className="single-card-stage">
          <div className="pack-aura" aria-hidden="true" />
          <div className="opening-card-stack">
            <span className="stack-sheet stack-sheet-one" aria-hidden="true" />
            <span className="stack-sheet stack-sheet-two" aria-hidden="true" />
            <button
              key={`${pack.id}:${index}`}
              className={`opening-card ${faceUp ? 'is-face-up' : ''}`}
              aria-label={
                faceUp
                  ? index === 4
                    ? 'View all five cards'
                    : 'Next card'
                  : `Reveal card ${index + 1}`
              }
              onClick={advance}
            >
              {faceUp ? (
                <Card card={current} showElement />
              ) : (
                <span className="opening-card-back">
                  <span>GACHA TRIAD</span>
                  <b>GT</b>
                  <span>{index === 4 ? '3★ OR HIGHER' : 'TOUCH TO REVEAL'}</span>
                </span>
              )}
            </button>
          </div>
          <div className="opening-card-caption" aria-live="polite">
            {faceUp ? (
              <>
                <span>
                  {'★'.repeat(current.rarity)}
                  {current.finish === 'holo' ? ' · HOLOGRAPHIC' : ''}
                </span>
                <h3>{current.name}</h3>
                <p>
                  {receipt?.newCardIds.includes(current.id)
                    ? 'New to your collection'
                    : 'Another copy added'}
                </p>
              </>
            ) : (
              <>
                <h3>Card {index + 1}</h3>
                <p>Tap the card or press Space to reveal.</p>
              </>
            )}
          </div>
          <div className="opening-progress" aria-label="Booster progress">
            {receipt?.cards.map((c, i) => (
              <button
                key={c.id}
                className={i === index ? 'is-current' : ''}
                disabled={!revealed.includes(i)}
                aria-label={`View revealed card ${i + 1}`}
                onClick={() => setIndex(i)}
              >
                {revealed.includes(i) ? <CardArt card={c} /> : <span>◇</span>}
              </button>
            ))}
          </div>
          <div className="result-actions">
            <button className="outline-button" onClick={advance}>
              {faceUp ? (index === 4 ? 'See all cards' : 'Next card') : 'Reveal card'}
            </button>
            <button className="text-button" onClick={all}>
              Reveal all
            </button>
          </div>
          <small>Cards are saved to Collection. Closing will keep your results.</small>
        </div>
      )}
      {stage === 'summary' && receipt && (
        <section className="opening-summary">
          <div className="pack-aura" aria-hidden="true" />
          <div className="opening-fan">
            {receipt.cards.map((c, i) => (
              <div
                key={c.id}
                className={`opening-fan-card ${c.id === best?.id ? 'best-draw' : ''}`}
                style={
                  {
                    '--fan-angle': `${(i - 2) * 4}deg`,
                    '--draw-color': colors[c.rarity],
                  } as CSSProperties
                }
              >
                {c.id === best?.id && <b className="best-draw-badge">Best draw</b>}
                <Card card={c} showElement />
                <span>{receipt.newCardIds.includes(c.id) ? 'NEW' : 'EXTRA COPY'}</span>
              </div>
            ))}
          </div>
          <p>All five cards are in your collection.</p>
          <div className="result-actions">
            {onNext && (
              <button className="primary-button" onClick={onNext}>
                Open another booster
              </button>
            )}
            <button className="outline-button" onClick={onClose}>
              Continue
            </button>
            <Link className="text-button" href="/collection">
              Go to Collection
            </Link>
          </div>
        </section>
      )}
    </dialog>
  );
}
