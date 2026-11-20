import { it, expect } from 'vitest';
import { applyMove, legalMoves, type GameState } from '@gacha-triad/engine';
import { TRAINING_STEPS } from '@gacha-triad/shared/training-duel';
import { captureFrames, capturePhases } from './capture-presentation';
it('presents Same, Plus, ordinary captures and Combo as separate ordered phases', () => {
  const phases = capturePhases([
    { cell: 0, from: 1, to: 0, reason: 'same' },
    { cell: 2, from: 1, to: 0, reason: 'plus' },
    { cell: 3, from: 1, to: 0, reason: 'combo' },
    { cell: 4, from: 1, to: 0, reason: 'combo' },
  ]);
  expect(phases.map((p) => p.label)).toEqual(['SAME', 'PLUS', 'COMBO']);
  expect(phases.map((p) => p.captures.map((c) => c.cell))).toEqual([[0], [2], [3, 4]]);
});

it('rewinds bundled replies and restores hidden hand slots without exposing their cards', () => {
  const lesson = TRAINING_STEPS[10];
  const intermediate = lesson.after!;
  const reply = legalMoves(intermediate).find(
    (move) => !!applyMove(intermediate, move).history.at(-1)?.captures.length,
  )!;
  const final = applyMove(intermediate, reply);
  const view = (game: GameState) => ({
    ...game,
    hands: [
      game.hands[0].map((card) => ({ slotId: card.id, card })),
      game.hands[1].map((card) => ({ slotId: card.id, card: null })),
    ] as const,
  });
  const incoming = view(final);
  const [earlier, latest] = captureFrames(view(lesson.before), incoming);
  expect(earlier.board).toEqual(intermediate.board);
  expect(earlier.history).toEqual(intermediate.history);
  expect(earlier.hands[1]).toHaveLength(intermediate.hands[1].length);
  expect(earlier.hands[1].every(({ card }) => card === null)).toBe(true);
  expect(latest).toBe(incoming);
});
