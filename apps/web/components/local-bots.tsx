'use client';
import { useEffect, useState } from 'react';
import type { PopulationView } from '@gacha-triad/shared/platform';
import { api } from '../lib/platform';
import { useSession } from './session';
export function LocalBots() {
  const { profile, revision, refresh } = useSession();
  const [status, setStatus] = useState<PopulationView | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!profile?.isAdmin) setStatus(null);
    else
      void api<PopulationView>('/local-bots')
        .then((next) => {
          if (active) setStatus(next);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [profile?.id, profile?.isAdmin, revision]);
  if (!profile?.isAdmin || !status?.available) return null;
  return (
    <aside className="menu-window local-bots">
      <div>
        <strong>LOCAL BOT POPULATION {status.enabled ? '· ON' : '· OFF'}</strong>
        <p>
          {status.enabled
            ? `${status.bots} labeled bots · ${status.activeGames} active games. They open tables, play, draft and trade.`
            : 'Populate this local world with labeled bots to try lobbies, games and trades.'}
        </p>
        <small>
          Uses this local save, including card transfers and ratings. Turning off removes their
          waiting tables and offers; bots finish ongoing duels.
        </small>
        {error && <p role="alert">{error}</p>}
      </div>
      <button
        className="outline-button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            setStatus(await api<PopulationView>('/local-bots', { enabled: !status.enabled }));
            await refresh();
            setError('');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? 'Updating…' : status.enabled ? 'Pause population' : 'Populate with bots'}
      </button>
    </aside>
  );
}
