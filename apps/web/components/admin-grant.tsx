'use client';
import { LocaleView, NoTranslate } from './i18n';

import { useRef, useState } from 'react';
import { ACHIEVEMENTS } from '@gacha-triad/shared/platform';
import { COSMETIC_SETS } from '@gacha-triad/shared/customization';
import { useSession } from './session';
import { api } from '../lib/platform';
export function AdminGrant({ playerId, name }: { playerId: string; name: string }) {
  const { profile, refresh } = useSession(),
    [kind, setKind] = useState('prisms'),
    [achievementId, setAchievementId] = useState<string>(COSMETIC_SETS[0].achievementId),
    [amount, setAmount] = useState(150),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const pending = useRef<{ signature: string; id: string } | null>(null);
  if (!profile?.isAdmin) return null;
  const selectedKind =
    kind === 'achievement' && !profile.achievementGrantsEnabled ? 'prisms' : kind;
  return (
    <LocaleView>
      <details className="menu-window admin-grant">
        <summary>
          Admin testing grants · <NoTranslate>{name}</NoTranslate>
        </summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              if (selectedKind === 'achievement') {
                const result = await api<{ granted: boolean }>('/admin/achievement-grants', {
                  profileId: playerId,
                  achievementId,
                });
                setMessage(
                  result.granted ? 'Achievement granted.' : 'Achievement already unlocked.',
                );
              } else {
                const body = { profileId: playerId, kind: selectedKind, amount },
                  signature = JSON.stringify(body);
                if (pending.current?.signature !== signature)
                  pending.current = { signature, id: crypto.randomUUID() };
                await api('/admin/grants', { ...body, requestId: pending.current.id });
                pending.current = null;
                setMessage(
                  `Granted ${amount} ${selectedKind === 'prisms' ? 'Stellar Prisms' : 'boosters'} to ${name}.`,
                );
              }
              await refresh();
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Grant
            <select
              name="admin-grant-select-1"
              value={selectedKind}
              onChange={(e) => {
                setKind(e.target.value);
                setAmount(e.target.value === 'prisms' ? 150 : 3);
              }}
            >
              <option value="prisms">Stellar Prisms</option>
              <option value="boosters">Universe I boosters</option>
              {profile.achievementGrantsEnabled && <option value="achievement">Achievement</option>}
            </select>
          </label>
          {selectedKind === 'achievement' ? (
            <label>
              Achievement
              <select
                name="admin-grant-achievement"
                value={achievementId}
                onChange={(e) => setAchievementId(e.target.value)}
              >
                {ACHIEVEMENTS.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Amount
              <input
                name="admin-grant-input-2"
                type="number"
                min="1"
                max={selectedKind === 'prisms' ? 1000000 : 100}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
              />
            </label>
          )}
          <button className="outline-button" disabled={busy}>
            Grant to <NoTranslate>{name}</NoTranslate>
          </button>
        </form>
        <p role="status">{message}</p>
      </details>
    </LocaleView>
  );
}
