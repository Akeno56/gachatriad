import { expect, it } from 'vitest';
import { applyMove, scores, validateMove } from '@gacha-triad/engine';
import { COMBO_SOLUTION, createComboLesson } from './combo-lesson';
it('replays a legal real-card lesson and performs Plus followed by two Combo flips', () => {
  const before = createComboLesson();
  expect(before.history).toHaveLength(6);
  expect(scores(before).reduce((a, b) => a + b)).toBe(10);
  expect(validateMove(before, COMBO_SOLUTION)).toBeNull();
  const after = applyMove(before, COMBO_SOLUTION);
  expect(after.history.at(-1)?.captures).toEqual([
    { cell: 4, from: 1, to: 0, reason: 'plus' },
    { cell: 0, from: 1, to: 0, reason: 'plus' },
    { cell: 5, from: 1, to: 0, reason: 'combo' },
    { cell: 3, from: 1, to: 0, reason: 'combo' },
  ]);
  for (const cell of [4, 0, 5, 3]) expect(after.board[cell]?.owner).toBe(0);
  expect(scores(after).reduce((a, b) => a + b)).toBe(10);
});
