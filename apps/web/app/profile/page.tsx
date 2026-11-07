'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ALL_CARDS } from '@gacha-triad/shared';
import type { PlayerProfileView } from '@gacha-triad/shared/platform';
import { useSession } from '../../components/session';
import { Card } from '../../components/card';
import { api } from '../../lib/platform';
import { AdminGrant } from '../../components/admin-grant';
export default function PlayerProfile() {
  const { profile, revision, refresh, openAccount } = useSession();
  const [player, setPlayer] = useState<PlayerProfileView | null>(null),
    [error, setError] = useState(''),
    [avatar, setAvatar] = useState(''),
    [title, setTitle] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!profile) return;
    const id = new URLSearchParams(location.search).get('id') || profile.id;
    let valid = true;
    void api<PlayerProfileView>(`/players/${id}`)
      .then((p) => {
        if (valid) {
          setPlayer(p);
          setError('');
        }
      })
      .catch((e) => valid && setError(e.message));
    return () => {
      valid = false;
    };
  }, [profile?.id, revision]);
  useEffect(() => setAvatar(profile?.avatarCardId ?? ''), [profile?.avatarCardId]);
  useEffect(() => setTitle(profile?.titleId ?? ''), [profile?.titleId]);
  const self = player?.id === profile?.id;
  return (
    <div className="content-page profile-page">
      <div className="eyebrow">PLAYER RECORD</div>
      <h1>{self ? 'Your profile' : player?.name || 'Player profile'}</h1>
      <p className="error-message" role="alert">
        {error}
      </p>
      {player && (
        <>
          <section className="menu-window profile-header">
            <div className="profile-portrait">
              {player.avatar ? (
                <Card card={player.avatar} showElement />
              ) : (
                <span className="profile-emblem">GT</span>
              )}
            </div>
            <div>
              <span className="profile-kind">
                {player.isBot
                  ? 'LOCAL BOT'
                  : self && !profile?.registered
                    ? 'GUEST PLAYER'
                    : 'CHALLENGER'}
              </span>
              <h2>{player.name}</h2>
              {player.title && <p className="profile-title">{player.title}</p>}
              <p>Joined {new Date(player.joinedAt).toLocaleDateString()}</p>
              <p>
                {player.collection.unique}/400 cards collected · {player.collection.copies} copies ·{' '}
                {player.collection.holo} Holo
              </p>
              {self && !profile?.registered && (
                <button className="outline-button" onClick={openAccount}>
                  Register to keep this profile
                </button>
              )}
              {!self && (
                <Link href="/lobbies" className="outline-button">
                  Meet in the card hall
                </Link>
              )}
              {!self && !player.isBot && profile?.registered && (
                <div className="result-actions">
                  <button
                    className="outline-button"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await api('/friends/request', { playerId: player.id });
                        await refresh();
                        setNotice('Friend request sent.');
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Add friend
                  </button>
                  <button
                    className="outline-button"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await api('/invites', { playerId: player.id });
                        await refresh();
                        setNotice('Invitation sent. Open Chat & friends to manage it.');
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Invite to duel
                  </button>
                </div>
              )}
              {notice && <p role="status">{notice}</p>}
            </div>
          </section>
          <section className="profile-stats" aria-label="Player statistics">
            {[
              ['Constructed rating', player.rating],
              ['Draft rating', player.draftRating],
              ['Games', player.played],
              ['Wins', player.wins],
              ['Losses', player.losses],
              ['Draws', player.draws],
            ].map(([label, value]) => (
              <div className="menu-window" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </section>
          {self && (
            <form
              className="menu-window profile-edit"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await api('/profile/avatar', { cardId: avatar || null });
                  await api('/profile/title', { titleId: title || null });
                  await refresh();
                  setError('');
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Profile card
                <select
                  aria-label="Profile card"
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                >
                  <option value="">Default emblem</option>
                  {ALL_CARDS.filter((c) => (profile?.inventory[c.id]?.quantity ?? 0) > 0).map(
                    (c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.finish === 'holo' ? ' · Holo' : ''} · {c.rarity}★
                      </option>
                    ),
                  )}
                </select>
              </label>
              <button className="primary-button" disabled={busy}>
                Save profile
              </button>
              <label>
                Equipped title
                <select
                  aria-label="Equipped title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                >
                  <option value="">No title</option>
                  {player.titles
                    .filter((t) => t.unlocked)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>
              <small>Your chosen card is public. Your deck and inventory stay private.</small>
            </form>
          )}
          <details className="menu-window title-list">
            <summary>
              Titles · {player.titles.filter((t) => t.unlocked).length}/{player.titles.length}{' '}
              unlocked
            </summary>
            {player.titles.map((t) => (
              <p key={t.id}>
                <strong>
                  {t.unlocked ? '✓ ' : '🔒 '}
                  {t.name}
                </strong>{' '}
                — {t.requirement}
              </p>
            ))}
          </details>
          <AdminGrant playerId={player.id} name={player.name} />
          <h2 className="profile-section-title">
            Earned achievements · {player.achievements.length}
          </h2>
          <div className="achievement-grid">
            {player.achievements.map((a) => (
              <article key={a.id} className="menu-window achievement is-unlocked">
                <span className="achievement-seal">★</span>
                <div>
                  <h2>{a.name}</h2>
                  <small>{new Date(a.unlockedAt).toLocaleDateString()}</small>
                </div>
              </article>
            ))}
          </div>
          {!player.achievements.length && (
            <p>Every challenger starts somewhere. Finish a duel to earn your first achievement.</p>
          )}
        </>
      )}
    </div>
  );
}
