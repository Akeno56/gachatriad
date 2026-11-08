import { it, expect } from 'vitest';
import { applyMove, validateMove, scores, winner, elementalModifier } from '@gacha-triad/engine';
import { TRAINING_MOVES, TRAINING_STEPS, trainingStart } from './training-duel';
it('plays a legal nine-turn training duel with basic, Same, Plus, Combo and Elemental captures', () => {
  let game = trainingStart();
  for (const move of TRAINING_MOVES) {
    expect(validateMove(game, move)).toBeNull();
    game = applyMove(game, move);
  }
  expect(game.history).toHaveLength(9);
  expect(game.status).toBe('complete');
  expect(scores(game)).toEqual([9, 1]);
  expect(winner(game)).toBe(0);
  expect(game.history[2].captures).toEqual([{ cell: 1, from: 1, to: 0, reason: 'standard' }]);
  const captures = game.history[6].captures;
  expect(captures.filter((c) => c.reason === 'same')).toHaveLength(1);
  expect(captures.filter((c) => c.reason === 'plus')).toHaveLength(1);
  expect(captures.filter((c) => c.reason === 'combo')).toHaveLength(2);
  expect(elementalModifier(game, game.board[7]!.card, 7)).toBe(1);
});
it('replays Same and Plus independently through the real engine', () => {
  for (const [index, reason] of [
    [8, 'same'],
    [9, 'plus'],
  ] as const) {
    const step = TRAINING_STEPS[index];
    expect(validateMove(step.before, step.move!)).toBeNull();
    expect(step.after!.history.at(-1)!.captures.every((c) => c.reason === reason)).toBe(true);
  }
});
