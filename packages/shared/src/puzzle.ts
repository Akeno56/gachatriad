import {
  applyMove,
  legalMoves,
  scores,
  type GameState,
  type Move,
  type Turn,
} from '@gacha-triad/engine';

export interface PuzzleArchivePage {
  days: string[];
  nextBefore: string | null;
}

export interface ArchivedPuzzle {
  day: string;
  state: GameState;
}

/** With three empty cells the daily endgame can be searched exactly. */
export function puzzleValue(state: GameState): number {
  if (state.status === 'complete') return scores(state)[0];
  const values = legalMoves(state).map((move) => puzzleValue(applyMove(state, move)));
  return state.turn === 0 ? Math.max(...values) : Math.min(...values);
}

function choices(state: GameState) {
  return legalMoves(state)
    .map((move) => ({ move, value: puzzleValue(applyMove(state, move)) }))
    .sort(
      (a, b) =>
        (state.turn === 0 ? b.value - a.value : a.value - b.value) ||
        a.move.cardId.localeCompare(b.move.cardId) ||
        a.move.cell - b.move.cell,
    );
}

export function bestPuzzleMove(state: GameState): Move | null {
  return choices(state)[0]?.move ?? null;
}

export function puzzleReview(state: GameState) {
  if (state.turn !== 0 || state.board.filter(Boolean).length !== 6) return null;
  const options = choices(state);
  if (!options[0] || options[0].value <= 5) return null;
  let current = applyMove(state, options[0].move);
  const line: Turn[] = [current.history.at(-1)!];
  while (current.status === 'playing') {
    const move = bestPuzzleMove(current);
    if (!move) return null;
    current = applyMove(current, move);
    line.push(current.history.at(-1)!);
  }
  return {
    line,
    score: scores(current),
    alternative: options.find(({ value }) => value <= 5) ?? null,
  };
}
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
