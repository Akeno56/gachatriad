'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { scores, winner } from '@gacha-triad/engine';
import type { DailyPuzzleView } from '@gacha-triad/shared/puzzle';
import { api } from '../../lib/platform';
import { Card } from '../../components/card';
import { LocaleView, NoTranslate } from '../../components/i18n';
import { useSession } from '../../components/session';
import { usePageRefresh } from '../../components/use-page-refresh';
import { useGameAudio } from '../../components/game-shell';
export default function PuzzlePage() {
  const { profile, refresh, openAccount } = useSession(),
    play = useGameAudio();
  const [revision, reload] = usePageRefresh(60000);
  const [view, setView] = useState<DailyPuzzleView | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [now, setNow] = useState(Date.now());
  const serial = useRef(0),
    locked = useRef(false),
    pending = useRef<Promise<void> | null>(null);
  const load = useCallback(async () => {
    if (locked.current) return;
    if (pending.current) return pending.current;
    const id = ++serial.current;
    pending.current = (async () => {
      try {
        const next = await api<DailyPuzzleView>('/puzzles/daily');
        if (serial.current === id) {
          setView(next);
          setError('');
        }
      } catch (e) {
        if (serial.current === id) setError((e as Error).message);
      } finally {
        pending.current = null;
      }
    })();
    return pending.current;
  }, []);
  useEffect(() => {
    let active = true;
    setSelected(null);
    setView(null);
    void (async () => {
      await pending.current;
      if (active && profile) await load();
    })();
    return () => {
      active = false;
      serial.current++;
    };
  }, [profile?.id, profile?.registered, load]);
  useEffect(() => {
    if (profile) void load();
  }, [revision, load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (view && now >= Date.parse(view.resetsAt) && !locked.current) void load();
  }, [view?.resetsAt, now, load]);
  async function act(action: 'start' | 'move' | 'claim', body: Record<string, unknown> = {}) {
    if (!view || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    const id = ++serial.current;
    try {
      const next = await api<DailyPuzzleView>(`/puzzles/daily/${action}`, {
        day: view.day,
        ...body,
      });
      if (id === serial.current) {
        setView(next);
        setSelected(null);
        play(
          next.state?.status === 'complete'
            ? winner(next.state) === 0
              ? 'victory'
              : 'defeat'
            : 'select',
        );
      }
      if (next.rewarded && !view.rewarded) await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      locked.current = false;
      setBusy(false);
      void load();
    }
  }
  const state = view?.state,
    result = state?.status === 'complete' ? winner(state) : null;
  const score = state ? scores(state) : [5, 5];
  const remaining = view ? Math.max(0, Math.ceil((Date.parse(view.resetsAt) - now) / 1000)) : 0;
  const leaderboard = view && (
    <section className="menu-window puzzle-leaderboard">
      <h2>Today’s leaderboard</h2>
      <p>Fewest attempts first, then time to the first solve.</p>
      <div className="puzzle-leaderboard-scroll">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Attempts</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {view.leaderboard.map((entry) => (
              <tr key={entry.playerId} className={entry.playerId === profile?.id ? 'is-you' : ''}>
                <td>{entry.rank}</td>
                <td>
                  <Link href={`/profile?id=${entry.playerId}`}>
                    <NoTranslate>{entry.name}</NoTranslate>
                  </Link>
                </td>
                <td>{entry.attempts}</td>
                <td>
                  <NoTranslate>{`${Math.floor(entry.elapsedMs / 60000)}:${String(Math.floor(entry.elapsedMs / 1000) % 60).padStart(2, '0')}`}</NoTranslate>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!view.leaderboard.length && <p>No solves yet. Be the first!</p>}
    </section>
  );
  return (
    <LocaleView>
      <div className="content-page puzzle-page">
        <header className="puzzle-heading">
          <div>
            <div className="eyebrow">THE DAILY CHALLENGE</div>
            <h1>Daily Triad puzzle</h1>
            <p className="page-description">Force a win · Same · Plus · Combo · All Open.</p>
          </div>
          <div className="puzzle-reward menu-window">
            <strong>◇ {view?.reward ?? 100}</strong>
            <span>{view?.rewarded ? 'Reward claimed' : 'First solve reward'}</span>
          </div>
        </header>
        <p className="error-message" role="alert">
          {error}
        </p>
        {!view ? (
          <p role="status">Loading today’s puzzle…</p>
        ) : (
          <>
            <div className="puzzle-meta">
              <span>
                <NoTranslate>{view.day}</NoTranslate> ·{' '}
                {`${Math.floor(remaining / 3600)}:${String(Math.floor(remaining / 60) % 60).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`}
                <small className="puzzle-reset-note">Resets at 00:00 UTC</small>
              </span>
              {state && (
                <>
                  <div className="puzzle-score">
                    <strong>You {score[0]}</strong>
                    <span>—</span>
                    <strong>Opponent {score[1]}</strong>
                  </div>
                  <p id="puzzle-turn-status" className="puzzle-turn-status" role="status">
                    {state.status === 'complete'
                      ? result === 0
                        ? 'Puzzle solved!'
                        : 'Try another approach.'
                      : selected
                        ? 'Choose an empty space.'
                        : 'Choose a card from your hand.'}
                  </p>
                </>
              )}
              <span>Attempts: {view.attempts}</span>
              <button className="text-button" disabled={busy} onClick={reload}>
                Refresh leaderboard
              </button>
            </div>
            {!state ? (
              <div className="puzzle-intro-layout">
                <section className="menu-window puzzle-start">
                  <h2>Win the endgame</h2>
                  <p>
                    Everyone plays the same position today. You have two cards and three empty
                    spaces. The opponent responds with its best defense.
                  </p>
                  <p>
                    Your timer starts when you reveal the board. The leaderboard ranks first solves
                    by fewest attempts, then total time since the first reveal, including retries.
                    Practising after solving cannot improve this result.
                  </p>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => void act('start', { requestId: crypto.randomUUID() })}
                  >
                    {busy ? 'Starting…' : 'Reveal today’s puzzle'}
                  </button>
                </section>
                {leaderboard}
              </div>
            ) : (
              <div className="puzzle-play-layout">
                <section
                  className="menu-window puzzle-table"
                  aria-label="Daily puzzle board"
                  aria-describedby="puzzle-turn-status"
                >
                  <div className="puzzle-board-space">
                    <div className="puzzle-board">
                      {state.board.map((placed, cell) => (
                        <button
                          className={`puzzle-cell ${!placed && selected ? 'is-legal' : ''}`}
                          data-testid={`puzzle-cell-${cell}`}
                          key={cell}
                          disabled={busy || !!placed || state.status === 'complete' || !selected}
                          aria-label={
                            placed ? `Occupied cell ${cell + 1}` : `Place card in cell ${cell + 1}`
                          }
                          onClick={() => {
                            if (selected)
                              void act('move', { cardId: selected, cell, version: view.version });
                          }}
                        >
                          {placed ? (
                            <Card card={placed.card} owner={placed.owner} />
                          ) : (
                            <span>
                              {String.fromCharCode(65 + Math.floor(cell / 3))}
                              {(cell % 3) + 1}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
                <aside className="puzzle-sidebar">
                  <div className="puzzle-reserves">
                    <section className="menu-window puzzle-reserve">
                      <h2>Your puzzle hand</h2>
                      <div className="puzzle-hand" aria-label="Your puzzle hand">
                        {state.hands[0].map((card) => (
                          <button
                            key={card.id}
                            disabled={busy || state.status === 'complete'}
                            aria-label={`Select ${card.name}`}
                            aria-pressed={selected === card.id}
                            onClick={() => setSelected(card.id)}
                          >
                            <Card card={card} owner={0} />
                          </button>
                        ))}
                        {!state.hands[0].length && <p>No cards remaining.</p>}
                      </div>
                    </section>
                    <section className="menu-window puzzle-reserve">
                      <h2>Opponent’s remaining cards</h2>
                      <div className="puzzle-hand" aria-label="Opponent’s remaining cards">
                        {state.hands[1].map((card) => (
                          <div key={card.id}>
                            <Card card={card} owner={1} />
                          </div>
                        ))}
                        {!state.hands[1].length && <p>No cards remaining.</p>}
                      </div>
                    </section>
                  </div>
                  <section
                    className={`puzzle-outcome menu-window ${view.solved ? 'is-solved' : ''}`}
                  >
                    <h2>{view.solved ? 'Today’s puzzle completed' : 'Your challenge'}</h2>
                    {view.solved && (
                      <p>
                        {view.rewarded
                          ? 'Today’s reward has been claimed.'
                          : 'Your solve is saved. Sign in to claim today’s reward and join the leaderboard.'}
                      </p>
                    )}
                    {view.solved && !view.rewarded && (
                      <button
                        className="primary-button"
                        disabled={busy}
                        onClick={() => (view.registered ? void act('claim') : openAccount())}
                      >
                        {view.registered ? 'Claim 100 Stellar Prisms' : 'Sign in to claim reward'}
                      </button>
                    )}
                    <button
                      className="outline-button"
                      disabled={busy}
                      onClick={() =>
                        void act('start', { restart: true, requestId: crypto.randomUUID() })
                      }
                    >
                      {view.solved
                        ? 'Practise again'
                        : state.status === 'complete'
                          ? 'Try again'
                          : 'Restart attempt'}
                    </button>
                    {!view.solved && (
                      <small>
                        Restarting counts as another attempt. The original timer keeps running.
                      </small>
                    )}
                    <Link className="text-button" href="/">
                      Back to the tavern
                    </Link>
                  </section>
                  {leaderboard}
                </aside>
              </div>
            )}
          </>
        )}
      </div>
    </LocaleView>
  );
}
