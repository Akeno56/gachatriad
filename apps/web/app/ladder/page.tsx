'use client';
import { LocaleView, NoTranslate } from '../../components/i18n';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { LadderEntry } from '@gacha-triad/shared/social';
import { useSession } from '../../components/session';
import { Avatar } from '../../components/avatar';
import { api } from '../../lib/platform';
export default function Ladder() {
  const { profile, revision } = useSession();
  const [mode, setMode] = useState('ranked'),
    [rows, setRows] = useState<LadderEntry[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    if (!profile) return;
    let active = true;
    void api<LadderEntry[]>(`/ladder?mode=${mode}`)
      .then((p) => {
        if (active) {
          setRows(p);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [profile?.id, revision, mode]);
  return (
    <LocaleView>
      <div className="content-page ladder-page">
        <h1>Ladder</h1>
        <label>
          Leaderboard
          <select aria-label="Leaderboard" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="ranked">Constructed ranked</option>
            <option value="draft">Draft</option>
          </select>
        </label>
        <p>
          Registered human players with at least one completed duel in this mode. Rating order;
          fewer than five games is provisional. Bots and suspended accounts are excluded.
        </p>
        <p role="alert">{error}</p>
        <div className="menu-window ladder-table">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Rating</th>
                <th>Games</th>
                <th>Wins</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={p.id === profile?.id ? 'is-self' : ''}>
                  <td>{p.rank}</td>
                  <td>
                    <Link href={`/profile?id=${p.id}`}>
                      <Avatar key={p.avatar?.id ?? p.id} card={p.avatar} name={p.name} />
                      <span>
                        <NoTranslate>{p.name}</NoTranslate>
                        {p.title && <small>{p.title}</small>}
                      </span>
                    </Link>
                  </td>
                  <td>
                    {p.rating}
                    {p.games < 5 && <small>Provisional</small>}
                  </td>
                  <td>{p.games}</td>
                  <td>{p.wins}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p>No ranked results yet.</p>}
        </div>
      </div>
    </LocaleView>
  );
}
