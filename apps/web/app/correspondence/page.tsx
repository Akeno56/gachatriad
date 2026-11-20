'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CorrespondenceMatch } from '@gacha-triad/shared/platform';
import { LocaleView, LocalizedDate, NoTranslate } from '../../components/i18n';
import { useSession } from '../../components/session';
import { api } from '../../lib/platform';

const outcomes = { win: 'Victory', loss: 'Defeat', draw: 'Draw' } as const;
export default function Correspondence() {
  const { profile, revision, error: connectionError } = useSession();
  const [list, setList] = useState<{ owner: string; rows: CorrespondenceMatch[] } | null>(null);
  const [error, setError] = useState('');
  const profileId = profile?.registered ? profile.id : null;
  const matches = list && list.owner === profileId ? list.rows : null;
  useEffect(() => {
    if (!profileId) return;
    let current = true;
    void api<CorrespondenceMatch[]>('/correspondence').then(
      (rows) => {
        if (!current) return;
        setList({ owner: profileId, rows });
        setError('');
      },
      (e: Error) => {
        if (current) setError(e.message);
      },
    );
    return () => {
      current = false;
    };
  }, [profileId, revision]);

  return (
    <LocaleView>
      <main className="content-page correspondence-page">
        <header className="correspondence-header">
          <h1>Correspondence</h1>
          <Link className="outline-button" href="/">
            Back to play
          </Link>
        </header>
        {!error &&
          (profileId ? (
            matches ? (
              matches.length ? (
                <ul className="correspondence-list">
                  {matches.map((match) => (
                    <li
                      className="menu-window correspondence-row"
                      key={match.id}
                      data-your-turn={match.yourTurn}
                    >
                      <strong>
                        <NoTranslate>{match.opponent}</NoTranslate>
                      </strong>
                      <span>
                        {match.outcome
                          ? outcomes[match.outcome]
                          : match.yourTurn
                            ? 'Your turn'
                            : 'Opponent’s turn'}
                      </span>
                      <small>
                        {match.deadline !== null && (
                          <>
                            Turn due{' '}
                            <LocalizedDate
                              value={match.deadline}
                              format="datetime"
                              options={{
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              }}
                            />
                          </>
                        )}
                      </small>
                      <Link
                        className={match.yourTurn ? 'primary-button' : 'outline-button'}
                        href={`/?correspondence=${match.id}`}
                      >
                        {match.outcome ? 'View result' : 'Resume match'}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No correspondence matches yet.</p>
              )
            ) : (
              <p>Loading…</p>
            )
          ) : (
            <p>{profile ? 'Sign in to play correspondence matches.' : 'Loading…'}</p>
          ))}
        {profileId && (
          <button
            className="text-button"
            onClick={() => window.dispatchEvent(new Event('triad:open-friends'))}
          >
            Invite a friend
          </button>
        )}
        {(error || connectionError) && (
          <p className="error-message" role="alert">
            {error || connectionError}
          </p>
        )}
      </main>
    </LocaleView>
  );
}
