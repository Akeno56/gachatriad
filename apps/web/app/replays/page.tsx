'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from '../../components/session';
import { LocaleView, LocalizedDate, NoTranslate } from '../../components/i18n';
import { Button } from '../../components/ui';
import { BotStyle } from '../../components/bot-style';
import { ReplayPlayer } from '../../components/replay-player';
import { api } from '../../lib/platform';
import type { ReplayList, ReplayView } from '@gacha-triad/shared/replays';
const modes = [
  ['all', 'All modes'],
  ['solo', 'Practice'],
  ['casual', 'Unranked'],
  ['ranked', 'Ranked'],
  ['ranked-random', 'Ranked Random'],
  ['draft', 'Draft'],
  ['shared-draft', 'Shared Draft'],
  ['custom', 'Custom'],
  ['roulette', 'Roulette'],
];
export default function ReplaysPage() {
  return (
    <Suspense
      fallback={
        <LocaleView>
          <p>Loading replays…</p>
        </LocaleView>
      }
    >
      <Replays />
    </Suspense>
  );
}
function Replays() {
  const { profile } = useSession(),
    params = useSearchParams();
  const match = params.get('match');
  const [mode, setMode] = useState('all'),
    [favorites, setFavorites] = useState(false),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    list?: ReplayList;
    replay?: ReplayView;
  } | null>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const key = JSON.stringify([profile?.id, match, mode, favorites, offset, revision]);
  const current = snapshot?.key === key ? snapshot : null;
  useEffect(() => {
    if (!profile) return;
    let active = true;
    setError('');
    const path = match
      ? `/replays/${encodeURIComponent(match)}`
      : `/replays?mode=${mode}&favorites=${favorites}&offset=${offset}`;
    void api<ReplayView | ReplayList>(path)
      .then((value) => {
        if (
          active &&
          !match &&
          !(value as ReplayList).rows.length &&
          offset > 0 &&
          (value as ReplayList).total <= offset
        ) {
          setOffset(Math.max(0, Math.floor(((value as ReplayList).total - 1) / 20) * 20));
        } else if (active)
          setSnapshot(
            match ? { key, replay: value as ReplayView } : { key, list: value as ReplayList },
          );
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [key, profile?.id, match]);
  async function favorite(id: string, value: boolean) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/replays/${encodeURIComponent(id)}/favorite`, { favorite: value });
      setSnapshot((s) =>
        !s || s.key !== key
          ? s
          : s.replay
            ? { ...s, replay: { ...s.replay, favorite: value } }
            : {
                ...s,
                list: {
                  ...s.list!,
                  rows: s.list!.rows.map((r) => (r.id === id ? { ...r, favorite: value } : r)),
                },
              },
      );
      if (!match && favorites && !value) setRevision((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <LocaleView>
      <div className={`content-page replays-page ${match ? 'has-replay' : ''}`}>
        <header className="replays-heading">
          <h1>Replays</h1>
          <div>
            {match && (
              <Link className="outline-button" href="/replays">
                All replays
              </Link>
            )}
            <Link className="outline-button" href="/">
              Back to play
            </Link>
          </div>
        </header>
        {error && (
          <div className="replay-error" role="alert">
            {error}
            <Button variant="ghost" onClick={() => setRevision((n) => n + 1)}>
              Try again
            </Button>
          </div>
        )}
        {match ? (
          current?.replay ? (
            <ReplayPlayer
              replay={current.replay}
              favoriteBusy={busy}
              onFavorite={() => void favorite(match, !current.replay!.favorite)}
            />
          ) : (
            !error && <p role="status">Loading replay…</p>
          )
        ) : (
          <>
            <div className="menu-window replay-filters">
              <label>
                Mode
                <select
                  name="replay-mode"
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value);
                    setOffset(0);
                  }}
                >
                  {modes.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="replay-favorite-filter">
                <input
                  type="checkbox"
                  name="replay-favorites"
                  checked={favorites}
                  onChange={(e) => {
                    setFavorites(e.target.checked);
                    setOffset(0);
                  }}
                />
                Favourites only
              </label>
              <Button variant="ghost" onClick={() => setRevision((n) => n + 1)}>
                Refresh
              </Button>
            </div>
            {!current?.list ? (
              !error && <p role="status">Loading replays…</p>
            ) : (
              <>
                <p className="replay-count" role="status">
                  {current.list.total === 1 ? '1 replay' : `${current.list.total} replays`}
                </p>
                <div className="replay-list">
                  {current.list.rows.map((row) => (
                    <article className="menu-window replay-entry" key={row.id}>
                      <div className="replay-entry-main">
                        <strong>
                          <NoTranslate>{row.opponent.name}</NoTranslate>
                        </strong>
                        <BotStyle style={row.opponent.botStyle} />
                        <small>
                          {modes.find(([id]) => id === row.mode)?.[1]} ·{' '}
                          <LocalizedDate value={row.completedAt} format="datetime" />
                        </small>
                      </div>
                      <div className={`replay-entry-result result-${row.result}`}>
                        <b>
                          {row.result === 'win' ? 'Win' : row.result === 'loss' ? 'Loss' : 'Draw'}
                        </b>
                        <span>{row.score.join(' – ')}</span>
                        <small>
                          {row.ratingDelta === null
                            ? 'Unrated'
                            : `${row.ratingDelta >= 0 ? '+' : ''}${row.ratingDelta} Elo`}
                        </small>
                      </div>
                      <div className="replay-entry-actions">
                        <Button
                          disabled={busy}
                          aria-pressed={row.favorite}
                          aria-label={row.favorite ? 'Remove favourite' : 'Add favourite'}
                          onClick={() => void favorite(row.id, !row.favorite)}
                        >
                          {row.favorite ? '★' : '☆'}
                        </Button>
                        <Link
                          className="primary-button"
                          href={`/replays?match=${encodeURIComponent(row.id)}`}
                        >
                          Watch replay
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
                {!current.list.rows.length && (
                  <p className="replay-empty">
                    {favorites ? 'No favourite replays.' : 'No completed matches.'}
                  </p>
                )}
                <nav className="replay-pagination" aria-label="Replay pages">
                  <Button disabled={!offset} onClick={() => setOffset((n) => Math.max(0, n - 20))}>
                    Previous
                  </Button>
                  <span>
                    {Math.floor(offset / 20) + 1} /{' '}
                    {Math.max(1, Math.ceil(current.list.total / 20))}
                  </span>
                  <Button
                    disabled={offset + 20 >= current.list.total}
                    onClick={() => setOffset((n) => n + 20)}
                  >
                    Next
                  </Button>
                </nav>
              </>
            )}
          </>
        )}
      </div>
    </LocaleView>
  );
}
