'use client';
import { LocaleView } from './i18n';

import { useEffect, useRef, useState } from 'react';
import type { ProfileView } from '@gacha-triad/shared/platform';
import { useSession } from './session';
import { api } from '../lib/platform';
import { GameDialog } from './ui';
type QueueMode = 'casual' | 'ranked' | 'draft' | 'shared-draft';
const preferenceKey = (id: string, mode: QueueMode) => `triad-hide-rules:${id}:${mode}:v14`;
type Request = { mode: QueueMode; resolve: (allow: boolean) => void };
function confirm(mode: QueueMode, profile: ProfileView | null): Promise<boolean> {
  if (!profile || (mode !== 'casual' && !profile.registered)) return Promise.resolve(false);
  try {
    if (
      localStorage.getItem(preferenceKey(profile.id, mode)) === 'on' &&
      (mode !== 'ranked' || profile.rankedAcknowledged)
    )
      return Promise.resolve(true);
  } catch {}
  return new Promise((resolve) =>
    window.dispatchEvent(
      new CustomEvent<Request>('triad:queue-rules', { detail: { mode, resolve } }),
    ),
  );
}
export const confirmRanked = (profile: ProfileView | null) => confirm('ranked', profile);
export const confirmDraft = (profile: ProfileView | null) => confirm('draft', profile);
export const confirmSharedDraft = (profile: ProfileView | null) => confirm('shared-draft', profile);
export const confirmUnranked = (profile: ProfileView | null) => confirm('casual', profile);
export function RankedWarning() {
  const { profile, refresh } = useSession(),
    heading = useRef<HTMLHeadingElement>(null),
    pending = useRef<Request | null>(null);
  const [mode, setMode] = useState<QueueMode | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [hideAgain, setHideAgain] = useState(false);
  useEffect(() => {
    const request = (event: Event) => {
      pending.current?.resolve(false);
      pending.current = (event as CustomEvent<Request>).detail;
      setMode(pending.current.mode);
      setError('');
      setHideAgain(false);
    };
    window.addEventListener('triad:queue-rules', request);
    return () => {
      window.removeEventListener('triad:queue-rules', request);
      pending.current?.resolve(false);
    };
  }, []);
  function close(allow: boolean) {
    pending.current?.resolve(allow);
    pending.current = null;
    setMode(null);
  }
  if (!mode) return null;
  const ranked = mode === 'ranked',
    draft = mode === 'draft',
    shared = mode === 'shared-draft';
  return (
    <LocaleView>
      <GameDialog
        key={mode}
        open
        labelledBy="queue-rules-title"
        initialFocus={heading}
        onClose={() => close(false)}
        dismissible={!busy}
        className={`mode-rules-dialog ${ranked ? 'ranked-warning' : ''}`}
      >
        <h2 id="queue-rules-title" ref={heading} tabIndex={-1}>
          {ranked
            ? 'Ranked rules · No card loss'
            : shared
              ? 'Shared Draft rules · Ranked'
              : draft
                ? 'Draft rules · Ranked'
                : 'Unranked rules'}
        </h2>
        <p>
          <strong>{ranked ? 'Closed hands' : shared ? 'All Open' : 'Three Open'}</strong> · Same ·
          Plus · Combo
        </p>
        <p>
          {ranked
            ? 'Your hand stays hidden until cards are played.'
            : shared
              ? 'Draft picks are public, so both complete hands stay visible in battle.'
              : 'Three randomly chosen cards from each starting hand are visible to the opponent.'}{' '}
          Same matches touching numbers; Plus matches sums; both can start Combo chains.
        </p>
        {shared ? (
          <p>
            Four temporary boosters form one shared pool of 20 different cards. Both players finish
            opening, then take turns picking five cards each within the rarity limit. Each pick
            allows 45 seconds. Shared Draft rating changes only against human players. No card
            trade; temporary cards never enter your collection. Each booster guarantees a 3★+ and a
            4★+ card, with 5% Holo. Shared pools contain at least ten cards of 3★ or lower so both
            players can finish legal hands.
          </p>
        ) : draft ? (
          <p>
            Open three private temporary boosters, then choose five of your 15 cards within the
            rarity limit. Your opponent has a separate pool. Draft has its own Elo rating for human
            matches. No card trade; temporary cards never enter your collection.
          </p>
        ) : ranked ? (
          <>
            <p>
              <strong>No card loss in Ranked.</strong> Win or lose, your collection and saved deck
              stay intact. Trade One remains available in custom games when both players choose to
              stake cards.
            </p>
            <p>
              The queue searches for human players. You can choose a practice bot while waiting;
              practice games do not change Elo.
            </p>
          </>
        ) : (
          <p>
            <strong>No card trade and no rating change.</strong> Matchmaking can pair you with a
            player or an available populated bot.
          </p>
        )}
        <p>
          Turns last 60 seconds. Your first missed turn auto-plays one card. Miss your next turn too
          and you lose immediately. Playing manually resets the warning. Disconnecting for 120
          seconds also forfeits.
        </p>
        <p className="error-message" role="alert">
          {error}
        </p>
        <label className="check-label queue-hide-prompt">
          <input
            name="ranked-warning-input-1"
            type="checkbox"
            checked={hideAgain}
            onChange={(e) => setHideAgain(e.target.checked)}
          />{' '}
          Don’t show me again
        </label>
        <div className="result-actions">
          <button
            className="primary-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (ranked && !profile?.rankedAcknowledged) {
                  await api('/ranked/acknowledge', { acknowledged: true });
                  await refresh();
                }
                if (hideAgain && profile) {
                  try {
                    localStorage.setItem(preferenceKey(profile.id, mode), 'on');
                  } catch {}
                }
                close(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {`Join ${ranked ? 'Ranked' : shared ? 'Shared Draft' : draft ? 'Draft' : 'Unranked'} queue`}
          </button>
          <button className="outline-button" disabled={busy} onClick={() => close(false)}>
            Cancel
          </button>
        </div>
      </GameDialog>
    </LocaleView>
  );
}
