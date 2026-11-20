'use client';
import { LocaleView } from './i18n';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useSession } from './session';
import { api } from '../lib/platform';
import { confirmQueueRules, type QueueMode } from './ranked-warning';
import { isDraftMode, RATED_MODES } from '@gacha-triad/shared/platform';
import { matchModeNames } from '../lib/rules';
import { Button } from './ui';
import { PracticeSetup } from './practice-setup';
export function MatchmakingPanel({
  onMatch,
  onRules,
  onTutorial,
}: {
  onMatch: (id: string) => void;
  onRules: () => void;
  onTutorial: () => void;
}) {
  const { profile, refresh } = useSession();
  const [busy, setBusy] = useState(false),
    [soloOpen, setSoloOpen] = useState(false),
    [error, setError] = useState('');
  const lock = useRef(false);
  async function queue(mode: QueueMode) {
    if (lock.current) return;
    lock.current = true;
    setError('');
    try {
      if (!(await confirmQueueRules(mode, profile))) return;
      setBusy(true);
      const result = await api<{ matchId: string | null }>('/lobbies', {
        mode,
        allowBots: mode === 'casual',
      });
      await refresh();
      if (result.matchId) onMatch(result.matchId);
    } catch (e) {
      setError((e as Error).message);
      await refresh();
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <LocaleView>
      <section className="setup-panel menu-window matchmaking-panel" aria-label="Match setup">
        <h2 className="window-label">Play a game</h2>
        {(['casual', ...RATED_MODES] as const).map((mode) => {
          const ranked = mode !== 'casual',
            draft = isDraftMode(mode),
            name = matchModeNames[mode],
            action = draft ? `Start ${name} (Ranked)` : `Start match (${name})`,
            own = profile?.waitingLobby?.mode === mode,
            requiresSavedDeck = !draft && mode !== 'ranked-random';
          return (
            <div className="matchmaking-row" key={mode}>
              <Button
                variant={ranked ? 'outline' : 'primary'}
                className={ranked ? 'ranked-play-button' : 'start-button'}
                disabled={
                  busy ||
                  !profile ||
                  !!profile.pendingTrade ||
                  !!profile.activeMatchId ||
                  !!profile.waitingLobbyId ||
                  (requiresSavedDeck && profile.deck.length !== 5) ||
                  (ranked && !profile.registered)
                }
                onClick={() => void queue(mode)}
                aria-label={action}
              >
                <>
                  <span className="command-copy">
                    <strong>{name}</strong>
                    {own && <small>In queue</small>}
                  </span>
                </>
              </Button>
            </div>
          );
        })}
        <Link className="outline-button lobby-shortcut" href="/lobbies">
          Browse lobbies
        </Link>
        {profile && profile.deck.length !== 5 && (
          <p className="deck-warning" role="status">
            Your active deck has {profile.deck.length}/5 cards.{' '}
            <Link href="/decks">Complete your deck in Decks</Link> before playing.
          </p>
        )}
        {!profile?.registered && (
          <p className="queue-account-note">An account is required for Ranked.</p>
        )}
        <div className="setup-secondary">
          <button className="text-button" onClick={() => setSoloOpen(true)}>
            Practice
          </button>
          <button className="text-button" onClick={onTutorial}>
            How to play
          </button>
          <button className="text-button" onClick={onRules}>
            Rulebook
          </button>
        </div>
        <p className="error-message" role="alert">
          {error}
        </p>
        <PracticeSetup open={soloOpen} onClose={() => setSoloOpen(false)} onMatch={onMatch} />
      </section>
    </LocaleView>
  );
}
