'use client';
import { LocaleView, NoTranslate } from '../../components/i18n';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isRatedMode, type LobbyPreset, type LobbyView } from '@gacha-triad/shared/platform';
import {
  STANDARD,
  UNRANKED_RULES,
  UNRANKED_RANDOM_RULES,
  supportsTradeOne,
  type Rules,
} from '@gacha-triad/engine';
import { api } from '../../lib/platform';
import { useSession } from '../../components/session';
import { publishSiteUpdate, useSiteRevision } from '../../lib/site-updates';
import { matchModeNames, ruleNames } from '../../lib/rules';
import { LocalBots } from '../../components/local-bots';
import { confirmQueueRules } from '../../components/ranked-warning';
import { useAllowBots } from '../../lib/lobby-preferences';
import { MainChat } from '../../components/main-chat';
import { BotStyle } from '../../components/bot-style';
import { RuleToggles, RuleVisibility } from '../../components/rule-options';
export default function Lobbies() {
  const { profile, revision, refreshProfile, error: connectionError } = useSession(),
    router = useRouter();
  const lobbyRevision = useSiteRevision('lobbies');
  const [rows, setRows] = useState<LobbyView[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState('all'),
    [status, setStatus] = useState('all'),
    [chatOpen, setChatOpen] = useState(false),
    [ruleFilters, setRuleFilters] = useState<Record<string, number>>({}),
    [create, setCreate] = useState(false),
    [name, setName] = useState(''),
    [rules, setRules] = useState<Rules>({ ...STANDARD, threeOpen: true }),
    [trade, setTrade] = useState(false);
  const [allowBots, setAllowBots] = useAllowBots();
  const [presets, setPresets] = useState<LobbyPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [presetBusy, setPresetBusy] = useState(false);
  const presetRevision = useRef(0);
  const tradeEligible = supportsTradeOne(rules);
  useEffect(() => {
    if (!tradeEligible) setTrade(false);
  }, [tradeEligible]);
  useEffect(() => {
    if (!profile) return;
    let active = true;
    void api<LobbyView[]>('/lobbies')
      .then((next) => {
        if (active) setRows(next);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [revision, profile?.id, lobbyRevision]);
  useEffect(() => {
    if (profile?.activeMatchId) router.push(`/?match=${profile.activeMatchId}`);
  }, [profile?.activeMatchId, router]);
  useEffect(() => {
    if (!create || !profile) return;
    let current = true;
    const revision = presetRevision.current;
    void api<LobbyPreset[]>('/lobby-presets').then(
      (rows) => {
        if (current && revision === presetRevision.current) setPresets(rows);
      },
      (e: Error) => {
        if (current && revision === presetRevision.current) setError(e.message);
      },
    );
    return () => {
      current = false;
    };
  }, [create, profile?.id]);
  function applyPreset(preset: LobbyPreset) {
    setRules(preset.rules);
    setTrade(preset.tradeRule === 'one');
    setAllowBots(preset.allowBots);
    setPresetName(preset.name);
    setError('');
  }
  async function changePreset(removeId?: string) {
    setPresetBusy(true);
    setError('');
    try {
      if (removeId) {
        await api(`/lobby-presets/${removeId}`, undefined, 'DELETE');
        presetRevision.current++;
        setPresets((rows) => rows.filter((row) => row.id !== removeId));
      } else {
        const saved = await api<LobbyPreset>('/lobby-presets', {
          name: presetName,
          rules,
          tradeRule: trade ? 'one' : 'none',
          allowBots,
        });
        presetRevision.current++;
        setPresets((rows) =>
          [...rows.filter((row) => row.id !== saved.id), saved].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        );
        setPresetName(saved.name);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPresetBusy(false);
    }
  }
  async function enter(path: string, body: unknown) {
    const requestedMode =
      (body as { mode?: string }).mode ?? rows.find((r) => path === `/lobbies/${r.id}/join`)?.mode;
    if (requestedMode === 'casual' && !(await confirmQueueRules('casual', profile))) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ matchId: string | null }>(path, body);
      if (!result.matchId) publishSiteUpdate('lobbies');
      await refreshProfile();
      setCreate(false);
      if (result.matchId) router.push(`/?match=${result.matchId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = rows.filter(
    (r) =>
      (mode === 'all' || r.mode === mode) &&
      (status === 'all' || r.status === status) &&
      Object.entries(ruleFilters).every(([rule, state]) => {
        const enabled =
          rule === 'one'
            ? r.tradeRule === 'one'
            : rule === 'closed'
              ? !r.rules.allOpen && !r.rules.threeOpen
              : Boolean(r.rules[rule as keyof typeof r.rules]);
        return state === 0 || (state === 1 ? enabled : !enabled);
      }),
  );
  const waiting = rows.find((r) => r.id === profile?.waitingLobbyId);
  function preset(kind: 'standard' | 'open' | 'trade' | 'random') {
    const presets = {
      standard: UNRANKED_RULES,
      open: { ...STANDARD, allOpen: true },
      trade: { ...UNRANKED_RULES, threeOpen: false },
      random: UNRANKED_RANDOM_RULES,
    };
    setRules(presets[kind]);
    setTrade(kind === 'trade');
    setError('');
  }
  return (
    <LocaleView>
      <div className="content-page lobby-page">
        <h1>Find a table</h1>
        <LocalBots />
        {waiting && (
          <div className="menu-window waiting-lobby" role="status">
            <strong>
              Waiting at <NoTranslate>{waiting.name}</NoTranslate> · 1/2 players
            </strong>
            <span>
              {ruleNames(waiting.rules).join(' · ')} ·{' '}
              {waiting.tradeRule === 'one' ? 'Trade One' : 'No trade'}
            </span>
          </div>
        )}
        <details className="lobby-chat" onToggle={(event) => setChatOpen(event.currentTarget.open)}>
          <summary>Lobby chat</summary>
          <MainChat compact visible={chatOpen} />
        </details>
        <div className="lobby-tools">
          <div className="lobby-filters">
            <label>
              Mode
              <select
                name="page-select-2"
                aria-label="Mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="all">All modes</option>
                {['casual', 'custom', 'roulette'].map((m) => (
                  <option key={m} value={m}>
                    {m === 'casual' ? 'Unranked' : m}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                name="page-select-3"
                aria-label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">All tables</option>
                <option value="waiting">1/2 · Waiting</option>
                <option value="playing">2/2 · Playing</option>
              </select>
            </label>
            <fieldset className="lobby-rule-filters">
              <legend>Rules · click to require, again to exclude</legend>
              <div>
                {Object.entries({
                  closed: 'Closed',
                  allOpen: 'All Open',
                  threeOpen: 'Three Open',
                  same: 'Same',
                  plus: 'Plus',
                  combo: 'Combo',
                  random: 'Random',
                  elemental: 'Elemental',
                  one: 'Trade One',
                }).map(([key, label]) => {
                  const state = ruleFilters[key] ?? 0;
                  return (
                    <button
                      key={key}
                      type="button"
                      data-state={state}
                      aria-label={
                        label +
                        ': ' +
                        (state === 1 ? 'Required' : state === -1 ? 'Excluded' : 'Any')
                      }
                      aria-pressed={state === -1 ? 'mixed' : state === 1}
                      onClick={() =>
                        setRuleFilters((current) => ({
                          ...current,
                          [key]: state === 0 ? 1 : state === 1 ? -1 : 0,
                        }))
                      }
                    >
                      {state === 1 ? '+ ' : state === -1 ? '− ' : ''}
                      {label}
                    </button>
                  );
                })}
                <button type="button" className="text-button" onClick={() => setRuleFilters({})}>
                  Clear rules
                </button>
              </div>
            </fieldset>
          </div>
          <button
            className="primary-button"
            disabled={!profile || !!profile.waitingLobbyId || !!profile.pendingTrade}
            onClick={() => setCreate((v) => !v)}
          >
            {create ? 'Close setup' : 'Create custom lobby'}
          </button>
        </div>
        {create && (
          <form
            className="menu-window lobby-create"
            onSubmit={(e) => {
              e.preventDefault();
              void enter('/lobbies', {
                mode: 'custom',
                name: name || undefined,
                rules,
                tradeRule: trade ? 'one' : 'none',
                allowBots,
              });
            }}
          >
            <h2>Your table, your rules</h2>
            <div className="queue-options">
              {(
                [
                  {
                    kind: 'standard',
                    name: 'Standard rules',
                    text: 'Three Open · Same · Plus · Combo · No trade',
                  },
                  {
                    kind: 'trade',
                    name: 'Trade One rules',
                    text: 'Closed · Same · Plus · Combo · Trade One',
                  },
                  {
                    kind: 'open',
                    name: 'All Open rules',
                    text: 'Both hands visible · No trade',
                  },
                  {
                    kind: 'random',
                    name: 'Random deck rules',
                    text: 'Random deck · Same · Plus · Combo · No trade',
                  },
                ] as const
              ).map((q) => (
                <button
                  key={q.kind}
                  type="button"
                  className="menu-window queue-option"
                  disabled={
                    busy ||
                    !profile ||
                    !!profile.waitingLobbyId ||
                    !!profile.pendingTrade ||
                    (q.kind === 'trade' && !profile.registered)
                  }
                  onClick={() => preset(q.kind)}
                >
                  <strong>{q.name}</strong>
                  <span>{q.text}</span>
                </button>
              ))}
            </div>
            <fieldset className="saved-lobby-presets">
              <legend>Saved presets</legend>
              {presets.length > 0 && (
                <ul>
                  {presets.map((preset) => (
                    <li key={preset.id}>
                      <button
                        type="button"
                        className="outline-button"
                        disabled={presetBusy}
                        onClick={() => applyPreset(preset)}
                      >
                        <NoTranslate>{preset.name}</NoTranslate>
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        disabled={presetBusy}
                        aria-label={`Delete preset ${preset.name}`}
                        onClick={() => void changePreset(preset.id)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="save-lobby-preset">
                <label>
                  Preset name
                  <input
                    name="presetName"
                    maxLength={40}
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="outline-button"
                  disabled={presetBusy || !presetName.trim()}
                  onClick={() => void changePreset()}
                >
                  {presets.some((preset) => preset.name === presetName.trim())
                    ? 'Update preset'
                    : 'Save preset'}
                </button>
              </div>
            </fieldset>
            <label className="check-label">
              <input
                name="page-input-1"
                type="checkbox"
                checked={allowBots}
                onChange={(e) => setAllowBots(e.target.checked)}
              />
              Allow bots to join my lobby
            </label>
            <div className="lobby-filters">
              <label>
                Lobby name
                <input
                  name="page-input-4"
                  value={name}
                  maxLength={60}
                  placeholder={`${profile?.name}'s table`}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <RuleVisibility rules={rules} onChange={setRules} />
            </div>
            <RuleToggles rules={rules} onChange={setRules}>
              <label>
                <input
                  name="tradeOne"
                  type="checkbox"
                  checked={trade}
                  disabled={!profile?.registered || !tradeEligible}
                  onChange={(e) => setTrade(e.target.checked)}
                />
                Trade One
              </label>
            </RuleToggles>
            <p className="eligibility-note">
              Trade One requires Closed visibility, Same, Plus and Combo. Extra rules may be added.{' '}
              {profile && !profile.registered ? 'Register an account to enable card stakes.' : ''}
            </p>
            <p>
              {rules.combo ? 'Combo chains follow Same and Plus captures. ' : ''}
              {rules.elemental ? 'Matching elemental cells grant +1; mismatches give −1. ' : ''}
              {rules.random
                ? 'Random draws a legal hand from each player’s available collection. '
                : ''}
              {trade
                ? 'Winner selects one permanently transferred card from the losing deck.'
                : 'No cards are traded.'}
            </p>
            <button className="primary-button" disabled={busy}>
              Open lobby · 1/2
            </button>
          </form>
        )}
        <p className="error-message" role="alert">
          {error || connectionError}
        </p>
        <div className="lobby-list" aria-label="Public lobbies">
          {visible.length ? (
            visible.map((row) => (
              <article className="menu-window lobby-row" key={row.id}>
                <div className="lobby-details">
                  <h2>
                    <NoTranslate>{row.name}</NoTranslate>
                  </h2>
                  <p>
                    <Link href={`/profile?id=${row.hostId}`}>
                      <NoTranslate>{row.host}</NoTranslate>
                    </Link>{' '}
                    · {matchModeNames[row.mode]} <BotStyle style={row.botStyle} />
                  </p>
                </div>
                <div className="lobby-join">
                  <strong>
                    {row.players}/2 <span>{row.status === 'waiting' ? 'Waiting' : 'Playing'}</span>
                  </strong>
                  {row.status === 'playing' && row.matchId && !row.inviteOnly && (
                    <Link
                      className="outline-button spectate-button"
                      href={`/?spectate=${row.matchId}`}
                    >
                      Spectate
                    </Link>
                  )}
                  {row.status === 'waiting' && row.hostId !== profile?.id && (
                    <button
                      className="outline-button"
                      disabled={
                        busy ||
                        row.status !== 'waiting' ||
                        row.inviteOnly ||
                        !!profile?.waitingLobbyId ||
                        !!profile?.pendingTrade ||
                        row.id === profile?.waitingLobbyId ||
                        ((isRatedMode(row.mode) || row.tradeRule === 'one') && !profile?.registered)
                      }
                      onClick={() => enter(`/lobbies/${row.id}/join`, {})}
                    >
                      Join table
                    </button>
                  )}
                </div>
                <div className="rule-badges">
                  {(row.mode === 'roulette' && row.status === 'waiting'
                    ? ['Rules drawn at match start']
                    : ruleNames(row.rules)
                  ).map((r) => (
                    <span key={r}>{r}</span>
                  ))}
                  <span>{row.tradeRule === 'one' ? 'Trade One' : 'No trade'}</span>
                  <span>
                    {row.inviteOnly
                      ? 'Friend invitation'
                      : row.allowBots
                        ? 'Bots allowed'
                        : 'Humans only'}
                  </span>
                </div>
              </article>
            ))
          ) : (
            <div className="menu-window empty-lobbies">
              <h2>No tables match</h2>
              <p>Open a table and it will appear here for other players.</p>
            </div>
          )}
        </div>
        <p className="library-note">
          Waiting lobbies expire after 15 minutes. <Link href="/rules">Read the rules</Link>
        </p>
      </div>
    </LocaleView>
  );
}
