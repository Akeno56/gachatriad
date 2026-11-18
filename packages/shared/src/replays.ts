import type { Card, Capture, Element, Move, Player, Rules, CpuStyle } from '@gacha-triad/engine';
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
