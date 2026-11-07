'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ALL_CARDS } from '@gacha-triad/shared';
import type { PlayerProfileView } from '@gacha-triad/shared/platform';
import { useSession } from '../../components/session';
import { Card } from '../../components/card';
import { api } from '../../lib/platform';
export default function PlayerProfile() {
  const { profile, revision, refresh, openAccount } = useSession();
  const [player, setPlayer] = useState<PlayerProfileView | null>(null),
    [error, setError] = useState(''),
    [avatar, setAvatar] = useState(''),
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
              <small>Your chosen card is public. Your deck and inventory stay private.</small>
            </form>
          )}
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
