'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { GameState } from '@gacha-triad/engine';
import {
  bestPuzzleMove,
  puzzleReview,
  type ArchivedPuzzle,
  type PuzzleArchivePage,
} from '@gacha-triad/shared/puzzle';
import { LocalizedDate, LocaleView, NoTranslate } from '../../../components/i18n';
import { cellName, PracticePosition } from '../../../components/practice-position';
import { useSession } from '../../../components/session';
import { Button } from '../../../components/ui';
import { api } from '../../../lib/platform';

function archiveLink(day?: string | null, before?: string | null) {
  const query = new URLSearchParams();
  if (day) query.set('day', day);
  if (before) query.set('before', before);
  return `/puzzle/archive/${query.size ? `?${query}` : ''}`;
}

function PuzzleDate({ day }: { day: string }) {
  return (
    <LocalizedDate value={`${day}T00:00:00Z`} options={{ dateStyle: 'long', timeZone: 'UTC' }} />
  );
}

function FirstMoveReview({ initial }: { initial: GameState }) {
  const [review, setReview] = useState<ReturnType<typeof puzzleReview>>();
  return (
    <LocaleView>
      <details
        className="menu-window puzzle-first-move"
        onToggle={(event) => {
          if (event.currentTarget.open && review === undefined) setReview(puzzleReview(initial));
        }}
      >
        <summary>First-move review</summary>
        {review === null && <p>No winning line available.</p>}
        {review && (
          <>
            <p>Winning line against best defense</p>
            <ol>
              {review.line.map(({ move }) => (
                <li key={move.cell}>
                  <span>{move.player === 0 ? 'You' : 'Opponent'}</span>
                  <NoTranslate>
                    {initial.hands[move.player].find((card) => card.id === move.cardId)?.name}
                    {' · '}
                    {cellName(move.cell)}
                  </NoTranslate>
                </li>
              ))}
            </ol>
            <p>
              <span>Final score</span> <strong>{review.score.join(' – ')}</strong>
            </p>
            {review.alternative && (
              <div className="puzzle-alternative">
                <strong>Best nonwinning opener</strong>
                <p>
                  <NoTranslate>
                    {
                      initial.hands[0].find((card) => card.id === review.alternative?.move.cardId)
                        ?.name
                    }
                    {' · '}
                    {cellName(review.alternative.move.cell)}
                  </NoTranslate>
                </p>
                <p>
                  <span>Final score against best defense</span>{' '}
                  <strong>
                    {review.alternative.value} – {10 - review.alternative.value}
                  </strong>
                </p>
              </div>
            )}
          </>
        )}
      </details>
    </LocaleView>
  );
}

function Archive() {
  const { profile } = useSession();
  const params = useSearchParams();
  const day = params.get('day');
  const before = params.get('before');
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<
    { key: string; data: PuzzleArchivePage | ArchivedPuzzle } | { key: string; error: string }
  >();
  const profileId = profile?.id;
  const key = JSON.stringify([profileId, day, before, retry]);
  useEffect(() => {
    if (!profileId) return;
    let active = true;
    const path = day
      ? `/puzzles/archive/${encodeURIComponent(day)}`
      : `/puzzles/archive${before ? `?before=${encodeURIComponent(before)}` : ''}`;
    void api<PuzzleArchivePage | ArchivedPuzzle>(path)
      .then((data) => {
        if (active) setResult({ key, data });
      })
      .catch((error: Error) => {
        if (active) setResult({ key, error: error.message });
      });
    return () => {
      active = false;
    };
  }, [key, profileId, day, before]);
  const current = result?.key === key ? result : undefined;
  const data = current && 'data' in current ? current.data : null;
  return (
    <LocaleView>
      <div className="content-page puzzle-archive">
        <header className="practice-heading">
          <div>
            <h1>{data && 'day' in data ? <PuzzleDate day={data.day} /> : 'Puzzle archive'}</h1>
            <p>{day ? 'Practice puzzle · Same · Plus · Combo · All Open' : 'Past daily puzzles'}</p>
          </div>
          <nav aria-label="Puzzle navigation">
            {day && (
              <Link className="outline-button" href={archiveLink(null, before)}>
                Puzzle archive
              </Link>
            )}
            <Link className="outline-button" href="/puzzle">
              Today’s puzzle
            </Link>
          </nav>
        </header>
        {!current && <p role="status">Loading puzzle archive…</p>}
        {current && 'error' in current && (
          <div>
            <p className="error-message" role="alert">
              {current.error}
            </p>
            <Button onClick={() => setRetry((value) => value + 1)}>Try again</Button>
          </div>
        )}
        {data && 'days' in data && (
          <>
            {data.days.length ? (
              <ul className="puzzle-archive-days">
                {data.days.map((date) => (
                  <li key={date}>
                    <Link className="outline-button" href={archiveLink(date, before)}>
                      <time dateTime={date}>
                        <PuzzleDate day={date} />
                      </time>
                      <span aria-hidden="true">▶</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No archived puzzles yet.</p>
            )}
            <div className="puzzle-archive-pagination">
              {before && (
                <Link className="outline-button" href={archiveLink()}>
                  Latest puzzles
                </Link>
              )}
              {data.nextBefore && (
                <Link className="outline-button" href={archiveLink(null, data.nextBefore)}>
                  Older puzzles
                </Link>
              )}
            </div>
          </>
        )}
        {data && 'state' in data && (
          <PracticePosition
            key={data.day}
            initial={data.state}
            respond={bestPuzzleMove}
            restartLabel="Restart puzzle"
          >
            <FirstMoveReview initial={data.state} />
          </PracticePosition>
        )}
      </div>
    </LocaleView>
  );
}

export default function PuzzleArchive() {
  return (
    <Suspense
      fallback={
        <LocaleView>
          <p role="status">Loading puzzle archive…</p>
        </LocaleView>
      }
    >
      <Archive />
    </Suspense>
  );
}
