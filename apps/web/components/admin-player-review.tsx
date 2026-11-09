'use client';
import { useEffect, useState } from 'react';
import type { Card as CardData } from '@gacha-triad/engine';
import { useSession } from './session';
import { api } from '../lib/platform';
import { Card } from './card';
import { NoTranslate, LocalizedDate } from './i18n';
import { usePageRefresh } from './use-page-refresh';
interface History {
  total: number;
  rows: {
    id: string;
    opponent: string;
    mode: string;
    result: string;
    completed_at: string;
    end_reason: string | null;
    before_rating: number | null;
    after_rating: number | null;
  }[];
  pairs: {
    opponent_id: string;
    opponent: string;
    mode: string;
    games: number;
    wins: number;
    losses: number;
    draws: number;
    longest_win_streak: number;
  }[];
}
export function AdminPlayerReview({ playerId }: { playerId: string }) {
  const { profile } = useSession();
  const [revision, refreshReview] = usePageRefresh();
  const [history, setHistory] = useState<History | null>(null),
    [offset, setOffset] = useState(0),
    [collection, setCollection] = useState<
      { id: string; quantity: number; reserved: number; card: CardData }[] | null
    >(null),
    [section, setSection] = useState<'history' | 'collection'>('history'),
    [error, setError] = useState('');
  useEffect(() => {
    setOffset(0);
    setHistory(null);
    setCollection(null);
  }, [playerId]);
  useEffect(() => {
    if (!profile?.isAdmin) return;
    let valid = true;
    const path = section === 'history' ? `history?offset=${offset}` : 'collection';
    void api<History | typeof collection>(`/admin/players/${playerId}/${path}`)
      .then((data) => {
        if (!valid) return;
        if (section === 'history') setHistory(data as History);
        else setCollection(data as typeof collection);
        setError('');
      })
      .catch((e) => valid && setError(e.message));
    return () => {
      valid = false;
    };
  }, [playerId, profile?.id, profile?.isAdmin, revision, offset, section]);
  if (!profile?.isAdmin) return null;
  return (
    <section className="menu-window admin-player-review">
      <h2>Administrator review</h2>
      <button className="text-button" onClick={refreshReview}>
        Refresh
      </button>
      <div className="ladder-tabs" role="tablist" aria-label="Administrator review">
        <button
          role="tab"
          aria-selected={section === 'history'}
          onClick={() => setSection('history')}
        >
          Battle history
        </button>
        <button
          role="tab"
          aria-selected={section === 'collection'}
          onClick={() => setSection('collection')}
        >
          Collection
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {section === 'history' && history && (
        <>
          <p>
            {history.total} completed games. Repeated wins are a review signal, not proof of win
            trading.
          </p>
          <div className="admin-history-table">
            <table>
              <thead>
                <tr>
                  <th>Opponent</th>
                  <th>Mode</th>
                  <th>Games</th>
                  <th>W / D / L</th>
                  <th>Longest win streak</th>
                </tr>
              </thead>
              <tbody>
                {history.pairs.map((p) => (
                  <tr key={`${p.opponent_id}-${p.mode}`}>
                    <td>
                      <NoTranslate>{p.opponent}</NoTranslate>
                    </td>
                    <td>{p.mode}</td>
                    <td>{p.games}</td>
                    <td>
                      {p.wins} / {p.draws} / {p.losses}
                    </td>
                    <td>{p.longest_win_streak}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-history-table">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Opponent</th>
                  <th>Mode</th>
                  <th>Result</th>
                  <th>Rating</th>
                  <th>Finish</th>
                </tr>
              </thead>
              <tbody>
                {history.rows.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <LocalizedDate value={g.completed_at} />
                    </td>
                    <td>
                      <NoTranslate>{g.opponent}</NoTranslate>
                    </td>
                    <td>{g.mode}</td>
                    <td>{g.result}</td>
                    <td>
                      {g.before_rating === null
                        ? 'Not recorded'
                        : `${g.before_rating} → ${g.after_rating}`}
                    </td>
                    <td>{g.end_reason || 'Completed'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="result-actions">
            <button
              className="outline-button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 100))}
            >
              Previous
            </button>
            <button
              className="outline-button"
              disabled={offset + 100 >= history.total}
              onClick={() => setOffset(offset + 100)}
            >
              Next
            </button>
          </div>
        </>
      )}
      {section === 'collection' && collection && (
        <div className="admin-collection-grid">
          {collection.map((i) => (
            <article key={i.id}>
              <Card card={i.card} showElement />
              <p>
                <NoTranslate>{i.card.name}</NoTranslate> · ×{i.quantity} · {i.reserved} reserved
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
