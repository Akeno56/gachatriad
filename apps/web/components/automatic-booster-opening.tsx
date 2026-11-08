'use client';
import { LocaleView, NoTranslate } from './i18n';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BOOSTER_TYPES, type BoosterView } from '@gacha-triad/shared/platform';
import { Card } from './card';
import { useSession } from './session';
import { useGameAudio } from './game-shell';
import { api } from '../lib/platform';
import { preloadArtwork } from '../lib/artwork';
import { assetPath } from '../lib/connection';
export function AutomaticBoosterOpening({
  packs,
  onClose,
}: {
  packs: BoosterView[];
  onClose: () => void;
}) {
  const { profile, refresh } = useSession(),
    play = useGameAudio();
  const dialog = useRef<HTMLDialogElement>(null),
    source = useRef(packs),
    task = useRef<Promise<BoosterView[]> | null>(null);
  const [results, setResults] = useState<BoosterView[]>(
      packs.every((p) => p.openedAt) ? packs : [],
    ),
    [phase, setPhase] = useState(packs.every((p) => p.openedAt) ? 'summary' : 'pack'),
    [position, setPosition] = useState(0),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const sessionKey = `triad-opening:${profile?.id}`;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (source.current.every((p) => p.openedAt)) return;
    let active = true;
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    async function run() {
      setError('');
      try {
        const saved = sessionStorage.getItem(sessionKey);
        const previous = saved ? JSON.parse(saved) : null;
        const ids = source.current.map((p) => p.id);
        let start =
          previous &&
          JSON.stringify(previous.ids) === JSON.stringify(ids) &&
          Number.isInteger(previous.next)
            ? Math.max(0, Math.min(previous.next, ids.length * 5))
            : 0;
        sessionStorage.setItem(sessionKey, JSON.stringify({ ids, next: start }));
        if (!task.current)
          task.current = api<BoosterView[]>('/boosters/open-batch', { packIds: ids });
        const opened = await task.current;
        if (!active) return;
        setResults(opened);
        await refresh();
        const cards = opened.flatMap((p) => p.cards);
        for (const card of cards) void preloadArtwork(card);
        for (let i = start; i < cards.length; i++) {
          if (!active) return;
          if (i === start || i % 5 === 0) {
            setPosition(i);
            setPhase('pack');
            await wait(750);
          }
          await preloadArtwork(cards[i]);
          if (!active) return;
          setPosition(i);
          setPhase('reveal');
          play(cards[i].rarity >= 4 || cards[i].finish === 'holo' ? 'victory' : 'capture');
          await wait(1450);
          if (!active) return;
          sessionStorage.setItem(sessionKey, JSON.stringify({ ids, next: i + 1 }));
          if (i % 5 === 4) {
            setPhase('spread');
            await wait(850);
          }
        }
        if (!active) return;
        sessionStorage.removeItem(sessionKey);
        setPhase('summary');
      } catch (e) {
        if (active) {
          task.current = null;
          setError((e as Error).message);
        }
      }
    }
    void run();
    return () => {
      active = false;
    };
  }, [retry, refresh, play, sessionKey]);
  function close() {
    if (!results.length && !error) return;
    sessionStorage.removeItem(sessionKey);
    onClose();
  }
  const currentPack =
    results[Math.floor(position / 5)] ?? packs[Math.floor(position / 5)] ?? packs[0];
  const packArt = BOOSTER_TYPES.find((type) => type.id === currentPack.type)?.artwork;
  const card = results.flatMap((p) => p.cards)[position];
  const rows = results
    .flatMap((p) => p.cards)
    .reduce<{ card: BoosterView['cards'][number]; count: number; fresh: boolean }[]>(
      (list, card) => {
        const row = list.find((r) => r.card.id === card.id);
        if (row) row.count++;
        else
          list.push({ card, count: 1, fresh: results.some((p) => p.newCardIds.includes(card.id)) });
        return list;
      },
      [],
    )
    .sort(
      (a, b) =>
        b.card.rarity - a.card.rarity ||
        b.card.stats.reduce((s, n) => s + n, 0) - a.card.stats.reduce((s, n) => s + n, 0) ||
        a.card.name.localeCompare(b.card.name),
    );
  return (
    <LocaleView>
      <dialog
        ref={dialog}
        className={`game-dialog menu-window pack-opening automatic-opening ${phase === 'summary' ? 'pack-stage-summary' : 'pack-stage-reveal'}`}
        aria-labelledby="automatic-pack-title"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        data-phase={phase}
        data-position={position}
      >
        <header className="pack-opening-header">
          <div>
            <h2 id="automatic-pack-title">
              {phase === 'summary'
                ? `${results.length * 5} cards added`
                : (BOOSTER_TYPES.find((p) => p.id === currentPack.type)?.name ?? 'Booster opening')}
            </h2>
            <span role="status">
              {phase === 'summary'
                ? 'Saved to your Collection'
                : `Automatic opening · Booster ${Math.floor(position / 5) + 1}/${packs.length} · Card ${(position % 5) + 1}/5`}
            </span>
          </div>
          <button
            className="text-button"
            aria-label="Close booster opening"
            disabled={!results.length && !error}
            onClick={close}
          >
            Close ×
          </button>
        </header>
        {error && (
          <div role="alert">
            <p>{error}</p>
            <button className="primary-button" onClick={() => setRetry((n) => n + 1)}>
              Resume opening
            </button>
          </div>
        )}
        {phase === 'pack' && (
          <div className="auto-opening-stage">
            <div className={`sealed-pack is-opening ${packArt ? 'has-pack-image' : ''}`}>
              <span className="pack-brand">GACHA TRIAD</span>
              <img
                src={assetPath(packArt ?? '/assets/ui/triad-logo.webp')}
                alt=""
                draggable={false}
              />
              <strong>
                {currentPack.type === 'starter' ? 'STARTER' : currentPack.type.toUpperCase()}
              </strong>
              <span>5 CARDS</span>
            </div>
            <p>Opening booster {Math.floor(position / 5) + 1}…</p>
          </div>
        )}
        {phase === 'reveal' && card && (
          <div className="auto-opening-stage">
            <div className="auto-revealed-card" key={position}>
              <Card card={card} showElement />
            </div>
            <h3>
              <NoTranslate>{card.name}</NoTranslate>
            </h3>
            <p>
              {'★'.repeat(card.rarity)}
              {card.finish === 'holo' ? ' · HOLOGRAPHIC +1' : ''}
            </p>
            <p>
              {currentPack.newCardIds.includes(card.id)
                ? 'New to your collection'
                : 'Another copy added'}
            </p>
          </div>
        )}
        {phase === 'spread' && (
          <div className="auto-pack-spread">
            {currentPack.cards.map((card) => (
              <div key={card.id}>
                <Card card={card} showElement />
              </div>
            ))}
          </div>
        )}
        {phase === 'summary' && (
          <>
            <section
              className={`auto-results-grid ${packs.length === 1 ? 'single-pack-results' : ''}`}
              aria-label="Booster results"
            >
              {rows.map(({ card, count, fresh }) => (
                <article key={card.id}>
                  <Card card={card} showElement />
                  <p>
                    {fresh ? 'NEW · ' : ''}
                    {count > 1 ? `×${count} copies` : '1 copy'}
                  </p>
                </article>
              ))}
            </section>
            <div className="result-actions">
              <button className="primary-button" onClick={close}>
                Continue
              </button>
              <Link className="outline-button" href="/" onClick={close}>
                Play a game
              </Link>
              <Link className="text-button" href="/collection" onClick={close}>
                Go to Collection
              </Link>
            </div>
          </>
        )}
      </dialog>
    </LocaleView>
  );
}
