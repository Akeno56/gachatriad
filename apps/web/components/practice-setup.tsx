'use client';
import { useRef, useState } from 'react';
import { BOT_STYLES } from '@gacha-triad/shared/bots';
import { UNRANKED_RULES, type CpuStyle, type Rules } from '@gacha-triad/engine';
import { LocaleView } from './i18n';
import { Button, GameDialog } from './ui';
import { api } from '../lib/platform';
import { useSession } from './session';
import { MatchRules, type MatchRulesPreset } from './rule-options';

export function PracticeSetup({
  open,
  onClose,
  onMatch,
}: {
  open: boolean;
  onClose: () => void;
  onMatch: (id: string) => void;
}) {
  const { profile, refresh } = useSession();
  const [difficulty, setDifficulty] = useState('normal'),
    [style, setStyle] = useState<CpuStyle>('balanced'),
    [preset, setPreset] = useState<MatchRulesPreset>('standard'),
    [rules, setRules] = useState<Rules>(UNRANKED_RULES);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null),
    lock = useRef(false);
  async function start() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ matchId: string }>('/solo', {
        difficulty,
        style,
        rules,
      });
      await refresh();
      onClose();
      onMatch(result.matchId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <LocaleView>
      <GameDialog
        open={open}
        onClose={() => {
          if (!busy) {
            setError('');
            onClose();
          }
        }}
        labelledBy="practice-setup-title"
        className="practice-setup"
        initialFocus={heading}
        dismissible={!busy}
      >
        <h2 id="practice-setup-title" ref={heading} tabIndex={-1}>
          Practice
        </h2>
        <div className="practice-fields">
          <label>
            Difficulty
            <select
              name="practice-difficulty"
              value={difficulty}
              disabled={busy}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
            </select>
          </label>
          <label>
            Bot style
            <select
              name="practice-style"
              value={style}
              disabled={busy}
              onChange={(e) => setStyle(e.target.value as CpuStyle)}
            >
              {BOT_STYLES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="practice-style-note">
          {BOT_STYLES.find((item) => item.id === style)!.description}
        </p>
        <MatchRules
          preset={preset}
          onPreset={setPreset}
          rules={rules}
          onChange={setRules}
          disabled={busy}
        />
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <Button
          variant="primary"
          busy={busy}
          disabled={
            !profile ||
            !!profile.activeMatchId ||
            !!profile.waitingLobbyId ||
            !!profile.pendingTrade ||
            profile.deck.length !== 5
          }
          onClick={start}
        >
          Start practice
        </Button>
      </GameDialog>
    </LocaleView>
  );
}
