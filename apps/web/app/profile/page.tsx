'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CARDS } from '@gacha-triad/shared';
import type { Card as CardData } from '@gacha-triad/engine';
import type { PlayerProfileView } from '@gacha-triad/shared/platform';
import { api } from '../../lib/platform';
import { useSession } from '../../components/session';
import { usePageRefresh } from '../../components/use-page-refresh';
import { LocaleView, NoTranslate, LocalizedDate } from '../../components/i18n';
import { Button } from '../../components/ui';
import { Avatar } from '../../components/avatar';
import { Card } from '../../components/card';
import { CardDetail } from '../../components/card-detail';
import { BotStyle } from '../../components/bot-style';
import { AchievementIcon } from '../../components/achievement-icon';
import { ProfileEditor } from '../../components/profile-editor';
import { ProfileActions } from '../../components/profile-actions';
import { SocialLogin } from '../../components/social-login';
import { AdminGrant } from '../../components/admin-grant';
import { AdminPlayerReview } from '../../components/admin-player-review';
export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <LocaleView>
          <p>Loading profile…</p>
        </LocaleView>
      }
    >
      <PlayerProfile />
    </Suspense>
  );
}
function PlayerProfile() {
  const { profile, openAccount } = useSession(),
    params = useSearchParams(),
    [revision, refreshPage] = usePageRefresh();
  const playerId = params.get('id') || profile?.id;
  const [snapshot, setSnapshot] = useState<{ id: string; value: PlayerProfileView } | null>(null),
    [error, setError] = useState(''),
    [editing, setEditing] = useState(false),
    [detail, setDetail] = useState<CardData | null>(null);
  const selfVersion =
    playerId === profile?.id
      ? JSON.stringify([
          profile?.profileRevision,
          profile?.name,
          profile?.played,
          profile?.rating,
          profile?.rankedRandomRating,
          profile?.draftRating,
          profile?.sharedDraftRating,
          profile?.avatarCardId,
          profile?.titleId,
          profile?.inventory,
        ])
      : '';
  useEffect(() => {
    if (!profile || !playerId) return;
    let active = true;
    setError('');
    void api<PlayerProfileView>(`/players/${encodeURIComponent(playerId)}`)
      .then((p) => active && setSnapshot({ id: playerId, value: p }))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [profile?.id, playerId, revision, selfVersion]);
  const player = snapshot && snapshot.id === playerId ? snapshot.value : null,
    self = player?.id === profile?.id;
  const modes = [
    { id: 'ranked', name: 'Ranked', rating: player?.rating },
    { id: 'ranked-random', name: 'Ranked Random', rating: player?.rankedRandomRating },
    { id: 'draft', name: 'Draft', rating: player?.draftRating },
    { id: 'shared-draft', name: 'Shared Draft', rating: player?.sharedDraftRating },
  ];
  const featured = modes.find((m) => m.id === player?.featuredMode) ?? modes[0];
  return (
    <LocaleView>
      <div className="content-page profile-page profile-v19">
        <header className="profile-page-heading">
          <h1>{self ? 'Your profile' : 'Player profile'}</h1>
          <div>
            {self && (
              <>
                <Link className="outline-button" href="/replays">
                  Replays
                </Link>
                <Button variant="primary" onClick={() => setEditing(true)}>
                  Customize profile
                </Button>
              </>
            )}
            <Link className="outline-button" href="/">
              Back to play
            </Link>
          </div>
        </header>
        {params.has('error') && (
          <p role="alert" className="deck-warning">
            Social sign-in could not finish. Try again, or sign in to your existing account and link
            the provider from your profile.
          </p>
        )}
        {error && (
          <div className="profile-load-error" role="alert">
            {error}
            <Button variant="ghost" onClick={refreshPage}>
              Try again
            </Button>
          </div>
        )}
        {!player && !error && <p role="status">Loading profile…</p>}
        {player && (
          <>
            <section className="menu-window profile-header">
              <div className="profile-portrait">
                <Avatar card={player.avatar} name={player.name} frameId={player.frameId} />
              </div>
              <div className="profile-identity">
                <span className="profile-kind">
                  {player.isBot
                    ? 'LOCAL BOT'
                    : self && !profile?.registered
                      ? 'GUEST PLAYER'
                      : 'CHALLENGER'}
                </span>
                <h2>
                  <NoTranslate>{player.name}</NoTranslate>
                </h2>
                {player.title && <p className="profile-title">{player.title}</p>}
                <BotStyle style={player.botStyle} />
                {player.bio && (
                  <p className="profile-bio">
                    <NoTranslate>{player.bio}</NoTranslate>
                  </p>
                )}
                <small>
                  Joined <LocalizedDate value={player.joinedAt} />
                </small>
              </div>
              <div className="profile-featured-rating">
                <span>{featured.name}</span>
                <strong>{featured.rating}</strong>
                <small>Elo</small>
              </div>
            </section>
            {self && !profile?.registered && (
              <Button onClick={openAccount}>Register to keep this profile</Button>
            )}
            {!self && <ProfileActions player={player} />}
            <div className="profile-overview">
              <div className="profile-showcases">
                <section className="menu-window profile-card-showcase">
                  <header>
                    <h2>Card showcase</h2>
                    {self && (
                      <Button variant="ghost" onClick={() => setEditing(true)}>
                        Edit
                      </Button>
                    )}
                  </header>
                  {player.featuredCards.length ? (
                    <div className="profile-showcase-cards">
                      {player.featuredCards.map((card) => (
                        <button
                          key={card.id}
                          aria-label={`Inspect ${card.name}`}
                          onClick={() => setDetail(card)}
                        >
                          <Card card={card} showElement />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="profile-empty">No showcased cards.</p>
                  )}
                </section>
                <section className="menu-window profile-achievement-showcase">
                  <header>
                    <h2>Achievement showcase</h2>
                    {self && <Link href="/achievements">Achievements →</Link>}
                  </header>
                  {player.featuredAchievements.length ? (
                    <div className="profile-featured-achievements">
                      {player.featuredAchievements.map((a) => (
                        <article key={a.id}>
                          <AchievementIcon id={a.id} earned />
                          <div>
                            <strong>{a.name}</strong>
                            <small>
                              <LocalizedDate value={a.unlockedAt} />
                            </small>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="profile-empty">No featured achievements.</p>
                  )}
                </section>
              </div>
              <aside className="profile-record">
                <section className="menu-window profile-record-panel">
                  <h2>Match record</h2>
                  <dl className="profile-record-totals">
                    {[
                      ['Games', player.played],
                      ['Wins', player.wins],
                      ['Losses', player.losses],
                      ['Draws', player.draws],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="profile-ratings">
                    {modes.map((m) => (
                      <div key={m.id} className={m.id === player.featuredMode ? 'is-featured' : ''}>
                        <span>{m.name}</span>
                        <strong>{m.rating}</strong>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="menu-window profile-collection-record">
                  <h2>Collection</h2>
                  <strong>
                    {player.collection.unique}
                    <small> / {CARDS.length}</small>
                  </strong>
                  <p>{`${player.collection.copies} copies · ${player.collection.holo} Holo`}</p>
                </section>
              </aside>
            </div>
            <div className="profile-record-details">
              <details className="menu-window">
                <summary>{`Earned achievements · ${player.achievements.length}`}</summary>
                <div className="profile-earned-list">
                  {player.achievements.map((a) => (
                    <div key={a.id}>
                      <AchievementIcon id={a.id} earned />
                      <strong>{a.name}</strong>
                      <small>
                        <LocalizedDate value={a.unlockedAt} />
                      </small>
                    </div>
                  ))}
                  {!player.achievements.length && <p>No earned achievements.</p>}
                </div>
              </details>
              <details className="menu-window title-list">
                <summary>{`Titles · ${player.titles.filter((t) => t.unlocked).length}/${player.titles.length} unlocked`}</summary>
                {player.titles.map((t) => (
                  <p key={t.id}>
                    <strong>
                      {t.unlocked ? '✓ ' : '◇ '}
                      {t.name}
                    </strong>{' '}
                    — {t.requirement}
                  </p>
                ))}
              </details>
            </div>
            {self && profile?.registered && (
              <details className="menu-window profile-account-links">
                <summary>Account connections</summary>
                <SocialLogin link />
              </details>
            )}
            <AdminGrant playerId={player.id} name={player.name} />
            <AdminPlayerReview playerId={player.id} />
            {self && profile && editing && (
              <ProfileEditor
                key={profile.id}
                profile={profile}
                onClose={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  refreshPage();
                }}
              />
            )}
          </>
        )}
        <CardDetail card={detail} onClose={() => setDetail(null)} />
      </div>
    </LocaleView>
  );
}
