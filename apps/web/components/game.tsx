'use client';
import { LocaleView, NoTranslate } from './i18n';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  displayValue,
  elementalModifier,
  PRESETS,
  validateDeck,
  type Card as CardData,
  type Rules,
} from '@gacha-triad/engine';
import { ALL_CARDS as CARDS, STARTER_DECK } from '@gacha-triad/shared';
import type { MatchView } from '@gacha-triad/shared/platform';
import { api } from '../lib/platform';
import { useCapturePresentation } from './use-capture-presentation';
import { appPath, assetPath } from '../lib/connection';
import { useSession } from './session';
import { Card } from './card';
import { CardDetail } from './card-detail';
import { RulesContent } from './rules-content';
import { ComboLesson } from './combo-lesson';
import { useGameAudio, useMusicScene } from './game-shell';
import { ElementIcon } from './element-icon';
import { ResultOverlay } from './result-overlay';
import { Avatar } from './avatar';
import { MatchmakingPanel } from './matchmaking-panel';
import { MainChat } from './main-chat';
import { CaptureCard } from './capture-card';
import { DraftOpening } from './draft-opening';
import { BattleChat } from './battle-chat';
export function ruleNames(r: Rules) {
  return [
    r.allOpen ? 'All Open' : r.threeOpen ? 'Three Open' : 'Closed',
    ...(r.same ? ['Same'] : []),
    ...(r.plus ? ['Plus'] : []),
    ...(r.combo ? ['Combo'] : []),
    ...(r.random ? ['Random'] : []),
    ...(r.elemental ? ['Elemental'] : []),
  ];
}
const describe = (c: CardData, modifier = 0) =>
  `${c.name}. Top ${displayValue(c.stats[0] + modifier)}, right ${displayValue(c.stats[1] + modifier)}, bottom ${displayValue(c.stats[2] + modifier)}, left ${displayValue(c.stats[3] + modifier)}. ${c.rarity} stars`;
