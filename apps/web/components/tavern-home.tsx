'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ALL_CARDS, CARDS } from '@gacha-triad/shared';
import type { DailyBooster } from '@gacha-triad/shared/platform';
import type { DailyPuzzleView } from '@gacha-triad/shared/puzzle';
import type { Card as CardData } from '@gacha-triad/engine';
import { useSession } from './session';
import { LocaleView, NoTranslate } from './i18n';
import { Avatar } from './avatar';
import { Card } from './card';
import { MainChat } from './main-chat';
import { MatchmakingPanel } from './matchmaking-panel';
import { PracticeSetup } from './practice-setup';
import { HelpTip, Button } from './ui';
import { api } from '../lib/platform';
import { VERSION } from '../lib/release';
import { CURRENT_SEASON } from '@gacha-triad/shared/journey';

export function TavernHome({
  onMatch,
  onRules,
  onTutorial,
  onInspect,
}: {
  onMatch: (id: string) => void;
  onRules: () => void;
  onTutorial: () => void;
  onInspect: (card: CardData) => void;
}) {
  const { profile } = useSession();
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [notice, setNotice] = useState<{
    puzzle: DailyPuzzleView | null;
    booster: DailyBooster | null;
    error: boolean;
  }>({ puzzle: null, booster: null, error: false });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!profile) return;
    let active = true,
      loading = false;
    setNotice({ puzzle: null, booster: null, error: false });
    const update = async () => {
      if (!active || loading || document.hidden) return;
      loading = true;
      const [puzzle, booster] = await Promise.allSettled([
        api<DailyPuzzleView>('/puzzles/daily'),
        api<DailyBooster>('/boosters/daily'),
      ]);
      if (active)
        setNotice((current) => ({
          puzzle: puzzle.status === 'fulfilled' ? puzzle.value : current.puzzle,
          booster: booster.status === 'fulfilled' ? booster.value : current.booster,
          error: puzzle.status === 'rejected' || booster.status === 'rejected',
        }));
      loading = false;
    };
    void update();
    const timer = setInterval(() => void update(), 60000);
    const visible = () => {
      if (!document.hidden) void update();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [profile?.id, retry]);
  if (!profile) return null;
  const deck = profile.deck
    .map((id) => ALL_CARDS.find((card) => card.id === id))
    .filter((card): card is CardData => !!card);
  const portrait = ALL_CARDS.find((card) => card.id === profile.avatarCardId);
  return (
    <LocaleView>
      <div className="title-layout tavern-layout">
        <div className="play-command-column">
          <header className="game-title tavern-sign">
            <h1 translate="no">
              <span>GACHA</span>TRIAD
            </h1>
          </header>
          <MatchmakingPanel onMatch={onMatch} onRules={onRules} onTutorial={onTutorial} />
          <section className="menu-window tavern-noticeboard" aria-labelledby="noticeboard-title">
            <h2 id="noticeboard-title" className="window-label">
              Noticeboard
            </h2>
            <Link className="tavern-notice daily-puzzle-link" href="/puzzle">
              <span className="notice-symbol" aria-hidden="true">
                ✦
              </span>
              <span>
                <strong>Daily Puzzle</strong>
                <small>
                  {notice.puzzle?.rewarded
                    ? 'Reward claimed'
                    : notice.puzzle?.solved
                      ? 'Puzzle solved · Claim your reward'
                      : 'Win today’s puzzle · 100 Prisms'}
                </small>
              </span>
              <span className="notice-arrow" aria-hidden="true">
                →
              </span>
            </Link>
            <Link className="tavern-notice" href="/boosters#daily-booster">
              <span className="notice-symbol" aria-hidden="true">
                ▤
              </span>
              <span>
                <strong>Daily Booster</strong>
                <small>
                  {!profile.registered
                    ? 'Sign in to claim'
                    : notice.booster?.packId
                      ? 'Daily booster claimed'
                      : notice.booster?.available
                        ? 'Ready to claim'
                        : null}
                </small>
              </span>
              <span className="notice-arrow" aria-hidden="true">
                →
              </span>
            </Link>
            <button
              type="button"
              className="tavern-notice"
              aria-label="Practice"
              aria-haspopup="dialog"
              onClick={() => setPracticeOpen(true)}
            >
              <span className="notice-symbol" aria-hidden="true">
                ⚔
              </span>
              <span>
                <strong>Practice</strong>
                <small>Play against a bot</small>
              </span>
              <span className="notice-arrow" aria-hidden="true">
                →
              </span>
            </button>
            {notice.error && (
              <div className="noticeboard-error" role="status">
                Daily status unavailable.{' '}
                <Button variant="ghost" onClick={() => setRetry((n) => n + 1)}>
                  Refresh notices
                </Button>
              </div>
            )}
          </section>
        </div>
        <section className="title-party" aria-label="Your saved deck">
          <div className="party-heading tavern-party-heading">
            <div className="tavern-welcome">
              <Avatar card={portrait} frameId={profile.frameId} name={profile.name} />
              <span>
                <small>
                  <Link className="tavern-journey-link" href="/journey">
                    Season {CURRENT_SEASON.id} · <span>Journal</span> →
                  </Link>
                </small>
                <strong>
                  <NoTranslate>{profile.name}</NoTranslate>
                </strong>
              </span>
            </div>
            <Link className="deck-edit-link" href="/decks">
              Edit deck <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="title-roster" aria-label="Your active deck">
            {deck.map((card, i) => (
              <button
                className={`title-card title-card-${i}`}
                key={card.id}
                onClick={() => onInspect(card)}
                aria-label={`Inspect ${card.name}`}
              >
                <Card card={card} owner={0} />
              </button>
            ))}
            {!deck.length && (
              <Link className="tavern-empty-deck outline-button" href="/decks">
                Build your first deck
              </Link>
            )}
          </div>
          <MainChat fitViewport />
        </section>
      </div>
      <PracticeSetup open={practiceOpen} onClose={() => setPracticeOpen(false)} onMatch={onMatch} />
      <div className="build-label">
        {CARDS.length} CARDS · v{VERSION} Alpha{' '}
        <Link href="/credits" className="credits-button">
          Credits
        </Link>
        <HelpTip label="About the tavern">
          Your active deck is used for Unranked and Ranked. Both Draft formats use temporary cards.
        </HelpTip>
      </div>
    </LocaleView>
  );
}
