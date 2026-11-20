'use client';
import { LocaleView } from './i18n';

import { useEffect, useRef, useState } from 'react';
import { RANKED_RULES, UNRANKED_RULES } from '@gacha-triad/engine';
import { isRankedMode, type ProfileView, type RatedMode } from '@gacha-triad/shared/platform';
import { useSession } from './session';
import { api } from '../lib/platform';
import { GameDialog } from './ui';
import { matchModeNames, ruleNames } from '../lib/rules';
export type QueueMode = 'casual' | RatedMode;
const preferenceKey = (id: string, mode: QueueMode) =>
  `triad-hide-rules:${id}:${mode}:${isRankedMode(mode) ? 'v24' : 'v14'}`;
type Request = { mode: QueueMode; resolve: (allow: boolean) => void };
export function confirmQueueRules(mode: QueueMode, profile: ProfileView | null): Promise<boolean> {
  if (!profile || (mode !== 'casual' && !profile.registered)) return Promise.resolve(false);
  try {
    if (
      localStorage.getItem(preferenceKey(profile.id, mode)) === 'on' &&
      (!isRankedMode(mode) || profile.rankedAcknowledged)
    )
      return Promise.resolve(true);
  } catch {}
  return new Promise((resolve) =>
    window.dispatchEvent(
      new CustomEvent<Request>('triad:queue-rules', { detail: { mode, resolve } }),
    ),
  );
}
const queueTitles: Record<QueueMode, string> = {
  casual: 'Unranked rules',
  ranked: 'Ranked rules',
  'ranked-random': 'Ranked Random rules',
  draft: 'Draft rules · Ranked',
  'shared-draft': 'Shared Draft rules · Ranked',
};
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
  const ranked = isRankedMode(mode),
    draft = mode === 'draft',
    shared = mode === 'shared-draft';
  const rules = ranked
    ? { ...RANKED_RULES, random: mode === 'ranked-random' }
    : shared
      ? { ...UNRANKED_RULES, allOpen: true, threeOpen: false }
      : UNRANKED_RULES;
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
          {queueTitles[mode]}
        </h2>
        <div className="rule-badges queue-rule-badges">
          {ruleNames(rules).map((rule) => (
            <span key={rule}>{rule}</span>
          ))}
        </div>
        <ul className="queue-rule-list">
          {mode === 'ranked-random' && (
            <li>A legal deck is drawn from your collection each match.</li>
          )}
          {draft && <li>Open 3 private boosters and pick 5 cards.</li>}
          {shared && <li>Alternate picks from 20 shared cards. 45 seconds per pick.</li>}
          <li>
            {mode === 'casual'
              ? 'No Elo or card loss.'
              : 'Player matches change Elo. No card loss.'}
          </li>
          <li>60 seconds per turn. Two missed turns in a row forfeit.</li>
        </ul>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
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
            {`Join ${matchModeNames[mode]} queue`}
          </button>
          <button className="outline-button" disabled={busy} onClick={() => close(false)}>
            Cancel
          </button>
        </div>
      </GameDialog>
    </LocaleView>
  );
}
