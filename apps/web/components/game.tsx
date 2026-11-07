'use client';
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
import { appPath } from '../lib/connection';
import { useSession } from './session';
import { Card } from './card';
import { CardDetail } from './card-detail';
import { RulesContent } from './rules-content';
import { ComboLesson } from './combo-lesson';
import { useGameAudio } from './game-shell';
import { ElementIcon } from './element-icon';
import { ResultOverlay } from './result-overlay';
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
const describe = (c: CardData) =>
  `${c.name}. Top ${displayValue(c.stats[0])}, right ${displayValue(c.stats[1])}, bottom ${displayValue(c.stats[2])}, left ${displayValue(c.stats[3])}. ${c.rarity} stars`;
export function Game() {
  const { profile, error: connectionError, revision, refresh } = useSession();
  const [match, setMatch] = useState<MatchView | null>(null),
    [matchId, setMatchId] = useState<string | null>(null),
    [difficulty, setDifficulty] = useState<'easy' | 'normal'>('easy'),
    [presetId, setPresetId] = useState('unranked'),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [detail, setDetail] = useState<CardData | null>(null),
    [dialog, setDialog] = useState<'rules' | 'combo' | 'exit' | null>(null),
    [callout, setCallout] = useState(''),
    [resolving, setResolving] = useState(false),
    [draft, setDraft] = useState<string[]>([]),
    [clock, setClock] = useState(Date.now());
  const [resultOpen, setResultOpen] = useState(true);
  useEffect(() => setResultOpen(true), [match?.id]);
  const dialogRef = useRef<HTMLDialogElement>(null),
    seen = useRef(''),
    resultSeen = useRef('');
  const sound = useGameAudio();
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const load = useCallback(async (id: string) => {
    try {
      const next = await api<MatchView>(`/matches/${id}`);
      setMatch((current) =>
        current?.id === id && current.version > next.version ? current : next,
      );
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (!profile) return;
    const query = new URLSearchParams(location.search).get('match');
    if (!matchId && (query || profile.activeMatchId)) setMatchId(query || profile.activeMatchId);
  }, [profile, matchId]);
  useEffect(() => {
    if (matchId) {
      void load(matchId);
      history.replaceState(null, '', appPath(`/?match=${matchId}`));
    }
  }, [matchId, revision, load]);
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
  const latestKey = latest ? `${match?.id}:${game?.history.length}` : '';
  useEffect(() => {
    if (!latest || seen.current === latestKey) return;
    seen.current = latestKey;
    const combos = latest.captures.filter((c) => c.reason === 'combo').length;
    const special = [
      ...new Set(
        latest.captures
          .filter((c) => c.reason === 'same' || c.reason === 'plus')
          .map((c) => c.reason.toUpperCase()),
      ),
    ].join(' + ');
    setCallout(combos ? `${special} → COMBO ×${combos}` : special);
    sound(combos ? 'combo' : latest.captures.length ? 'capture' : 'place');
    setResolving(true);
    const timer = setTimeout(
      () => {
        setResolving(false);
        setCallout('');
      },
      latest.captures.length ? 650 + latest.captures.length * 160 : 200,
    );
    return () => clearTimeout(timer);
  }, [latestKey, sound]);
  useEffect(() => {
    if (match?.status !== 'complete' || resolving || resultSeen.current === match.id) return;
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
      const result = await api<{ matchId: string }>('/solo', { difficulty, rules: preset.rules });
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
    setMatch(null);
    setMatchId(null);
    setSelected(null);
    setDraft([]);
    history.replaceState(null, '', appPath('/'));
  }
  function place(cell: number) {
    if (!match || !game || game.turn !== seat || busy || resolving) return;
    if (!selected) {
      setError('Select a card from your hand first.');
      return;
    }
    void action(`/matches/${match.id}/move`, { cardId: selected, cell, version: match.version });
  }
  const canPlay = match?.status === 'playing' && game?.turn === seat && !busy && !resolving;
  const selectedCard = own.find((c) => c.card?.id === selected)?.card;
  const draftErrors = validateDeck(match?.draftPool.filter((c) => draft.includes(c.id)) ?? []);
  return (
    <div className={`play-page ${match ? 'battle-screen' : 'title-screen'}`}>
      {!match ? (
        <>
          <div className="game-title">
            <span className="title-overline">A CROSS-WORLD CARD BATTLE</span>
            <h1>
              <span>GACHA</span>TRIAD
            </h1>
          </div>
          <div className="title-layout">
            <section className="setup-panel menu-window" aria-label="Match setup">
              <h2 className="window-label">DUEL SETUP</h2>
              <div className="section-kicker">CHOOSE YOUR RIVAL</div>
              <div className="opponent-options" role="group" aria-label="CPU difficulty">
                {(['easy', 'normal'] as const).map((level) => (
                  <button
                    key={level}
                    className={`opponent-option ${difficulty === level ? 'is-active' : ''}`}
                    aria-pressed={difficulty === level}
                    onClick={() => {
                      setDifficulty(level);
                      sound('menu');
                    }}
                  >
                    <span className="menu-pointer">▶</span>
                    <span>
                      <strong>{level === 'easy' ? 'The Wanderer' : 'The Strategist'}</strong>
                      <small>{level.toUpperCase()}</small>
                    </span>
                  </button>
                ))}
              </div>
              <p className="opponent-description">
                {difficulty === 'easy'
                  ? 'A relaxed rival. Find your footing.'
                  : 'Looks for captures. Guards weak sides.'}
              </p>
              <label className="section-kicker" htmlFor="preset">
                BATTLE RULES
              </label>
              <select
                id="preset"
                aria-label="Rule preset"
                value={presetId}
                onChange={(e) => setPresetId(e.target.value)}
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="preset-description">{preset.description}</p>
              <button
                className="primary-button start-button"
                disabled={busy || !profile || profile.deck.length !== 5}
                onClick={start}
              >
                {busy ? 'Preparing…' : 'Start match'} ▶
              </button>
              <Link className="outline-button lobby-shortcut" href="/lobbies">
                Play online
              </Link>
              <div className="setup-secondary">
                <button className="text-button" onClick={() => setDialog('rules')}>
                  How to play
                </button>
                <button className="text-button" onClick={() => setDialog('combo')}>
                  Combo lesson
                </button>
              </div>
            </section>
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
                    onClick={() => setDetail(card)}
                    aria-label={`Inspect ${card.name}`}
                  >
                    <Card card={card} owner={0} />
                  </button>
                ))}
              </div>
              <div className="party-caption">
                <span>01—05</span>
                <p>
                  Mixed universe deck
                  <br />
                  <Link href="/collection">Arrange your cards</Link>
                </p>
                <span className="deck-emblem">V</span>
              </div>
            </section>
          </div>
          <div className="command-window menu-window">
            <span className="window-label">MESSAGE</span>
            <span className="message-cursor">▶</span>
            <p>
              Select a rival and a rule set to begin.
              <small>Solo practice has no turn timer or card trade.</small>
            </p>
          </div>
          <div className="build-label">
            400 CARDS · v0.4{' '}
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
              <button className="text-button" onClick={() => setDialog('rules')}>
                How to play
              </button>
              <button
                className="text-button"
                onClick={() => (match.status === 'complete' ? menu() : setDialog('exit'))}
              >
                {match.status === 'complete' ? 'Return to menu' : 'Leave match'}
              </button>
            </div>
          </div>
          {match.status === 'drafting' ? (
            <div className="draft-selection">
              <div className="menu-window draft-heading">
                <h1>Draft your hand</h1>
                <p>
                  Choose 5 of these 8 temporary cards. Up to one 5★ plus one 4★, or two 4★. These
                  cards do not enter your collection.
                </p>
                <p>
                  {match.draftLocked
                    ? 'Hand locked. Waiting for your opponent…'
                    : `${draft.length}/5 selected`}{' '}
                  · {Math.max(0, Math.ceil(((match.deadline ?? clock) - clock) / 1000))}s remaining
                </p>
              </div>
              <div className="catalog-grid">
                {match.draftPool.map((card) => (
                  <button
                    key={card.id}
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
                  >
                    <Card card={card} />
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
                    <span className="player-number">YOU</span>
                    <div>
                      <strong>{match.names[seat]}</strong>
                      <small>
                        {game.turn === seat && match.status === 'playing'
                          ? 'YOUR TURN'
                          : 'CHALLENGER'}
                      </small>
                    </div>
                    <span className="your-score">{match.score[seat]}</span>
                  </div>
                  <div className="score-divider">
                    VS<small>{game.history.length}/9</small>
                  </div>
                  <div
                    className={`player-heading cpu-heading ${game.turn === other && match.status === 'playing' ? 'active-player' : ''}`}
                  >
                    <span className="cpu-score">{match.score[other]}</span>
                    <div>
                      <strong>{match.names[other]}</strong>
                      <small>{match.mode === 'solo' ? 'CPU' : 'OPPONENT'}</small>
                    </div>
                  </div>
                </div>
                <div className="battle-layout">
                  <div className="hand player-hand">
                    <div className="hand-label">
                      YOUR HAND <span>{own.length}/5</span>
                    </div>
                    <div className="hand-cards">
                      {own.map(
                        ({ slotId, card }) =>
                          card && (
                            <button
                              key={slotId}
                              className={`hand-card ${selected === card.id ? 'is-selected' : ''}`}
                              data-testid="player-card"
                              aria-label={`Select ${describe(card)}`}
                              aria-pressed={selected === card.id}
                              disabled={!canPlay}
                              onClick={() => {
                                setSelected(card.id === selected ? null : card.id);
                                setError('');
                                sound('menu');
                              }}
                            >
                              <Card
                                card={card}
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
                      <button className="card-inspector" onClick={() => setDetail(selectedCard)}>
                        <strong>{selectedCard.name}</strong>
                        <span>Inspect artwork ↗</span>
                      </button>
                    )}
                  </div>
                  <div className="board-area">
                    <div
                      className={`turn-banner ${game.turn === other ? 'cpu-turn' : ''}`}
                      role="status"
                      aria-live="polite"
                    >
                      {resolving
                        ? 'RESOLVING CAPTURES…'
                        : match.status === 'complete'
                          ? 'MATCH COMPLETE'
                          : game.turn === seat
                            ? selected
                              ? 'Choose an empty space'
                              : 'Your turn · Select a card'
                            : `${match.names[other]} is ${match.mode === 'solo' ? 'thinking' : 'playing'}…`}
                      {match.mode !== 'solo' && match.status === 'playing' && (
                        <small>
                          {' '}
                          · {Math.max(0, Math.ceil(((match.deadline ?? clock) - clock) / 1000))}s
                        </small>
                      )}
                    </div>
                    {match.status === 'complete' && !resultOpen && (
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
                        return (
                          <button
                            key={cell}
                            data-testid={`cell-${cell}`}
                            data-element={game.cellElements?.[cell] ?? undefined}
                            data-owner={item?.owner}
                            className={`board-cell ${!item && selected && canPlay ? 'legal-cell' : ''}`}
                            disabled={!item && !canPlay}
                            onClick={() => (item ? setDetail(item.card) : place(cell))}
                            aria-label={`Row ${Math.floor(cell / 3) + 1}, column ${(cell % 3) + 1}${item ? `: ${describe(item.card)}, ${item.owner === seat ? 'your' : 'opponent'} card` : ': empty'}`}
                          >
                            <span className="cell-coordinate">
                              {String.fromCharCode(65 + Math.floor(cell / 3))}
                              {(cell % 3) + 1}
                            </span>
                            {match.rules.elemental && game.cellElements?.[cell] && (
                              <ElementIcon
                                element={game.cellElements[cell]!}
                                className="cell-element"
                              />
                            )}
                            {item ? (
                              <Card
                                key={`${item.card.id}-${item.owner}`}
                                card={item.card}
                                showElement={!!match.rules.elemental}
                                modifier={elementalModifier(game, item.card, cell)}
                                owner={item.owner === seat ? 0 : 1}
                                captured={!!capture}
                                captureReason={capture?.reason}
                                captureOrder={Math.max(
                                  0,
                                  latest?.captures.findIndex((c) => c.cell === cell) ?? 0,
                                )}
                              />
                            ) : (
                              <span className="cell-cross">+</span>
                            )}
                          </button>
                        );
                      })}
                      {callout && (
                        <div key={game.history.length} className="battle-callout" role="status">
                          {callout}
                        </div>
                      )}
                    </div>
                    <div className="board-bottom">
                      <span>
                        <i className="legend-dot mint-dot" /> YOU
                      </span>
                      <span>{game.history.length}/9 PLACED</span>
                      <span>
                        <i className="legend-dot rose-dot" /> OPPONENT
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
                          onClick={() => card && setDetail(card)}
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
                        <span>{i + 1}</span> {match.names[turn.move.player]} ·{' '}
                        {String.fromCharCode(65 + Math.floor(turn.move.cell / 3))}
                        {(turn.move.cell % 3) + 1}
                        {turn.captures.length
                          ? ` · ${turn.captures.map((c) => `${c.reason} ${String.fromCharCode(65 + Math.floor(c.cell / 3))}${(c.cell % 3) + 1}`).join(', ')}`
                          : ''}
                      </li>
                    ))}
                  </ol>
                </details>
              </>
            )
          )}
        </section>
      )}
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
      <CardDetail card={detail} onClose={() => setDetail(null)} />
      {match?.status === 'complete' && !resolving && resultOpen && (
        <ResultOverlay
          match={match}
          busy={busy}
          onClose={() => setResultOpen(false)}
          onPlayAgain={start}
          onClaim={(cardId) => action(`/matches/${match.id}/claim`, { cardId })}
        />
      )}
    </div>
  );
}
