'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { JOURNEY_CHAPTERS, WEEKLY_OBJECTIVES, type JourneyView } from '@gacha-triad/shared/journey';
import { LocaleView, LocalizedDate } from '../../components/i18n';
import { useSession } from '../../components/session';
import { usePageRefresh } from '../../components/use-page-refresh';
import { SeasonBanner } from '../../components/season-banner';
import { Tabs, Button } from '../../components/ui';
import { api } from '../../lib/platform';

export default function JourneyPage() {
  const { profile, refresh, openAccount } = useSession();
  const [revision, reload] = usePageRefresh(60000);
  const [snapshot, setSnapshot] = useState<{ owner: string; value: JourneyView } | null>(null);
  const [error, setError] = useState(''),
    [loadError, setLoadError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState('weekly');
  const saving = useRef(false);
  const data = snapshot?.owner === profile?.id ? snapshot?.value : null;
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
      setNotice(
        result.awarded
          ? 'Weekly reward claimed. Enjoy your next hand!'
          : 'This week’s reward has already been claimed.',
      );
      setSnapshot((current) =>
        current
          ? {
              ...current,
              value: { ...current.value, weekly: { ...current.value.weekly, claimed: true } },
            }
          : current,
      );
      await refresh();
      reload();
    } catch (e) {
      setError((e as Error).message);
      reload();
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const weekly = data?.weekly;
  const completedChapters = data?.chapters.filter((chapter) => chapter.completed).length ?? 0;
  const nextChapter = JOURNEY_CHAPTERS.find(
    (chapter) => !data?.chapters.find((row) => row.id === chapter.id)?.completed,
  );
  return (
    <LocaleView>
      <div className="content-page journey-page">
        <header className="journey-page-heading">
          <div>
            <div className="eyebrow">YOUR PLAYER JOURNEY</div>
            <h1>The traveller’s journal</h1>
          </div>
          <Link className="outline-button" href="/">
            Back to play
          </Link>
        </header>
        <SeasonBanner />
        <div className="journey-intro">
          <p>A few paths to try. Your own pace. No streak to maintain.</p>
          <Button variant="ghost" onClick={reload} disabled={busy || !profile}>
            Refresh progress
          </Button>
        </div>
        <Tabs
          label="Journey sections"
          panelId="journey-panel"
          items={[
            { value: 'weekly', label: 'This week' },
            { value: 'journal', label: 'Your journey' },
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
            aria-label={panel === 'weekly' ? 'This week' : 'Your journey'}
          >
            {panel === 'weekly' ? (
              <>
                <section className="menu-window weekly-summary" aria-labelledby="weekly-title">
                  <div>
                    <div className="eyebrow">WEEKLY OBJECTIVES</div>
                    <h2 id="weekly-title">Choose your path</h2>
                    <p>Complete any three of the six objectives. Play the activities you enjoy.</p>
                    <small>
                      Resets Monday at 00:00 UTC ·{' '}
                      <LocalizedDate
                        value={weekly!.resetAt}
                        format="datetime"
                        options={{ timeZone: 'UTC', timeZoneName: 'short' }}
                      />
                    </small>
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
                {!weekly!.registered && (
                  <p className="journey-note">
                    Your progress counts as a guest. Register to keep it and claim weekly rewards.
                  </p>
                )}
                <div className="weekly-objectives">
                  {WEEKLY_OBJECTIVES.map((objective, index) => {
                    const progress =
                      weekly!.objectives.find((row) => row.id === objective.id)?.progress ?? 0;
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
                <p className="journey-note">
                  Full duels only: forfeits, timeouts and admin results do not count. Each account
                  can claim one weekly reward.
                </p>
              </>
            ) : (
              <>
                <section className="journal-summary">
                  <h2>Your story at the tables</h2>
                  <p>Explore the game in any order. Completed chapters stay recorded.</p>
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
                          <small>
                            {done
                              ? 'Complete'
                              : nextChapter?.id === chapter.id
                                ? 'Suggested next step'
                                : 'Explore when you like'}
                          </small>
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
            <div className="season-records">
              {data.records.map((record) => (
                <article key={record.mode}>
                  <h3>
                    {record.mode === 'ranked'
                      ? 'Ranked'
                      : record.mode === 'draft'
                        ? 'Draft'
                        : 'Shared Draft'}
                  </h3>
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
            <p className="journey-note">
              Each format has its own Elo. Only eligible human matches affect rating. Practice and
              bot matches never change Elo.
            </p>
            <p className="journey-note">
              Ordinary Ranked never removes cards from your collection. Trade One is an optional
              custom rule.
            </p>
          </section>
        )}
      </div>
    </LocaleView>
  );
}
