import type {
  Card,
  Capture,
  Element,
  Move,
  Player,
  Rules,
  CpuStyle,
  GameState,
} from '@gacha-triad/engine';
import type { Mode } from './platform';
export interface ReplayFrame {
  board: ({ cardId: string; owner: Player; originalOwner: Player } | null)[];
  hands: [string[], string[]];
  turn: Player;
  move: Move | null;
  captures: Capture[];
  score: [number, number];
}
export interface ReplayPlayer {
  name: string;
  avatar: Card | null;
  botStyle: CpuStyle | null;
}
export interface ReplayData {
  id: string;
  mode: Mode;
  season: number;
  completedAt: string;
  players: [ReplayPlayer, ReplayPlayer];
  decks: [Card[], Card[]];
  rules: Rules;
  cellElements: (Element | null)[];
  revealed?: GameState['revealed'];
  frames: ReplayFrame[];
  winner: Player | 'draw';
  endReason: string | null;
  ratings: ({ before: number; after: number } | null)[];
  tradeRule: 'none' | 'one';
  tradePending: boolean;
  claimedCardId: string | null;
}
export interface ReplayView extends ReplayData {
  seat: Player;
  favorite: boolean;
}
export interface ReplayEntry {
  id: string;
  mode: Mode;
  completedAt: string;
  opponent: ReplayPlayer;
  result: 'win' | 'loss' | 'draw';
  score: [number, number];
  turns: number;
  endReason: string | null;
  ratingDelta: number | null;
  favorite: boolean;
}
export interface ReplayList {
  rows: ReplayEntry[];
  total: number;
  offset: number;
  limit: number;
}

/** Rebuild practice from a saved frame, using the archived cards and ownership. */
export function replayPracticePosition(replay: ReplayView, step: number): GameState | null {
  const frame = replay.frames[step];
  if (
    !frame ||
    frame.turn !== replay.seat ||
    frame.board.length !== 9 ||
    frame.board.every(Boolean) ||
    replay.decks.some((deck) => deck.length !== 5)
  )
    return null;
  const definitions = replay.decks.map((deck) => new Map(deck.map((card) => [card.id, card])));
  const board = frame.board.map((slot) => {
    if (!slot) return null;
    const card = definitions[slot.originalOwner].get(slot.cardId);
    return card ? { card, owner: slot.owner, originalOwner: slot.originalOwner } : undefined;
  });
  const hands = frame.hands.map((hand, seat) =>
    hand.flatMap((id) => definitions[seat].get(id) ?? []),
  ) as [Card[], Card[]];
  if (
    board.some((slot) => slot === undefined) ||
    hands.some(
      (hand, seat) =>
        hand.length !== frame.hands[seat].length ||
        hand.length + board.filter((slot) => slot?.originalOwner === seat).length !== 5,
    ) ||
    !hands[frame.turn].length
  )
    return null;
  return {
    board: board.map((slot) => slot ?? null),
    hands,
    turn: frame.turn,
    firstPlayer: replay.frames[0].turn,
    rules: replay.rules,
    history: replay.frames
      .slice(1, step + 1)
      .flatMap(({ move, captures }) => (move ? [{ move, captures }] : [])),
    status: 'playing',
    revealed: replay.revealed ?? [[], []],
    cellElements: replay.cellElements,
  };
}
