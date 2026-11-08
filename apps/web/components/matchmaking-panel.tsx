'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSession } from './session';
import { api } from '../lib/platform';
import { confirmRanked, confirmUnranked, confirmDraft } from './ranked-warning';
export function MatchmakingPanel({
  onMatch,
  onRules,
  onTutorial,
  onCombo,
}: {
  onMatch: (id: string) => void;
  onRules: () => void;
  onTutorial: () => void;
  onCombo: () => void;
}) {
  const { profile, refresh } = useSession();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [now, setNow] = useState(Date.now());
  const lock = useRef(false),
    waiting = profile?.waitingLobby;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function queue(mode: 'casual' | 'ranked' | 'draft') {
    if (lock.current) return;
    lock.current = true;
    setError('');
    try {
      if (
        !(await (mode === 'ranked'
          ? confirmRanked(profile)
          : mode === 'draft'
            ? confirmDraft(profile)
            : confirmUnranked(profile)))
      )
        return;
      setBusy(true);
      const result = await api<{ matchId: string | null }>('/lobbies', { mode, allowBots: true });
      await refresh();
      if (result.matchId) onMatch(result.matchId);
    } catch (e) {
      setError((e as Error).message);
      await refresh();
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function leave() {
    if (!waiting || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await api(`/lobbies/${waiting.id}`, undefined, 'DELETE');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await refresh();
      setBusy(false);
      lock.current = false;
    }
  }
  const seconds = waiting
    ? Math.max(0, Math.floor((now - new Date(waiting.createdAt).getTime()) / 1000))
    : 0;
  const elapsed = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <section className="setup-panel menu-window matchmaking-panel" aria-label="Match setup">
      <h2 className="window-label">Play a game</h2>
      {(['casual', 'ranked', 'draft'] as const).map((mode) => {
        const ranked = mode !== 'casual',
          label = mode === 'draft' ? 'Draft (Ranked)' : ranked ? 'Ranked' : 'Unranked',
          action = mode === 'draft' ? 'Start Draft (Ranked)' : `Start match (${label})`,
          own = waiting?.mode === mode;
        return (
          <div className={`matchmaking-row ${own ? 'is-queued' : ''}`} key={mode}>
            <button
              className={
                ranked ? 'outline-button ranked-play-button' : 'primary-button start-button'
              }
              disabled={
                busy ||
                !profile ||
                !!profile.pendingTrade ||
                !!profile.activeMatchId ||
                !!profile.waitingLobbyId ||
                (mode !== 'draft' && profile.deck.length !== 5) ||
                (ranked && !profile.registered)
              }
              onClick={() => void queue(mode)}
              aria-label={own ? `${label} matchmaking queue` : action}
            >
              {own ? (
                <span role="timer" aria-live="off">
                  In queue for : {elapsed}
                </span>
              ) : (
                action
              )}
            </button>
            {own && (
              <button
                className="queue-cancel"
                disabled={busy}
                onClick={() => void leave()}
                aria-label={`Leave ${label} queue`}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      <Link className="outline-button lobby-shortcut" href="/lobbies">
        Browse lobbies
      </Link>
      {waiting && !['casual', 'ranked', 'draft'].includes(waiting.mode) && (
        <p className="waiting-other-lobby">
          {waiting.invited ? 'Waiting for your invited opponent.' : 'You have a waiting lobby.'}{' '}
          <button
            className="queue-cancel"
            disabled={busy}
            onClick={() => void leave()}
            aria-label="Close waiting lobby"
          >
            ×
          </button>
        </p>
      )}
      {profile && profile.deck.length !== 5 && (
        <p className="deck-warning" role="status">
          Your active deck has {profile.deck.length}/5 cards.{' '}
          <Link href="/collection">Complete your deck in Collection</Link> before playing.
        </p>
      )}
      {!profile?.registered && (
        <p className="queue-account-note">An account is required for Ranked.</p>
      )}
      <div className="setup-secondary">
        <button className="text-button" onClick={onTutorial}>
          How to play
        </button>
        <button className="text-button" onClick={onRules}>
          Rulebook
        </button>
        <button className="text-button" onClick={onCombo}>
          Combo lesson
        </button>
      </div>
      <p className="error-message" role="alert">
        {error}
      </p>
    </section>
  );
}