export function Game() {
  const { profile, error: connectionError, revision, refresh } = useSession();
  const [receivedMatch, setMatch] = useState<MatchView | null>(null),
    [watchingId, setWatchingId] = useState<string | null>(null),
    [matchId, setMatchId] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [detail, setDetail] = useState<CardData | null>(null),
    [detailModifier, setDetailModifier] = useState(0),
    [dialog, setDialog] = useState<'rules' | 'combo' | 'exit' | null>(null),
    [draft, setDraft] = useState<string[]>([]),
    [clock, setClock] = useState(Date.now());
  const sound = useGameAudio();
  const {
    match,
    resolving,
    callout,
    revealed: revealedCaptures,
    flipping,
  } = useCapturePresentation(receivedMatch, sound);
  const receivedRef = useRef(receivedMatch);
  receivedRef.current = receivedMatch;
  useEffect(
    () => () => {
      const last = receivedRef.current;
      if (
        !last?.spectator &&
        last?.id === matchId &&
        last.status === 'complete' &&
        !last.trade.pending
      )
        void api(`/matches/${last.id}/leave`, {}).catch(() => {});
    },
    [matchId],
  );
  const [resultOpen, setResultOpen] = useState(true);
  const [draftCeremonyDone, setDraftCeremonyDone] = useState(false);
  const [draftSort, setDraftSort] = useState<'stats' | 'rarity'>('stats');
  const completeDraftOpening = useCallback(() => setDraftCeremonyDone(true), []);
  const updateDraft = useCallback(
    (next: MatchView) =>
      setMatch((current) =>
        current?.id === next.id && current.version > next.version ? current : next,
      ),
    [],
  );
  useEffect(() => setDraftCeremonyDone(false), [match?.id]);
  const changeMusicScene = useMusicScene();
  useEffect(() => {
    changeMusicScene(match?.status === 'playing' ? 'battle' : 'menu');
    return () => changeMusicScene('menu');
  }, [match?.status, changeMusicScene]);
  useEffect(() => setResultOpen(true), [match?.id]);
  const dialogRef = useRef<HTMLDialogElement>(null),
    resultSeen = useRef('');
  function inspect(card: CardData, modifier = 0) {
    setDetail(card);
    setDetailModifier(modifier);
  }
  const load = useCallback(
    async (id: string) => {
      try {
        const next = await api<MatchView>(`${watchingId ? '/spectate' : '/matches'}/${id}`);
        setMatch((current) =>
          current?.id === id && current.version > next.version ? current : next,
        );
        setError('');
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [watchingId],
  );
  useEffect(() => {
    if (!profile) return;
    const query = new URLSearchParams(location.search).get('match');
    const watch = new URLSearchParams(location.search).get('spectate');
    const target = profile.pendingTrade?.matchId ?? profile.activeMatchId;
    if (target && target !== matchId) {
      setWatchingId(null);
      setMatchId(target);
    } else if (!target && watch && watch !== matchId) {
      setWatchingId(watch);
      setMatchId(watch);
    } else if (!matchId && query) setMatchId(query);
  }, [profile, matchId]);
  useEffect(() => {
    if (match?.rematch?.matchId) {
      setDraft([]);
      setMatchId(match.rematch.matchId);
    }
  }, [match?.rematch?.matchId]);
  useEffect(() => {
    if (matchId) void load(matchId);
  }, [matchId, revision, load]);
  useEffect(() => {
    if (matchId)
      history.replaceState(
        history.state,
        '',
        appPath(`/?${watchingId ? 'spectate' : 'match'}=${matchId}`),
      );
  }, [matchId, watchingId]);
  useEffect(() => {
    if (!match?.game) return;
    document.body.classList.add('in-battle');
    window.scrollTo(0, 0);
    const measure = () => {
      const bar = document.querySelector('.system-bar')?.getBoundingClientRect().height ?? 62;
      document.documentElement.style.setProperty(
        '--battle-space',
        `${Math.max(250, window.innerHeight - bar - 56)}px`,
      );
    };
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      document.body.classList.remove('in-battle');
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [match?.id, !!match?.game]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (dialog) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [dialog]);
  const game = match?.game,
    seat = match?.seat ?? 0,
    other = seat === 0 ? 1 : 0,
    latest = game?.history.at(-1),
    own = game?.hands[seat] ?? [],
    opponent = game?.hands[other] ?? [];
  useEffect(() => {
    if (
      match?.spectator ||
      match?.status !== 'complete' ||
      resolving ||
      resultSeen.current === match.id
    )
      return;
    resultSeen.current = match.id;
    sound(match.winner === seat ? 'victory' : match.winner === 'draw' ? 'draw' : 'defeat');
  }, [match?.status, match?.id, match?.winner, resolving, seat, sound]);
  async function action(path: string, body: unknown) {
    setBusy(true);
    setError('');
    try {
      setMatch(await api<MatchView>(path, body));
      setSelected(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      if (matchId) await load(matchId);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ matchId: string }>('/solo', {
        difficulty: match?.names[1] === 'The Strategist' ? 'normal' : 'easy',
        rules: match?.rules ?? PRESETS[0].rules,
      });
      setMatchId(result.matchId);
      sound('select');
      await refresh();
      window.scrollTo(0, 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function menu() {
    setWatchingId(null);
    setMatch(null);
    setMatchId(null);
    setSelected(null);
    setDraft([]);
    history.replaceState(history.state, '', appPath('/'));
  }
  function place(cell: number) {
    if (!match || match.spectator || !game || game.turn !== seat || busy || resolving) return;
    if (!selected) {
      setError('Select a card from your hand first.');
      return;
    }
    void action(`/matches/${match.id}/move`, { cardId: selected, cell, version: match.version });
  }
  const canPlay =
    !match?.spectator && match?.status === 'playing' && game?.turn === seat && !busy && !resolving;
  const displayScore = game
    ? [game.hands[0].length, game.hands[1].length]
    : [...(match?.score ?? [5, 5])];
  if (game)
    game.board.forEach((item, cell) => {
      if (!item) return;
      const capture = latest?.captures.find((c) => c.cell === cell);
      const owner =
        capture && revealedCaptures !== null && !revealedCaptures.has(cell)
          ? capture.from
          : item.owner;
      displayScore[owner]++;
    });
  const selectedCard = own.find((c) => c.card?.id === selected)?.card;
  const orderedDraft = [...(match?.draftPool ?? [])].sort((a, b) => {
    const stats = (card: CardData) => card.stats.reduce((sum, n) => sum + n, 0);
    return (
      (draftSort === 'stats'
        ? stats(b) - stats(a) || b.rarity - a.rarity
        : b.rarity - a.rarity || stats(b) - stats(a)) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
    );
  });
  const draftErrors = validateDeck(match?.draftPool.filter((c) => draft.includes(c.id)) ?? []);
  if (
    !profile ||
    (!watchingId && !profile.activeMatchId && !profile.deck.length && profile.starterBoosters > 0)
  )
    return (
      <LocaleView>
        <section className="first-visit-screen">
          <img src={assetPath('/assets/ui/triad-logo.webp')} alt="Gacha Triad" />
          <h1>Gacha Triad</h1>
          <p>{profile ? 'Your first cards are waiting.' : 'Connecting to the card hall…'}</p>
          {connectionError && <p role="alert">{connectionError}</p>}
        </section>
      </LocaleView>
    );
  return (
    <LocaleView>
      <div
        className={`play-page ${match ? 'battle-screen' : 'title-screen'} ${match?.spectator ? 'spectator-screen' : ''} ${match?.game ? 'arena-screen' : ''}`}
      >
        {callout && (
          <div
            key={callout + ':' + match?.game?.history.length}
            className={`capture-splash splash-${callout.toLowerCase()}`}
            role="status"
          >
            {callout}
          </div>
        )}
        {!match ? (
          <>
            <div className="game-title">
              <h1>
                <span>GACHA</span>TRIAD
              </h1>
            </div>
            <div className="title-layout">
              <MatchmakingPanel
                onMatch={setMatchId}
                onRules={() => setDialog('rules')}
                onTutorial={() => window.dispatchEvent(new Event('triad:show-tutorial'))}
                onCombo={() => setDialog('combo')}
              />
              <section className="title-party" aria-label="Your saved deck">
                <div className="party-heading">
                  <span>YOUR DECK</span>
                </div>
                <div className="title-roster">
                  {(profile
                    ? profile.deck.map((id) => CARDS.find((c) => c.id === id)!).filter(Boolean)
                    : STARTER_DECK
                  ).map((card, i) => (
                    <button
                      className={`title-card title-card-${i}`}
                      key={card.id}
                      onClick={() => inspect(card)}
                      aria-label={`Inspect ${card.name}`}
                    >
                      <Card card={card} owner={0} />
                    </button>
                  ))}
                </div>
                <MainChat />
              </section>
            </div>
            <div className="build-label">
              {CARDS.filter((card) => !card.finish).length} CARDS · v0.1.2 Alpha{' '}
              <Link href="/credits" className="credits-button">
                Credits
              </Link>
            </div>
          </>
        ) : (
          <section className="match" aria-label="Triple Triad match">
            <div className="match-toolbar">
              <div className="battle-mode">
                <span>{match.mode.toUpperCase()} BATTLE</span>
                <strong>
                  {match.status === 'drafting'
                    ? 'Choose your hand'
                    : match.mode === 'solo'
                      ? 'Practice duel'
                      : match.spectator
                        ? 'Spectating'
                        : 'Online duel'}
                </strong>
              </div>
              <div className="rule-badges">
                {ruleNames(match.rules).map((r) => (
                  <span key={r}>{r}</span>
                ))}
                {match.trade.rule === 'one' && <span>Trade One</span>}
              </div>
              <div className="battle-actions">
                {profile?.isAdmin && !match.spectator && match.status !== 'complete' && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          'Finish this match as an admin test win? No rating or currency is awarded.',
                        )
                      )
                        void action(`/matches/${match.id}/admin-win`, {});
                    }}
                  >
                    Admin: instant win
                  </button>
                )}
                <button className="text-button" onClick={() => setDialog('rules')}>
                  How to play
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    match.spectator
                      ? location.assign(appPath('/lobbies'))
                      : match.status === 'complete'
                        ? menu()
                        : setDialog('exit')
                  }
                >
                  {match.spectator
                    ? 'Back to lobbies'
                    : match.status === 'complete'
                      ? 'Return to menu'
                      : 'Leave match'}
                </button>
              </div>
            </div>
            {match.status === 'drafting' && match.spectator ? (
              <div className="menu-window spectator-wait">
                <h2>Players are drafting</h2>
                <p>The battle starts when both hands are ready. Draft choices stay private.</p>
              </div>
            ) : match.status === 'drafting' && !draftCeremonyDone && !match.draftLocked ? (
              <DraftOpening
                key={match.id}
                match={match}
                onUpdate={updateDraft}
                onComplete={completeDraftOpening}
              />
            ) : match.status === 'drafting' ? (
              <div className="draft-selection">
                <div className="menu-window draft-heading">
                  <h1>Draft your hand</h1>
                  <p>
                    Choose 5 of these {match.draftPool.length} temporary cards. Up to one 5★ plus
                    one 4★, or two 4★. These cards do not enter your collection.
                  </p>
                  <p>
                    {match.draftLocked
                      ? 'Hand locked. Waiting for your opponent…'
                      : `${draft.length}/5 selected`}{' '}
                    · {Math.max(0, Math.ceil(((match.deadline ?? clock) - clock) / 1000))}s
                    remaining
                  </p>
                </div>
                <label className="draft-sort">
                  Order cards{' '}
                  <select
                    name="game-select-1"
                    aria-label="Order draft cards"
                    value={draftSort}
                    onChange={(e) => setDraftSort(e.target.value as 'stats' | 'rarity')}
                  >
                    <option value="stats">Total stats ↓ · Rarity ↓</option>
                    <option value="rarity">Rarity ↓ · Total stats ↓</option>
                  </select>
                </label>
                <div className="draft-grid">
                  {orderedDraft.map((card) => (
                    <button
                      key={card.id}
                      data-total={card.stats.reduce((sum, n) => sum + n, 0)}
                      data-rarity={card.rarity}
                      className={`draft-card ${draft.includes(card.id) ? 'is-selected' : ''}`}
                      aria-pressed={draft.includes(card.id)}
                      disabled={match.draftLocked || busy}
                      onClick={() =>
                        setDraft((ids) =>
                          ids.includes(card.id)
                            ? ids.filter((id) => id !== card.id)
                            : ids.length < 5
                              ? [...ids, card.id]
                              : ids,
                        )
                      }
                      aria-label={`Draft ${card.name}`}
                      title={`${card.name} · ${card.rarity}★ · Total ${card.stats.reduce((sum, n) => sum + n, 0)}`}
                    >
                      <Card card={card} />
                      <span className="draft-summary">
                        {card.rarity}★ · {card.stats.reduce((sum, n) => sum + n, 0)} total
                      </span>
                    </button>
                  ))}
                </div>
                <p>
                  {draft.length === 5
                    ? draftErrors.join(' ')
                    : 'Select five cards to lock your hand.'}
                </p>
                <button
                  className="primary-button"
                  disabled={draftErrors.length > 0 || busy || match.draftLocked}
                  onClick={() => action(`/matches/${match.id}/draft`, { cards: draft })}
                >
                  Lock hand
                </button>
              </div>
            ) : (
              game && (
                <>
                  <div className="scoreboard">
                    <div
                      className={`player-heading ${game.turn === seat && match.status === 'playing' ? 'active-player' : ''}`}
                    >
                      <Avatar
                        key={match.players[seat].avatar?.id ?? 'you'}
                        card={match.players[seat].avatar}
                        name={match.names[seat]}
                      />
                      <div>
                        <strong>
                          <NoTranslate>{match.names[seat]}</NoTranslate>
                        </strong>
                        {match.players[seat].title && (
                          <span className="battle-title">{match.players[seat].title}</span>
                        )}
                        <small>
                          {game.turn === seat && match.status === 'playing'
                            ? match.spectator
                              ? 'PLAYING'
                              : 'YOUR TURN'
                            : 'CHALLENGER'}
                        </small>
                      </div>
                      <span className="your-score">{displayScore[seat]}</span>
                    </div>
                    <div className="score-divider">
                      VS<small>{game.history.length}/9</small>
                    </div>
                    <div
                      className={`player-heading cpu-heading ${game.turn === other && match.status === 'playing' ? 'active-player' : ''}`}
                    >
                      <span className="cpu-score">{displayScore[other]}</span>
                      <Avatar
                        key={match.players[other].avatar?.id ?? 'rival'}
                        card={match.players[other].avatar}
                        name={match.names[other]}
                      />
                      <div>
                        <strong>
                          <NoTranslate>{match.names[other]}</NoTranslate>
                        </strong>
                        {match.players[other].title && (
                          <span className="battle-title">{match.players[other].title}</span>
                        )}
                        <small>
                          {game.turn === other && match.status === 'playing'
                            ? 'OPPONENT’S TURN'
                            : match.mode === 'solo'
                              ? 'CPU'
                              : 'OPPONENT'}
                        </small>
                      </div>
                    </div>
                  </div>
                  <div className="battle-layout">
                    <div className="hand player-hand">
                      <div className="hand-label">
                        {match.spectator ? match.names[seat] : 'YOUR HAND'}{' '}
                        <span>{own.length}/5</span>
                      </div>
                      <div className="hand-cards">
                        {own.map(
                          ({ slotId, card }) =>
                            (card || match.spectator) && (
                              <button
                                key={slotId}
                                className={`hand-card ${selected === card?.id ? 'is-selected' : ''}`}
                                data-testid="player-card"
                                aria-label={
                                  match.spectator
                                    ? card
                                      ? `Inspect ${card.name}`
                                      : 'Hidden spectator card'
                                    : `Select ${describe(card!)}`
                                }
                                aria-pressed={selected === card?.id}
                                disabled={match.spectator ? !card : !canPlay}
                                onClick={() => {
                                  if (match.spectator) {
                                    if (card) inspect(card);
                                    return;
                                  }
                                  setSelected(card!.id === selected ? null : card!.id);
                                  setError('');
                                  sound('menu');
                                }}
                              >
                                <Card
                                  card={card ?? undefined}
                                  hidden={!card}
                                  owner={0}
                                  compact
                                  showElement={!!match.rules.elemental}
                                />
                                <span className="selected-marker">▶</span>
                              </button>
                            ),
                        )}
                      </div>
                      {selectedCard && (
                        <button className="card-inspector" onClick={() => inspect(selectedCard)}>
                          <strong>
                            <NoTranslate>{selectedCard.name}</NoTranslate>
                          </strong>
                          <span>Inspect artwork ↗</span>
                        </button>
                      )}
                    </div>
                    <div className="board-area">
                      <div
                        className={`turn-banner ${game.turn === other ? 'cpu-turn' : 'your-turn'}`}
                        role="status"
                        aria-live="polite"
                      >
                        {resolving
                          ? 'RESOLVING CAPTURES…'
                          : match.status === 'complete'
                            ? 'MATCH COMPLETE'
                            : match.spectator
                              ? `${match.names[game.turn]} is playing…`
                              : game.turn === seat
                                ? selected
                                  ? 'Choose an empty space'
                                  : 'Your turn · Select a card'
                                : `${match.names[other]} is ${match.mode === 'solo' ? 'thinking' : 'playing'}…`}
                        {match.status === 'playing' && (
                          <small>
                            {' '}
                            · {Math.max(0, Math.ceil(((match.deadline ?? clock) - clock) / 1000))}s
                          </small>
                        )}
                      </div>
                      {match.status === 'playing' && (
                        <p
                          className={`turn-policy ${(match.missedTurns?.[game.turn] ?? 0) > 0 ? 'timeout-danger' : ''}`}
                          role="note"
                        >
                          {(match.missedTurns?.[game.turn] ?? 0) > 0
                            ? 'Next timeout: instant defeat.'
                            : '0 seconds: auto-play once. Miss your next turn: defeat.'}
                        </p>
                      )}
                      {!match.spectator && match.status === 'complete' && !resultOpen && (
                        <button
                          className="outline-button reopen-result"
                          onClick={() => setResultOpen(true)}
                        >
                          View result
                        </button>
                      )}
                      <div
                        className={`board ${match.rules.elemental ? 'elemental-board' : ''}`}
                        aria-label="Three by three game board"
                      >
                        {game.board.map((item, cell) => {
                          const capture = latest?.captures.find((c) => c.cell === cell);
                          const waitingCapture =
                            capture && revealedCaptures !== null && !revealedCaptures.has(cell);
                          const visibleOwner = waitingCapture ? capture.from : item?.owner;
                          const animatedCapture = capture && flipping.includes(cell);
                          const modifier = item ? elementalModifier(game, item.card, cell) : 0;
                          const preview =
                            !item && selectedCard && canPlay && game.cellElements?.[cell]
                              ? elementalModifier(game, selectedCard, cell)
                              : 0;
                          return (
                            <button
                              key={cell}
                              data-testid={`cell-${cell}`}
                              data-element={game.cellElements?.[cell] ?? undefined}
                              data-owner={visibleOwner}
                              data-modifier={preview || undefined}
                              className={`board-cell ${!item && selected && canPlay ? 'legal-cell' : ''} ${preview > 0 ? 'elemental-preview-buff' : preview < 0 ? 'elemental-preview-penalty' : ''}`}
                              disabled={!item && !canPlay}
                              onClick={() => (item ? inspect(item.card, modifier) : place(cell))}
                              aria-label={`Row ${Math.floor(cell / 3) + 1}, column ${(cell % 3) + 1}${item ? `: ${describe(item.card, modifier)}, ${visibleOwner === seat ? 'your' : 'opponent'} card` : `: empty${preview ? `, elemental ${preview > 0 ? 'bonus +1' : 'penalty −1'} for selected card` : ''}`}`}
                            >
                              {match.rules.elemental && game.cellElements?.[cell] && (
                                <ElementIcon
                                  element={game.cellElements[cell]!}
                                  className="cell-element"
                                />
                              )}
                              {item ? (
                                <CaptureCard
                                  stamp={`${match.id}:${game.history.length}:${cell}`}
                                  card={item.card}
                                  showElement={!!match.rules.elemental}
                                  modifier={elementalModifier(game, item.card, cell)}
                                  owner={visibleOwner === seat ? 0 : 1}
                                  fromOwner={
                                    animatedCapture ? (capture.from === seat ? 0 : 1) : undefined
                                  }
                                  captureReason={animatedCapture ? capture.reason : undefined}
                                  captureOrder={Math.max(0, flipping.indexOf(cell))}
                                />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                      <div className="board-bottom">
                        <span>
                          <i className="legend-dot mint-dot" />{' '}
                          {match.spectator ? match.names[seat] : 'YOU'}
                        </span>
                        <span>{game.history.length}/9 PLACED</span>
                        <span>
                          <i className="legend-dot rose-dot" />{' '}
                          {match.spectator ? match.names[other] : 'OPPONENT'}
                        </span>
                      </div>
                    </div>
                    <div className="hand cpu-hand">
                      <div className="hand-label">
                        OPPONENT <span>{opponent.length}/5</span>
                      </div>
                      <div className="hand-cards">
                        {opponent.map(({ slotId, card }) => (
                          <button
                            key={slotId}
                            className="opponent-card"
                            disabled={!card}
                            aria-label={card ? describe(card) : 'Hidden opponent card'}
                            onClick={() => card && inspect(card)}
                          >
                            <Card
                              card={card ?? undefined}
                              hidden={!card}
                              owner={1}
                              compact
                              showElement={!!match.rules.elemental}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="battle-message menu-window match-status">
                    <span className="window-label">BATTLE LOG</span>
                    <span className="message-cursor">▶</span>
                    <p role="log" aria-live="polite">
                      {latest
                        ? `${match.names[latest.move.player]} played ${CARDS.find((c) => c.id === latest.move.cardId)?.name ?? 'a card'}. ${latest.captures.length} captured${latest.captures.some((c) => c.reason === 'combo') ? ' — Combo!' : ''}.`
                        : 'Select a card, then choose an empty space.'}
                    </p>
                  </div>
                  <details className="match-history">
                    <summary>
                      Turn history <span>{game.history.length} moves</span>
                    </summary>
                    <ol>
                      {game.history.map((turn, i) => (
                        <li key={i}>
                          <span>{i + 1}</span>{' '}
                          <NoTranslate>{match.names[turn.move.player]}</NoTranslate> ·{' '}
                          {String.fromCharCode(65 + Math.floor(turn.move.cell / 3))}
                          {(turn.move.cell % 3) + 1}
                          {turn.captures.length
                            ? ` · ${turn.captures.map((c) => `${c.reason} ${String.fromCharCode(65 + Math.floor(c.cell / 3))}${(c.cell % 3) + 1}`).join(', ')}`
                            : ''}
                        </li>
                      ))}
                    </ol>
                  </details>
                  {match.spectator && match.status === 'complete' && (
                    <p className="spectator-result">
                      {match.winner === 'draw' ? 'Draw' : `${match.names[match.winner ?? 0]} wins`}
                    </p>
                  )}
                </>
              )
            )}
          </section>
        )}
        {match && <BattleChat key={match.id} match={match} />}
        <p className="error-message" role="alert">
          {error || connectionError}
        </p>
        <dialog
          ref={dialogRef}
          className={`game-dialog ${dialog === 'combo' ? 'combo-dialog' : ''}`}
          aria-labelledby="dialog-title"
          onCancel={() => setDialog(null)}
        >
          <div className="dialog-header">
            <h2 id="dialog-title">
              {dialog === 'rules'
                ? 'How to play'
                : dialog === 'combo'
                  ? 'The Combo lesson'
                  : 'Leave this match?'}
            </h2>
            <button
              className="close-button"
              aria-label="Close dialog"
              onClick={() => setDialog(null)}
            >
              ×
            </button>
          </div>
          {dialog === 'rules' ? (
            <RulesContent />
          ) : dialog === 'combo' ? (
            <ComboLesson />
          ) : dialog === 'exit' ? (
            <>
              <p>
                Leaving forfeits this duel.
                {match?.trade.rule === 'one'
                  ? ' Trade One still applies: your opponent may take one of your five cards.'
                  : ''}
              </p>
              <div className="result-actions">
                <button className="outline-button" onClick={() => setDialog(null)}>
                  Keep playing
                </button>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={async () => {
                    if (match) await action(`/matches/${match.id}/resign`, {});
                    setDialog(null);
                  }}
                >
                  Forfeit match
                </button>
              </div>
            </>
          ) : null}
        </dialog>
        <CardDetail card={detail} modifier={detailModifier} onClose={() => setDetail(null)} />
        {!match?.spectator && match?.status === 'complete' && !resolving && resultOpen && (
          <ResultOverlay
            match={match}
            busy={busy}
            onClose={() => setResultOpen(false)}
            onPlayAgain={start}
            onClaim={(cardId) => action(`/matches/${match.id}/claim`, { cardId })}
            onRematch={() => action(`/matches/${match.id}/rematch`, {})}
            onCancelRematch={() => action(`/matches/${match.id}/rematch`, { cancel: true })}
            error={error}
          />
        )}
      </div>
    </LocaleView>
  );
}
