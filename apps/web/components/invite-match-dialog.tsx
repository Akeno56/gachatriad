'use client';

import { useId, useRef, useState } from 'react';
import { UNRANKED_RULES, type Rules } from '@gacha-triad/engine';
import { CORRESPONDENCE_HOURS, type CorrespondenceHours } from '@gacha-triad/shared/platform';
import { api } from '../lib/platform';
import { useSession } from './session';
import { useActionNotice } from './action-notice';
import { LocaleView, NoTranslate } from './i18n';
import { MatchRules, type MatchRulesPreset } from './rule-options';
import { Button, GameDialog } from './ui';

export function InviteMatchDialog({
  player,
  preferCorrespondence = false,
  onClose,
  onSent,
}: {
  player: { id: string; name: string };
  preferCorrespondence?: boolean;
  onClose: () => void;
  onSent?: () => void;
}) {
  const { profile, refresh, refreshSocial } = useSession();
  const notice = useActionNotice();
  const liveBlocked = !!(
    profile?.activeMatchId ||
    profile?.waitingLobbyId ||
    profile?.pendingTrade
  );
  const [mode, setMode] = useState(preferCorrespondence || liveBlocked ? 'correspondence' : 'live');
  const [hours, setHours] = useState<CorrespondenceHours>(48);
  const [preset, setPreset] = useState<MatchRulesPreset>('standard');
  const [rules, setRules] = useState<Rules>(UNRANKED_RULES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const locked = useRef(false);
  const live = mode === 'live';
  return (
    <GameDialog
      open
      onClose={onClose}
      labelledBy={headingId}
      className="social-invite-dialog"
      initialFocus={heading}
      dismissible={!busy}
    >
      <LocaleView>
        <h2 id={headingId} ref={heading} tabIndex={-1}>
          Invite to play
        </h2>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (locked.current || (live && liveBlocked)) return;
            locked.current = true;
            setBusy(true);
            setError('');
            try {
              await api('/invites', {
                playerId: player.id,
                rules,
                ...(live ? {} : { turnHours: hours }),
              });
              refreshSocial();
              await refresh();
              notice('Invitation sent.');
              onClose();
              onSent?.();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              locked.current = false;
              setBusy(false);
            }
          }}
        >
          <p>
            <NoTranslate>{player.name}</NoTranslate>
          </p>
          <div className="invite-match-fields">
            <label>
              Match type
              <select
                name="inviteMode"
                value={mode}
                disabled={busy}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="live" disabled={liveBlocked}>
                  Live duel
                </option>
                <option value="correspondence">Correspondence</option>
              </select>
            </label>
            {!live && (
              <label>
                Hours per turn
                <select
                  name="turnHours"
                  value={hours}
                  disabled={busy}
                  onChange={(event) => {
                    const selected = CORRESPONDENCE_HOURS.find(
                      (value) => value === Number(event.target.value),
                    );
                    if (selected) setHours(selected);
                  }}
                >
                  {CORRESPONDENCE_HOURS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <MatchRules
            preset={preset}
            onPreset={setPreset}
            rules={rules}
            onChange={setRules}
            disabled={busy}
          />
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={live && liveBlocked} busy={busy}>
            Send invitation
          </Button>
        </form>
      </LocaleView>
    </GameDialog>
  );
}
