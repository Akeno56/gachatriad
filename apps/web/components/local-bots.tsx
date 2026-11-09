'use client';
import { LocaleView } from './i18n';

import { useEffect, useRef, useState } from 'react';
import type { BotMix, PopulationView } from '@gacha-triad/shared/platform';
import { api } from '../lib/platform';
import { useSession } from './session';
import { usePageRefresh } from './use-page-refresh';
export function LocalBots() {
  const { profile, refresh } = useSession();
  const [revision] = usePageRefresh(15000);
  const [status, setStatus] = useState<PopulationView | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const [mix, setMix] = useState<BotMix>({ easy: 0, medium: 100, hard: 0 });
  const [edited, setEdited] = useState(false);
  const lastSlider = useRef<keyof BotMix | null>(null);
  const anchoredSlider = useRef<keyof BotMix | null>(null);
  useEffect(() => {
    if (status && !edited) setMix(status.mix);
  }, [status, edited]);
  function adjust(d: keyof BotMix, value: number) {
    const next = { ...mix, [d]: value },
      others = (['easy', 'medium', 'hard'] as const).filter((k) => k !== d);
    const total = mix[others[0]] + mix[others[1]],
      left = 100 - value;
    next[others[0]] = Math.round(left * (total ? mix[others[0]] / total : 0.5));
    next[others[1]] = left - next[others[0]];
    if (lastSlider.current !== d) {
      anchoredSlider.current = lastSlider.current;
      lastSlider.current = d;
    }
    if (anchoredSlider.current && anchoredSlider.current !== d) {
      const keep = anchoredSlider.current,
        remainder = others.find((k) => k !== keep)!;
      next[keep] = Math.min(mix[keep], left);
      next[remainder] = left - next[keep];
    }
    setMix(next);
    setEdited(true);
  }
  useEffect(() => {
    let active = true;
    if (!profile?.isAdmin) setStatus(null);
    else
      void api<PopulationView>('/local-bots')
        .then((next) => {
          if (active) setStatus(next);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [profile?.id, profile?.isAdmin, revision]);
  if (!profile?.isAdmin || !status?.available) return null;
  return (
    <LocaleView>
      <aside className="menu-window local-bots">
        <div>
          <strong>LOCAL BOT POPULATION {status.enabled ? '· ON' : '· OFF'}</strong>
          <p>
            {status.enabled
              ? `${status.bots} labeled bots · ${status.activeGames} active games. They open tables, play, draft and trade.`
              : 'Populate this local world with labeled bots to try lobbies, games and trades.'}
          </p>
          <small>
            Bot games keep card transfers and currency rewards, but never change Elo. Turning off
            removes their waiting tables and offers; bots finish ongoing duels.
          </small>
          <fieldset className="bot-mix-sliders">
            <legend>Difficulty mix · 30 bots</legend>
            {(['easy', 'medium', 'hard'] as const).map((d) => (
              <label key={d}>
                <span>
                  {d === 'easy' ? 'Easy' : d === 'medium' ? 'Medium' : 'Hard'}{' '}
                  <output>{mix[d]}%</output>
                </span>
                <input
                  name="local-bots-input-1"
                  type="range"
                  min={0}
                  max={100}
                  value={mix[d]}
                  aria-label={`${d === 'easy' ? 'Easy' : d === 'medium' ? 'Medium' : 'Hard'} bots percentage`}
                  onChange={(e) => adjust(d, Number(e.target.value))}
                  disabled={pending}
                />
              </label>
            ))}
          </fieldset>
          {status.enabled && (
            <small>{`Easy ${status.counts.easy} / Medium ${status.counts.medium} / Hard ${status.counts.hard}`}</small>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
        <button
          className="outline-button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              setStatus(
                await api<PopulationView>('/local-bots', { enabled: !status.enabled, mix }),
              );
              setEdited(false);
              await refresh();
              setError('');
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setPending(false);
            }
          }}
        >
          {pending ? 'Updating…' : status.enabled ? 'Pause population' : 'Populate with bots'}
        </button>
        {status.enabled && (
          <button
            className="outline-button"
            disabled={pending || !edited}
            onClick={async () => {
              setPending(true);
              try {
                setStatus(await api<PopulationView>('/local-bots', { enabled: true, mix }));
                setEdited(false);
                await refresh();
                setError('');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setPending(false);
              }
            }}
          >
            Apply difficulty mix
          </button>
        )}
      </aside>
    </LocaleView>
  );
}
