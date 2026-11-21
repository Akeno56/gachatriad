'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ALL_CARDS } from '@gacha-triad/shared';
import { ASTRAL_REWARDS } from '@gacha-triad/shared/customization';
import {
  JOURNEY_CHAPTERS,
  WEEKLY_ALTERNATIVES,
  WEEKLY_CHOICES,
  type JourneyView,
  type WeeklyView,
} from '@gacha-triad/shared/journey';
import { LocaleView, LocalizedDate } from '../../components/i18n';
import { useSession } from '../../components/session';
import { usePageRefresh } from '../../components/use-page-refresh';
import { SeasonBanner } from '../../components/season-banner';
import { Avatar } from '../../components/avatar';
import { AstralCrestArt } from '../../components/astral-art';
import { Tabs, Button, GameDialog } from '../../components/ui';
import { api } from '../../lib/platform';
import { matchModeNames } from '../../lib/rules';

export default function JourneyPage() {
  const { profile, refreshProfile, openAccount } = useSession();
  const [revision, reload] = usePageRefresh(60000);
  const [snapshot, setSnapshot] = useState<{ owner: string; value: JourneyView } | null>(null);
  const [error, setError] = useState(''),
    [loadError, setLoadError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState('weekly');
  const [swapOpen, setSwapOpen] = useState(false);
  const [original, setOriginal] = useState('');
  const [replacement, setReplacement] = useState('');
  const [swapError, setSwapError] = useState('');
  const saving = useRef(false);
  const data = snapshot?.owner === profile?.id ? snapshot?.value : null;
  const seasonRewardGames = data?.seasonRewardGames;
  useEffect(() => {
    if (!profile) return;
    let active = true;
    void api<JourneyView>('/journey')
      .then((value) => {
        if (active) {
          setSnapshot({ owner: profile.id, value });
          setLoadError('');
        }
      })
      .catch((e) => {
        if (active) setLoadError(e.message);
      });
    return () => {
      active = false;
    };
  }, [profile?.id, profile?.registered, revision]);
  async function claim() {
    if (!data || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ awarded: number }>('/journey/weekly/claim', {
        week: data.weekly.week,
      });
      setNotice(result.awarded ? 'Weekly reward claimed.' : 'Reward already claimed.');
      setSnapshot((current) =>
        current
          ? {
              ...current,
              value: { ...current.value, weekly: { ...current.value.weekly, claimed: true } },
            }
          : current,
      );
      await refreshProfile();
    } catch (e) {
      setError((e as Error).message);
      reload();
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const weekly = data?.weekly;
  const objectives = (weekly?.objectives ?? []).flatMap((row) => {
    const objective = WEEKLY_CHOICES.find(({ id }) => id === row.id);
    return objective ? [{ ...objective, progress: row.progress }] : [];
  });
  const unfinished = objectives.filter((objective) => objective.progress < objective.target);
  const swapTier = unfinished.find(({ id }) => id === original)?.tier;
  async function swap() {
    if (!weekly || !profile || saving.current || !replacement) return;
    saving.current = true;
    setBusy(true);
    setSwapError('');
    setNotice('');
    try {
      const updated = await api<WeeklyView>('/journey/weekly/swap', {
        week: weekly.week,
        original,
        replacement,
      });
      setSnapshot((current) =>
        current?.owner === profile.id
          ? { ...current, value: { ...current.value, weekly: updated } }
          : current,
      );
      setSwapOpen(false);
      setNotice('Weekly objective swapped.');
    } catch (e) {
      setSwapError((e as Error).message);
      reload();
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const completedChapters = data?.chapters.filter((chapter) => chapter.completed).length ?? 0;
  const nextChapter = JOURNEY_CHAPTERS.find(
    (chapter) => !data?.chapters.find((row) => row.id === chapter.id)?.completed,
  );
  return (
    <LocaleView>
      <div className="content-page journey-page">
        <header className="journey-page-heading">
          <div>
            <h1>Journal</h1>
          </div>
          <Link className="outline-button" href="/">
            Back to play
          </Link>
        </header>
        <SeasonBanner />
        <div className="journey-intro">
          <Button variant="ghost" onClick={reload} disabled={busy || !profile}>
            Refresh progress
          </Button>
        </div>
        <Tabs
          label="Journey sections"
          panelId="journey-panel"
          items={[
            { value: 'weekly', label: 'This week' },
            { value: 'journal', label: 'Progress' },
          ]}
          value={panel}
          onChange={setPanel}
        />
        {(error || loadError) && (
          <div className="journey-error" role="alert">
            {error || loadError}{' '}
            <Button variant="ghost" onClick={reload}>
              Try again
            </Button>
          </div>
        )}
        {notice && (
          <p className="journey-notice" role="status">
            {notice}
          </p>
        )}
        {!data ? (
          <p role="status">Loading your journey…</p>
        ) : (
          <div
            id="journey-panel"
            role="tabpanel"
            aria-label={panel === 'weekly' ? 'This week' : 'Progress'}
          >
            {panel === 'weekly' ? (
              <>
                <section className="menu-window weekly-summary" aria-labelledby="weekly-title">
                  <div>
                    <h2 id="weekly-title">Weekly objectives</h2>
                    <p>{`Complete any ${weekly!.required} objectives.`}</p>
                    <small>
                      Resets Monday at 00:00 UTC ·{' '}
                      <LocalizedDate
                        value={weekly!.resetAt}
                        format="datetime"
                        options={{ timeZone: 'UTC', timeZoneName: 'short' }}
                      />
                    </small>
                    {weekly!.registered &&
                      (weekly!.swapped ? (
                        <small className="weekly-swap-used">Weekly swap used</small>
                      ) : (
                        !weekly!.claimed &&
                        unfinished.length > 0 && (
                          <Button
                            variant="outline"
                            className="weekly-swap-button"
                            disabled={busy}
                            onClick={() => {
                              setOriginal(unfinished[0].id);
                              setReplacement('');
                              setSwapError('');
                              setSwapOpen(true);
                            }}
                          >
                            Swap objective
                          </Button>
                        )
                      ))}
                  </div>
                  <div className="weekly-reward">
                    <strong>◇ {weekly!.reward}</strong>
                    <span>Stellar Prisms</span>
                    <span className="weekly-count">
                      {Math.min(weekly!.completed, weekly!.required)} / {weekly!.required}{' '}
                      <span>objectives complete</span>
                    </span>
                    {weekly!.claimed ? (
                      <b className="weekly-claimed">Reward claimed</b>
                    ) : !weekly!.registered ? (
                      <Button onClick={openAccount}>Register to claim</Button>
                    ) : (
                      <Button
                        variant="primary"
                        onClick={claim}
                        disabled={weekly!.completed < weekly!.required}
                        busy={busy}
                      >
                        {busy ? 'Claiming…' : 'Claim weekly reward'}
                      </Button>
                    )}
                  </div>
                </section>
                <div className="weekly-objectives">
                  {objectives.map((objective, index) => {
                    const progress = objective.progress;
                    const complete = progress >= objective.target;
                    return (
                      <article
                        className={`menu-window weekly-objective ${complete ? 'is-complete' : ''}`}
                        key={objective.id}
                        data-objective={objective.id}
                      >
                        <div className="objective-heading">
                          <span className="objective-number" aria-hidden="true">
                            {complete ? '✓' : String(index + 1).padStart(2, '0')}
                          </span>
                          <h3>{objective.name}</h3>
                          <b>
                            {progress} / {objective.target}
                          </b>
                        </div>
                        <p>{objective.description}</p>
                        <progress
                          aria-label={objective.name}
                          value={progress}
                          max={objective.target}
                        />
                        <div className="objective-footer">
                          {complete ? (
                            <span>Complete</span>
                          ) : (
                            <Link className="text-button" href={objective.href}>
                              Go to activity <span aria-hidden="true">→</span>
                            </Link>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <section className="journal-summary">
                  <p>
                    <strong>
                      {completedChapters} / {JOURNEY_CHAPTERS.length}
                    </strong>{' '}
                    <span>chapters complete</span>
                  </p>
                </section>
                <ol className="journal-chapters">
                  {JOURNEY_CHAPTERS.map((chapter, index) => {
                    const done = data.chapters.some(
                      (row) => row.id === chapter.id && row.completed,
                    );
                    return (
                      <li
                        className={`menu-window journal-chapter ${done ? 'is-complete' : ''}`}
                        key={chapter.id}
                      >
                        <span className="chapter-marker" aria-hidden="true">
                          {done ? '✓' : String(index + 1).padStart(2, '0')}
                        </span>
                        <div>
                          {(done || nextChapter?.id === chapter.id) && (
                            <small>{done ? 'Complete' : 'Next'}</small>
                          )}
                          <h3>{chapter.name}</h3>
                          <p>{chapter.description}</p>
                        </div>
                        {chapter.id === 'learn' ? (
                          <Button
                            variant="outline"
                            onClick={() => window.dispatchEvent(new Event('triad:show-tutorial'))}
                          >
                            {chapter.action}
                          </Button>
                        ) : (
                          <Link className="outline-button" href={chapter.href}>
                            {chapter.action}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </div>
        )}
        {data && (
          <section
            className="menu-window journey-season-record"
            id="season"
            aria-labelledby="season-record-title"
          >
            <header>
              <div>
                <div className="eyebrow">
                  Season {data.season.id} · {data.season.name}
                </div>
                <h2 id="season-record-title">Your season record</h2>
              </div>
              <Link className="text-button" href="/ladder">
                View leaderboards <span aria-hidden="true">→</span>
              </Link>
            </header>
            {data.season.id === ASTRAL_REWARDS.seasonId && seasonRewardGames !== undefined && (
              <section className="season-rewards" aria-labelledby="season-rewards-title">
                <h3 id="season-rewards-title">Astral rewards</h3>
                <p>Full rated games count toward these rewards.</p>
                <div className="season-reward-list">
                  {(['frame', 'banner'] as const).map((kind) => {
                    const reward = ASTRAL_REWARDS[kind];
                    const progress = Math.min(seasonRewardGames, reward.games);
                    const unlocked = progress === reward.games;
                    return (
                      <article key={reward.id} className="season-reward">
                        <div className="season-reward-art" aria-hidden="true">
                          {kind === 'frame' ? (
                            <Avatar
                              card={ALL_CARDS.find((card) => card.id === profile?.avatarCardId)}
                              name={profile?.name ?? 'Astral'}
                              frameId={ASTRAL_REWARDS.frame.id}
                            />
                          ) : (
                            <span
                              className="appearance-banner-preview"
                              data-profile-banner={reward.id}
                            >
                              <AstralCrestArt bannerId={ASTRAL_REWARDS.banner.id} />
                            </span>
                          )}
                        </div>
                        <div className="season-reward-info">
                          <h4>{reward.name}</h4>
                          <div className="season-reward-progress">
                            <progress
                              value={progress}
                              max={reward.games}
                              aria-label={reward.name}
                            />
                            <span>
                              {progress} / {reward.games}
                            </span>
                          </div>
                        </div>
                        <Link
                          className="text-button"
                          href={
                            kind === 'frame'
                              ? '/profile?customize=frames'
                              : '/profile?customize=banners'
                          }
                          aria-label={
                            kind === 'frame'
                              ? unlocked
                                ? 'Equip Astral frame'
                                : 'Preview Astral frame'
                              : unlocked
                                ? 'Equip Astral Crest'
                                : 'Preview Astral Crest'
                          }
                        >
                          {unlocked ? 'Equip' : 'Preview'} <span aria-hidden="true">→</span>
                        </Link>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
            <div className="season-records">
              {data.records.map((record) => (
                <article key={record.mode}>
                  <h3>{matchModeNames[record.mode]}</h3>
                  <strong>
                    {record.rating} <small>Elo</small>
                  </strong>
                  <p>
                    {record.games} <span>rated games</span>
                    {record.games < 5 && (
                      <>
                        {' '}
                        · <span>Provisional</span>
                      </>
                    )}
                  </p>
                  <dl>
                    <div>
                      <dt>Wins</dt>
                      <dd>{record.wins}</dd>
                    </div>
                    <div>
                      <dt>Draws</dt>
                      <dd>{record.draws}</dd>
                    </div>
                    <div>
                      <dt>Losses</dt>
                      <dd>{record.losses}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        )}
        <GameDialog
          open={swapOpen}
          onClose={() => setSwapOpen(false)}
          labelledBy="weekly-swap-title"
          className="weekly-swap-dialog"
          dismissible={!busy}
        >
          <h2 id="weekly-swap-title">Swap objective</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void swap();
            }}
          >
            <label>
              Replace
              <select
                name="original"
                value={original}
                disabled={busy}
                onChange={(event) => {
                  setOriginal(event.target.value);
                  setReplacement('');
                }}
              >
                {unfinished.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              New objective
              <select
                name="replacement"
                value={replacement}
                disabled={busy}
                required
                onChange={(event) => setReplacement(event.target.value)}
              >
                <option value="">Choose an objective</option>
                {WEEKLY_ALTERNATIVES.filter((item) => item.tier === swapTier).map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.description}
                  </option>
                ))}
              </select>
            </label>
            <small>One swap per week.</small>
            {swapError && (
              <p className="error-message" role="alert">
                {swapError}
              </p>
            )}
            <button className="primary-button" disabled={busy || !replacement || !swapTier}>
              Confirm swap
            </button>
          </form>
        </GameDialog>
      </div>
    </LocaleView>
  );
}
