'use client';

import { useEffect, useRef, useState } from 'react';
import { isRatedMode, type ProfileView } from '@gacha-triad/shared/platform';
import { api } from '../lib/platform';
import { matchModeNames } from '../lib/rules';
import { LocaleView } from './i18n';
import { useSession } from './session';
import { Button, GameDialog } from './ui';

export function MatchmakingDock() {
  const { profile } = useSession();
  const waiting = profile?.waitingLobby;
  if (!waiting || profile.activeMatchId || profile.pendingTrade) return null;
  return <WaitingLobby key={waiting.id} waiting={waiting} />;
}

function WaitingLobby({ waiting }: { waiting: NonNullable<ProfileView['waitingLobby']> }) {
  const { error: connectionError, refresh } = useSession();
  const [now, setNow] = useState(Date.now);
  const [practice, setPractice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const rated = isRatedMode(waiting.mode);
  const custom = waiting.mode === 'custom';
  const mode =
    waiting.mode === 'draft' || waiting.mode === 'shared-draft'
      ? `${matchModeNames[waiting.mode]} (Ranked)`
      : matchModeNames[waiting.mode];
  const seconds = Math.max(0, Math.floor((now - Date.parse(waiting.createdAt)) / 1000));
  const elapsed = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function update(enablePractice = false) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      if (enablePractice) await api(`/lobbies/${waiting.id}/practice`, {});
      else await api(`/lobbies/${waiting.id}`, undefined, 'DELETE');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPractice(false);
      await refresh();
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <LocaleView>
      <aside
        className="menu-window matchmaking-dock queue-status"
        aria-label={`${mode} matchmaking queue`}
      >
        <div className="matchmaking-dock-copy">
          <strong>{waiting.invited ? 'Friend invitation' : mode}</strong>
          <small role="status">
            {connectionError
              ? 'Reconnecting…'
              : waiting.invited
                ? 'Waiting for your invited opponent.'
                : custom
                  ? 'Waiting for a player…'
                  : 'Searching for an opponent…'}
          </small>
        </div>
        <span className="queue-elapsed" role="timer" aria-live="off">
          <span className="sr-only">In queue for : </span>
          {elapsed}
        </span>
        {rated && (
          <Button
            variant="ghost"
            className="matchmaking-practice"
            disabled={busy || waiting.allowBots}
            onClick={() => setPractice(true)}
          >
            {waiting.allowBots ? 'Finding a practice bot…' : 'Play a practice bot — no Elo'}
          </Button>
        )}
        <Button
          disabled={busy}
          aria-label={
            waiting.invited ? 'Close waiting lobby' : custom ? 'Close lobby' : `Leave ${mode} queue`
          }
          onClick={() => void update()}
        >
          {custom ? 'Close lobby' : 'Cancel'}
        </Button>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </aside>
      <GameDialog
        open={practice}
        onClose={() => setPractice(false)}
        labelledBy="practice-title"
        dismissible={!busy}
      >
        <h2 id="practice-title">Practice with a bot?</h2>
        <p>Same rules, no Elo. A player may match first.</p>
        <div className="result-actions">
          <Button variant="primary" disabled={busy} onClick={() => void update(true)}>
            Find practice bot
          </Button>
          <Button disabled={busy} onClick={() => setPractice(false)}>
            Keep waiting for a player
          </Button>
        </div>
      </GameDialog>
    </LocaleView>
  );
}
