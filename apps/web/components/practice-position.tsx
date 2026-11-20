'use client';

import { useState, type ReactNode } from 'react';
import {
  applyMove,
  elementalModifier,
  isRevealed,
  scores,
  validateMove,
  winner,
  type GameState,
  type Move,
  type Player,
} from '@gacha-triad/engine';
import { Card } from './card';
import { ElementIcon } from './element-icon';
import { LocaleView } from './i18n';
import { useGameAudio } from './game-shell';
import { Button } from './ui';

export function cellName(cell: number) {
  return `${String.fromCharCode(65 + Math.floor(cell / 3))}${(cell % 3) + 1}`;
}

export function PracticeBoard({
  state,
  selected,
  seat = 0,
  busy = false,
  label,
  statusId,
  lastCell,
  onPlace,
}: {
  state: GameState;
  selected: string | null;
  seat?: Player;
  busy?: boolean;
  label: string;
  statusId?: string;
  lastCell?: number;
  onPlace: (cell: number) => void;
}) {
  const available = !busy && !!selected && state.status === 'playing' && state.turn === seat;
  return (
    <LocaleView>
      <section className="menu-window puzzle-table" aria-label={label} aria-describedby={statusId}>
        <div className="puzzle-board-space">
          <div className="puzzle-board">
            {state.board.map((placed, cell) => {
              const element = state.cellElements?.[cell];
              return (
                <button
                  key={cell}
                  className={`puzzle-cell ${!placed && available ? 'is-legal' : ''} ${lastCell === cell ? 'replay-last-move' : ''}`}
                  data-testid={`puzzle-cell-${cell}`}
                  disabled={!!placed || !available}
                  aria-label={
                    placed ? `Occupied cell ${cell + 1}` : `Place card in cell ${cell + 1}`
                  }
                  onClick={() => onPlace(cell)}
                >
                  {placed ? (
                    <Card
                      card={placed.card}
                      owner={placed.owner === seat ? 0 : 1}
                      showElement={!!state.rules.elemental}
                      modifier={elementalModifier(state, placed.card, cell)}
                    />
                  ) : (
                    <span className="practice-cell-mark">
                      {cellName(cell)}
                      {element && <ElementIcon element={element} />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </LocaleView>
  );
}

export function PracticeHands({
  state,
  selected,
  seat = 0,
  busy = false,
  ownLabel = 'Your puzzle hand',
  onSelect,
}: {
  state: GameState;
  selected: string | null;
  seat?: Player;
  busy?: boolean;
  ownLabel?: string;
  onSelect: (id: string) => void;
}) {
  const opponent = seat === 0 ? 1 : 0;
  return (
    <LocaleView>
      <div className="puzzle-reserves">
        <section className="menu-window puzzle-reserve">
          <h2>{ownLabel}</h2>
          <div className="puzzle-hand" aria-label={ownLabel}>
            {state.hands[seat].map((card) => (
              <button
                key={card.id}
                disabled={busy || state.status === 'complete' || state.turn !== seat}
                aria-label={`Select ${card.name}`}
                aria-pressed={selected === card.id}
                onClick={() => onSelect(card.id)}
              >
                <Card card={card} owner={0} showElement={!!state.rules.elemental} />
              </button>
            ))}
            {!state.hands[seat].length && <p>No cards remaining.</p>}
          </div>
        </section>
        <section className="menu-window puzzle-reserve">
          <h2>Opponent’s remaining cards</h2>
          <div className="puzzle-hand" aria-label="Opponent’s remaining cards">
            {state.hands[opponent].map((card) => {
              const visible = isRevealed(state, opponent, card.id);
              return (
                <div key={card.id} aria-label={visible ? undefined : 'Hidden opponent card'}>
                  <Card
                    card={visible ? card : undefined}
                    owner={1}
                    showElement={!!state.rules.elemental}
                  />
                </div>
              );
            })}
            {!state.hands[opponent].length && <p>No cards remaining.</p>}
          </div>
        </section>
      </div>
    </LocaleView>
  );
}

export function PracticePosition({
  initial,
  seat = 0,
  respond,
  restartLabel,
  children,
}: {
  initial: GameState;
  seat?: Player;
  respond: (state: GameState) => Move | null;
  restartLabel: string;
  children?: ReactNode;
}) {
  const [state, setState] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const sound = useGameAudio();
  const score = scores(state);
  const result = winner(state);
  function place(cell: number) {
    if (!selected) return;
    const move = { player: seat, cardId: selected, cell };
    if (validateMove(state, move)) return;
    let next = applyMove(state, move);
    if (next.status === 'playing') {
      const reply = respond(next);
      if (reply) next = applyMove(next, reply);
    }
    setState(next);
    setSelected(null);
    const outcome = winner(next);
    sound(
      outcome === null
        ? 'place'
        : outcome === 'draw'
          ? 'draw'
          : outcome === seat
            ? 'victory'
            : 'defeat',
    );
  }
  return (
    <LocaleView>
      <section className="practice-surface" aria-label="Practice position">
        <div className="practice-turn">
          <div className="puzzle-score" aria-label="Match score">
            <strong>You {score[seat]}</strong>
            <span>—</span>
            <strong>Opponent {score[1 - seat]}</strong>
          </div>
          <p id="practice-turn-status" role="status">
            {result === 'draw'
              ? 'Draw'
              : result === seat
                ? 'Victory'
                : result !== null
                  ? 'Defeat'
                  : selected
                    ? 'Choose an empty space.'
                    : 'Choose a card from your hand.'}
          </p>
          <Button
            onClick={() => {
              setState(initial);
              setSelected(null);
            }}
          >
            {restartLabel}
          </Button>
        </div>
        <div className="puzzle-play-layout">
          <PracticeBoard
            state={state}
            seat={seat}
            selected={selected}
            label="Practice board"
            statusId="practice-turn-status"
            lastCell={
              state.history.length > initial.history.length
                ? state.history.at(-1)?.move.cell
                : undefined
            }
            onPlace={place}
          />
          <aside className="puzzle-sidebar">
            <PracticeHands
              state={state}
              seat={seat}
              selected={selected}
              ownLabel="Your hand"
              onSelect={setSelected}
            />
            {children}
          </aside>
        </div>
      </section>
    </LocaleView>
  );
}
