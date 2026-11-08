'use client';
import { useEffect, useRef, useState } from 'react';
import type { MatchView } from '@gacha-triad/shared/platform';
import { Card } from './card';
import { preloadArtwork } from '../lib/artwork';
import { assetPath } from '../lib/connection';
import { api } from '../lib/platform';
import { useGameAudio } from './game-shell';
export function DraftOpening({
  match,
  onUpdate,
  onComplete,
}: {
  match: MatchView;
  onUpdate: (match: MatchView) => void;
  onComplete: () => void;
}) {
  const initial = useRef(match),
    play = useGameAudio();
  const [position, setPosition] = useState(
      Math.min(match.draftRevealed, match.draftPool.length - 1),
    ),
    [phase, setPhase] = useState('pack'),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    async function open() {
      setError('');
      const source = initial.current;
      for (const card of source.draftPool) void preloadArtwork(card);
      try {
        let next = await api<MatchView>(`/matches/${source.id}`);
        for (let step = next.draftRevealed; step < next.draftPool.length; step++) {
          if (!active || next.status !== 'drafting') return;
          setPosition(step);
          if (step % 5 === 0) {
            setPhase('pack');
            await wait(750);
          }
          await preloadArtwork(next.draftPool[step]);
          if (!active) return;
          next = await api<MatchView>(`/matches/${source.id}/draft/reveal`, { step });
          if (!active) return;
          onUpdate(next);
          setPhase('reveal');
          play(next.draftPool[step].rarity >= 4 ? 'victory' : 'capture');
          await wait(1100);
          if (!active) return;
          if (step % 5 === 4) {
            setPhase('spread');
            await wait(900);
          }
          step = Math.max(step, next.draftRevealed - 1);
        }
        if (active) onComplete();
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }
    void open();
    return () => {
      active = false;
    };
  }, [match.id, retry, onUpdate, onComplete, play]);
  const pack = Math.floor(position / 5),
    card = match.draftPool[position];
  return (
    <section
      className={`menu-window draft-opening draft-opening-${phase}`}
      aria-label="Automatic Draft booster opening"
    >
      <header>
        <h1>Draft boosters</h1>
        <p role="status">
          Automatic opening · Booster {pack + 1}/{Math.ceil(match.draftPool.length / 5)} · Card{' '}
          {(position % 5) + 1}/5
        </p>
      </header>
      <div className="draft-pack-track" aria-label="Three temporary boosters">
        {[0, 1, 2].map((n) => (
          <span key={n} className={n === pack ? 'is-current' : n < pack ? 'is-opened' : ''}>
            {n < pack ? '✓' : n + 1}
          </span>
        ))}
      </div>
      <div className="draft-reveal-stage">
        {phase === 'pack' ? (
          <div className="sealed-pack" aria-label={`Opening temporary booster ${pack + 1}`}>
            <span className="pack-medallion">
              <img src={assetPath('/assets/ui/triad-logo.webp')} alt="" />
            </span>
            <strong>DRAFT</strong>
          </div>
        ) : phase === 'spread' ? (
          <div className="draft-pack-spread">
            {match.draftPool.slice(pack * 5, pack * 5 + 5).map((c) => (
              <div key={c.id}>
                <Card card={c} showElement />
              </div>
            ))}
          </div>
        ) : card ? (
          <div className="draft-reveal-card" key={position}>
            <Card card={card} showElement />
          </div>
        ) : null}
      </div>
      <p>Temporary cards · 5% Holo · Each booster: three random cards, one 3★+, one 4★+.</p>
      <small>
        Random: 50/27/17/5/1% · 3★+: 80/17/3% · 4★+: 85/15%. Choose your five-card deck after all
        three boosters.
      </small>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button className="primary-button" onClick={() => setRetry((n) => n + 1)}>
            Resume opening
          </button>
        </div>
      )}
    </section>
  );
}
