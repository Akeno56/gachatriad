import type { GameState } from '@gacha-triad/engine';
export interface PuzzleEntry {
  rank: number;
  playerId: string;
  name: string;
  attempts: number;
  elapsedMs: number;
}
export interface DailyPuzzleView {
  day: string;
  resetsAt: string;
  reward: number;
  state: GameState | null;
  version: number;
  attempts: number;
  solved: boolean;
  rewarded: boolean;
  registered: boolean;
  elapsedMs: number | null;
  leaderboard: PuzzleEntry[];
}
