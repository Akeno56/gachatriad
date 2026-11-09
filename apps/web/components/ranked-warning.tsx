'use client';
import { LocaleView } from './i18n';

import { useEffect, useRef, useState } from 'react';
import type { ProfileView } from '@gacha-triad/shared/platform';
import { useSession } from './session';
import { api } from '../lib/platform';
type QueueMode = 'casual' | 'ranked' | 'draft';
const preferenceKey = (id: string, mode: QueueMode) => `triad-hide-rules:${id}:${mode}:v12`;
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
export const confirmUnranked = (profile: ProfileView | null) => confirm('casual', profile);
export function RankedWarning() {
  const { profile, refresh } = useSession(),
    ref = useRef<HTMLDialogElement>(null),
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
  useEffect(() => {
    if (mode) ref.current?.showModal();
  }, [mode]);
  function close(allow: boolean) {
    pending.current?.resolve(allow);
    pending.current = null;
    ref.current?.close();
    setMode(null);
  }
  if (!mode) return null;
  const ranked = mode === 'ranked',
    draft = mode === 'draft';
  return (
    <LocaleView>
      <dialog
        ref={ref}
        className={`game-dialog menu-window mode-rules-dialog ${ranked ? 'ranked-warning' : ''}`}
        aria-labelledby="queue-rules-title"
        onCancel={() => close(false)}
      >
        <h2 id="queue-rules-title">
          {ranked ? 'Ranked rules · Trade One' : draft ? 'Draft rules · Ranked' : 'Unranked rules'}
        </h2>
        <p>
          <strong>{ranked ? 'Closed hands' : 'Three Open'}</strong> · Same · Plus · Combo
        </p>
        <p>
          {ranked
            ? 'Your hand stays hidden until cards are played.'
            : 'Three randomly chosen cards from each starting hand are visible to the opponent.'}{' '}
          Same matches touching numbers; Plus matches sums; both can start Combo chains.
        </p>
        {draft ? (
          <p>
            Three temporary boosters open automatically. Choose five of fifteen cards within the
            deck rarity limit. Draft rating changes only against human players; no card trade. Each
            booster guarantees a 3★+ and a 4★+ card, with 5% Holo. Your temporary cards never enter
            your collection.
          </p>
        ) : ranked ? (
          <>
            <p>
              <strong>If you lose, your opponent takes one card from your played deck.</strong>{' '}
              Trade One also applies on a forfeit. A draw transfers no cards. Losing your last copy
              can leave a deck slot empty.
            </p>
            <p>
              Ranked rating changes only against human players. Opponents are players or Medium/Hard
              bots.
            </p>
          </>
        ) : (
          <p>
            <strong>No card trade and no rating change.</strong> Matchmaking can pair you with a
            player or an available populated bot.
          </p>
        )}
        <p className="error-message" role="alert">
          {error}
        </p>
        <label className="check-label queue-hide-prompt">
          <input
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
            {`Join ${ranked ? 'Ranked' : draft ? 'Draft' : 'Unranked'} queue`}
          </button>
          <button className="outline-button" disabled={busy} onClick={() => close(false)}>
            Cancel
          </button>
        </div>
      </dialog>
    </LocaleView>
  );
}
