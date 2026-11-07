'use client';
import { useEffect, useState } from 'react';
import type { AchievementView } from '@gacha-triad/shared/platform';
import { useSession } from '../../components/session';
import { api } from '../../lib/platform';
export default function Achievements() {
  const { profile, revision, error: connectionError } = useSession();
  const [items, setItems] = useState<AchievementView[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    if (profile)
      void api<AchievementView[]>('/achievements')
        .then(setItems)
        .catch((e) => setError(e.message));
  }, [profile?.id, revision]);
  return (
    <div className="content-page">
      <div className="eyebrow">A CHALLENGER’S RECORD</div>
      <h1>Achievements</h1>
      <p className="page-description">
        {profile?.name ?? 'Your record'} · {items.filter((a) => a.unlockedAt).length}/{items.length}{' '}
        earned. Progress comes from completed games and stays with your profile.
      </p>
      <p className="error-message" role="alert">
        {error || connectionError}
      </p>
      <div className="achievement-grid">
        {items.map((a) => (
          <article
            className={`menu-window achievement ${a.unlockedAt ? 'is-unlocked' : ''}`}
            key={a.id}
          >
            <span className="achievement-seal" aria-hidden="true">
              {a.unlockedAt ? '★' : '◇'}
            </span>
            <div>
              <h2>{a.name}</h2>
              <p>{a.description}</p>
              <progress value={a.progress} max={a.target} aria-label={`${a.name} progress`} />
              <small>
                {a.unlockedAt
                  ? `Earned ${new Date(a.unlockedAt).toLocaleDateString()}`
                  : `${a.progress} / ${a.target}`}
              </small>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
