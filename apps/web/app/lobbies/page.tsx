'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LobbyView, Mode } from '@gacha-triad/shared/platform';
import { STANDARD } from '@gacha-triad/engine';
import { api } from '../../lib/platform';
import { useSession } from '../../components/session';
import { ruleNames } from '../../components/game';
import { LocalBots } from '../../components/local-bots';
export default function Lobbies() {
  const { profile, revision, refresh, error: connectionError } = useSession(),
    router = useRouter();
  const [rows, setRows] = useState<LobbyView[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState('all'),
    [status, setStatus] = useState('all'),
    [rule, setRule] = useState('all'),
    [create, setCreate] = useState(false),
    [name, setName] = useState(''),
    [visibility, setVisibility] = useState('threeOpen'),
    [same, setSame] = useState(false),
    [plus, setPlus] = useState(false),
    [combo, setCombo] = useState(false),
    [elemental, setElemental] = useState(false),
    [random, setRandom] = useState(false),
    [trade, setTrade] = useState(false);
  const tradeEligible = visibility === 'closed' && same && plus && combo;
  useEffect(() => {
    if (!same && !plus) setCombo(false);
  }, [same, plus]);
  useEffect(() => {
    if (!tradeEligible) setTrade(false);
  }, [tradeEligible]);
  useEffect(() => {
    if (profile)
      void api<LobbyView[]>('/lobbies')
        .then(setRows)
        .catch((e) => setError(e.message));
  }, [revision, profile?.id]);
  useEffect(() => {
    if (profile?.activeMatchId) router.push(`/?match=${profile.activeMatchId}`);
  }, [profile?.activeMatchId, router]);
  async function enter(path: string, body: unknown) {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ matchId: string | null }>(path, body);
      await refresh();
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
      (rule === 'all' ||
        (rule === 'one' && r.tradeRule === 'one') ||
        Boolean(r.rules[rule as keyof typeof r.rules])),
  );
  const waiting = rows.find((r) => r.id === profile?.waitingLobbyId);
  return (
    <div className="content-page lobby-page">
      <div className="eyebrow">THE CARD HALL</div>
      <h1>Find a table</h1>
      <p className="page-description">
        Join a waiting table, or set your own rules. Every waiting and active table appears here.
      </p>
      <div className="queue-options">
        {(
          [
            { mode: 'casual', name: 'Unranked', text: 'Three Open · No trade' },
            { mode: 'ranked', name: 'Ranked', text: 'Same · Plus · Combo · Trade One' },
            { mode: 'draft', name: 'Draft', text: 'Choose 5 from 8 · Separate rating · No trade' },
            { mode: 'roulette', name: 'Roulette', text: 'Random rules at match start · No trade' },
          ] as const
        ).map((q) => (
          <button
            key={q.mode}
            className="menu-window queue-option"
            disabled={
              busy ||
              !profile ||
              !!profile.waitingLobbyId ||
              ((q.mode === 'ranked' || q.mode === 'draft') && !profile.registered)
            }
            onClick={() => enter('/lobbies', { mode: q.mode as Mode })}
          >
            <strong>{q.name}</strong>
            <span>{q.text}</span>
          </button>
        ))}
      </div>
      <p className="stakes-note">
        Trade One: the winner takes one card from the loser’s played deck, including on a forfeit.
        Draws trade nothing. Ranked and Draft require an account.
      </p>
      <LocalBots />
      {waiting && (
        <div className="menu-window waiting-lobby" role="status">
          <strong>Waiting at {waiting.name} · 1/2 players</strong>
          <span>
            {ruleNames(waiting.rules).join(' · ')} ·{' '}
            {waiting.tradeRule === 'one' ? 'Trade One' : 'No trade'}
          </span>
          <button
            className="outline-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/lobbies/${waiting.id}`, undefined, 'DELETE');
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Leave lobby
          </button>
        </div>
      )}
      <div className="lobby-tools">
        <div className="lobby-filters">
          <label>
            Mode
            <select aria-label="Mode" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="all">All modes</option>
              {['casual', 'custom', 'ranked', 'draft', 'roulette'].map((m) => (
                <option key={m} value={m}>
                  {m === 'casual' ? 'Unranked' : m}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All tables</option>
              <option value="waiting">1/2 · Waiting</option>
              <option value="playing">2/2 · Playing</option>
            </select>
          </label>
          <label>
            Rule
            <select aria-label="Rule" value={rule} onChange={(e) => setRule(e.target.value)}>
              <option value="all">All rules</option>
              {Object.entries({
                allOpen: 'All Open',
                threeOpen: 'Three Open',
                same: 'Same',
                plus: 'Plus',
                combo: 'Combo',
                random: 'Random',
                elemental: 'Elemental',
                one: 'Trade One',
              }).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="primary-button"
          disabled={!profile || !!profile.waitingLobbyId}
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
              rules: {
                ...STANDARD,
                allOpen: visibility === 'allOpen',
                threeOpen: visibility === 'threeOpen',
                same,
                plus,
                combo,
                random,
                elemental,
              },
              tradeRule: trade ? 'one' : 'none',
            });
          }}
        >
          <h2>Your table, your rules</h2>
          <div className="lobby-filters">
            <label>
              Lobby name
              <input
                value={name}
                maxLength={60}
                placeholder={`${profile?.name}'s table`}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Visibility
              <select
                aria-label="Visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
              >
                <option value="threeOpen">Three Open</option>
                <option value="allOpen">All Open</option>
                <option value="closed">Closed</option>
              </select>
            </label>
          </div>
          <div className="rule-toggles">
            {[
              { label: 'Same', value: same, set: setSame },
              { label: 'Plus', value: plus, set: setPlus },
              { label: 'Combo', value: combo, set: setCombo },
              { label: 'Random deck', value: random, set: setRandom },
              { label: 'Elemental', value: elemental, set: setElemental },
              { label: 'Trade One', value: trade, set: setTrade },
            ].map((t) => (
              <label key={t.label}>
                <input
                  type="checkbox"
                  checked={t.value}
                  disabled={
                    (t.label === 'Trade One' && (!profile?.registered || !tradeEligible)) ||
                    (t.label === 'Combo' && !same && !plus)
                  }
                  onChange={(e) => t.set(e.target.checked)}
                />
                {t.label}
              </label>
            ))}
          </div>
          <p className="eligibility-note">
            Trade One requires Closed visibility, Same, Plus and Combo. Extra rules may be added.{' '}
            {profile && !profile.registered ? 'Register an account to enable card stakes.' : ''}
          </p>
          <p>
            {combo ? 'Combo chains follow Same and Plus captures. ' : ''}
            {elemental ? 'Matching elemental cells grant +1; mismatches give −1. ' : ''}
            {random ? 'Random draws a legal hand from each player’s available collection. ' : ''}
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
              <div>
                <h2>{row.name}</h2>
                <p>
                  <Link href={`/profile?id=${row.hostId}`}>{row.host}</Link> ·{' '}
                  {row.mode === 'casual' ? 'Unranked' : row.mode}
                </p>
                <div className="rule-badges">
                  {(row.mode === 'roulette' && row.status === 'waiting'
                    ? ['Rules drawn at match start']
                    : ruleNames(row.rules)
                  ).map((r) => (
                    <span key={r}>{r}</span>
                  ))}
                  <span>{row.tradeRule === 'one' ? 'Trade One' : 'No trade'}</span>
                </div>
              </div>
              <div className="lobby-join">
                <strong>
                  {row.players}/2 <span>{row.status === 'waiting' ? 'Waiting' : 'Playing'}</span>
                </strong>
                <button
                  className="outline-button"
                  disabled={
                    busy ||
                    row.status !== 'waiting' ||
                    !!profile?.waitingLobbyId ||
                    row.id === profile?.waitingLobbyId ||
                    ((row.mode === 'ranked' || row.mode === 'draft' || row.tradeRule === 'one') &&
                      !profile?.registered)
                  }
                  onClick={() => enter(`/lobbies/${row.id}/join`, {})}
                >
                  Join table
                </button>
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
        Waiting lobbies expire after 15 minutes. Online turns allow 60 seconds; three missed turns
        forfeit. <Link href="/rules">Read the rules</Link>
      </p>
    </div>
  );
}
