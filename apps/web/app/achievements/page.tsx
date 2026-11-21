'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ALL_CARDS } from '@gacha-triad/shared';
import type { AchievementView } from '@gacha-triad/shared/platform';
import {
  ACHIEVEMENT_CATEGORIES,
  achievementCategory,
  PORTRAIT_FRAMES,
  type CustomizationView,
} from '@gacha-triad/shared/customization';
import { api } from '../../lib/platform';
import { useSession } from '../../components/session';
import { usePageRefresh } from '../../components/use-page-refresh';
import { LocaleView, LocalizedDate, NoTranslate } from '../../components/i18n';
import { AchievementIcon } from '../../components/achievement-icon';
import { Avatar } from '../../components/avatar';
import { Button, GameDialog } from '../../components/ui';
export default function Achievements() {
  return (
    <Suspense
      fallback={
        <LocaleView>
          <p>Loading achievements…</p>
        </LocaleView>
      }
    >
      <AchievementScreen />
    </Suspense>
  );
}
function AchievementScreen() {
  const { profile, refreshProfile, error: connectionError } = useSession(),
    params = useSearchParams(),
    [revision, refreshPage] = usePageRefresh();
  const [snapshot, setSnapshot] = useState<{ owner: string; items: AchievementView[] } | null>(
      null,
    ),
    [error, setError] = useState(''),
    [category, setCategory] = useState('all'),
    [status, setStatus] = useState('all'),
    [sort, setSort] = useState('progress'),
    [selected, setSelected] = useState<string | null>(params.get('achievement')),
    [narrow, setNarrow] = useState(false),
    [cosmetics, setCosmetics] = useState<CustomizationView | null>(null),
    [actionError, setActionError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  const signature = profile
    ? JSON.stringify([profile.played, profile.wins, profile.draws, profile.inventory])
    : '';
  useEffect(() => {
    const media = matchMedia('(max-width: 900px)'),
      change = () => setNarrow(media.matches);
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    setSelected(params.get('achievement'));
  }, [params.get('achievement')]);
  useEffect(() => {
    if (!profile) return;
    let active = true;
    setError('');
    void api<AchievementView[]>('/achievements')
      .then((items) => active && setSnapshot({ owner: profile.id, items }))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [profile?.id, signature, revision]);
  useEffect(() => {
    if (!profile) return;
    let active = true;
    void api<CustomizationView>('/profile/customization')
      .then((v) => active && setCosmetics(v))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [profile?.id, profile?.profileRevision]);
  const items = snapshot?.owner === profile?.id ? (snapshot?.items ?? []) : [],
    earned = items.filter((a) => a.unlockedAt).length;
  const visible = items
    .filter(
      (a) =>
        (category === 'all' || achievementCategory(a.id) === category) &&
        (status === 'all' || (status === 'earned' ? !!a.unlockedAt : !a.unlockedAt)),
    )
    .sort((a, b) =>
      sort === 'recent'
        ? (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? '') ||
          b.progress / b.target - a.progress / a.target
        : Number(!!a.unlockedAt) - Number(!!b.unlockedAt) ||
          b.progress / b.target - a.progress / a.target ||
          a.target - b.target,
    );
  const current =
    (narrow
      ? items.find((a) => a.id === selected)
      : (visible.find((a) => a.id === selected) ?? visible[0])) ?? null;
  const reward = current ? PORTRAIT_FRAMES.find((f) => f.achievementId === current.id) : null;
  const avatar = ALL_CARDS.find((c) => c.id === profile?.avatarCardId) ?? null;
  const featured = !!current && !!cosmetics?.settings.featuredAchievements.includes(current.id);
  const ownedFrames =
    cosmetics?.frames.filter((frame) => frame.unlocked).length ??
    PORTRAIT_FRAMES.filter(
      (f) => f.id === 'classic' || items.some((a) => a.id === f.achievementId && a.unlockedAt),
    ).length;
  async function action(kind: 'frame' | 'feature') {
    if (!current?.unlockedAt || lock.current) return;
    lock.current = true;
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      const latest = await api<CustomizationView>('/profile/customization');
      let next: CustomizationView;
      if (kind === 'frame')
        next = await api<CustomizationView>('/profile/frame', {
          frameId: reward!.id,
          revision: latest.settings.revision,
        });
      else {
        const ids = latest.settings.featuredAchievements,
          has = ids.includes(current.id);
        if (!has && ids.length >= 3)
          throw Error('Your achievement showcase is full. Edit it in your profile.');
        next = await api<CustomizationView>('/profile/customization', {
          ...latest.settings,
          featuredAchievements: has ? ids.filter((id) => id !== current.id) : [...ids, current.id],
        });
      }
      setCosmetics(next);
      await refreshProfile();
      setNotice(kind === 'frame' ? 'Frame equipped.' : 'Achievement showcase saved.');
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const detail = current && (
    <div className="achievement-detail-content">
      <AchievementIcon id={current.id} earned={!!current.unlockedAt} />
      <span className="achievement-state">{current.unlockedAt ? 'Unlocked' : 'In progress'}</span>
      <h2 ref={heading} tabIndex={-1} id="achievement-detail-title">
        {current.name}
      </h2>
      <p>{current.description}</p>
      <div className="achievement-detail-progress">
        <progress
          max={current.target}
          value={current.progress}
          aria-label={`${current.name} progress`}
        />
        <span>{`${current.progress} / ${current.target}`}</span>
      </div>
      {current.unlockedAt && (
        <p className="achievement-earned-date">
          Earned <LocalizedDate value={current.unlockedAt} />
        </p>
      )}
      {reward && (
        <div className="achievement-frame-reward">
          <Avatar card={avatar} name={profile?.name ?? ''} frameId={reward.id} />
          <div>
            <small>Portrait frame</small>
            <strong>{reward.name}</strong>
            {current.unlockedAt && (
              <Button
                busy={busy}
                disabled={profile?.frameId === reward.id}
                onClick={() => void action('frame')}
              >
                {profile?.frameId === reward.id ? 'Equipped' : 'Equip frame'}
              </Button>
            )}
          </div>
        </div>
      )}
      {current.unlockedAt && (
        <Button
          className="feature-achievement-button"
          busy={busy}
          aria-pressed={featured}
          onClick={() => void action('feature')}
        >
          {featured ? 'Remove from showcase' : 'Feature on profile'}
        </Button>
      )}
      {actionError && (
        <p className="error-message" role="alert">
          {actionError}
        </p>
      )}
      {notice && (
        <p className="achievement-action-notice" role="status">
          {notice}
        </p>
      )}
      <Link className="achievement-profile-link" href="/profile">
        Customize profile →
      </Link>
    </div>
  );
  return (
    <LocaleView>
      <div className="content-page achievements-v19">
        <header className="achievement-page-heading">
          <div>
            <h1>Achievements</h1>
            {profile && (
              <p>
                <NoTranslate>{profile.name}</NoTranslate>
              </p>
            )}
          </div>
          <Link href="/profile" className="outline-button">
            Your profile
          </Link>
        </header>
        <section className="menu-window achievement-summary" aria-label="Achievement progress">
          <div>
            <strong>
              {earned}
              <span> / {items.length}</span>
            </strong>
            <span>Achievements earned</span>
          </div>
          <progress max={items.length || 1} value={earned} aria-label="Earned achievements" />
          <div>
            <strong>
              {ownedFrames}
              <span> / {PORTRAIT_FRAMES.length}</span>
            </strong>
            <span>Portrait frames</span>
          </div>
        </section>
        {(error || connectionError) && (
          <div className="achievement-load-error" role="alert">
            {error || connectionError}
            <Button variant="ghost" onClick={refreshPage}>
              Try again
            </Button>
          </div>
        )}
        {!snapshot && !error ? (
          <p role="status">Loading achievements…</p>
        ) : (
          <div className="achievement-workspace">
            <nav className="achievement-categories" aria-label="Achievement categories">
              {ACHIEVEMENT_CATEGORIES.map((cat) => {
                const entries = items.filter(
                  (a) => cat.id === 'all' || achievementCategory(a.id) === cat.id,
                );
                return (
                  <button
                    key={cat.id}
                    aria-pressed={category === cat.id}
                    onClick={() => {
                      setCategory(cat.id);
                      setSelected(null);
                      setActionError('');
                      setNotice('');
                    }}
                  >
                    <span>{cat.name}</span>
                    <small>
                      {entries.filter((a) => a.unlockedAt).length}/{entries.length}
                    </small>
                  </button>
                );
              })}
            </nav>
            <div className="achievement-browser">
              <div className="achievement-filters">
                <label>
                  Status
                  <select
                    name="achievement-status"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setSelected(null);
                    }}
                  >
                    <option value="all">All</option>
                    <option value="progress">In progress</option>
                    <option value="earned">Earned only</option>
                  </select>
                </label>
                <label>
                  Sort
                  <select
                    name="achievement-sort"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="progress">Progress</option>
                    <option value="recent">Recently earned</option>
                  </select>
                </label>
                <Button variant="ghost" onClick={refreshPage}>
                  Refresh
                </Button>
              </div>
              <div className="achievement-list" aria-label="Achievements">
                {visible.map((a) => (
                  <button
                    key={a.id}
                    className={`achievement-row ${a.unlockedAt ? 'is-unlocked' : ''} ${current?.id === a.id ? 'is-selected' : ''}`}
                    aria-pressed={current?.id === a.id}
                    onClick={() => {
                      setSelected(a.id);
                      setActionError('');
                      setNotice('');
                    }}
                  >
                    <AchievementIcon id={a.id} earned={!!a.unlockedAt} />
                    <span className="achievement-row-copy">
                      <strong>{a.name}</strong>
                      <span>{a.description}</span>
                      <progress
                        value={a.progress}
                        max={a.target}
                        aria-label={`${a.name} progress`}
                      />
                    </span>
                    <span className="achievement-row-progress">
                      {a.unlockedAt ? '✓' : `${a.progress}/${a.target}`}
                    </span>
                  </button>
                ))}
              </div>
              {!visible.length && <p className="achievement-empty">No matching achievements.</p>}
            </div>
            {!narrow && current && (
              <aside className="menu-window achievement-detail" aria-label="Achievement details">
                {detail}
              </aside>
            )}
          </div>
        )}
        <GameDialog
          open={narrow && !!current}
          onClose={() => {
            if (!busy) setSelected(null);
          }}
          labelledBy="achievement-detail-title"
          initialFocus={heading}
          className="achievement-detail-dialog"
          dismissible={!busy}
        >
          {narrow && detail}
        </GameDialog>
      </div>
    </LocaleView>
  );
}
