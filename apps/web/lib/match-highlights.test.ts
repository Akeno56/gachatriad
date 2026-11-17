import { expect, it } from 'vitest';
import { TRAINING_STEPS } from '@gacha-triad/shared/training-duel';
import { matchHighlights } from './match-highlights';

it('counts capture events and one special activation per turn from the engine replay', () => {
  const state = TRAINING_STEPS[10].after!;
  const game = { ...state, hands: [[], []] as const };
  expect(matchHighlights({ game, seat: 0 })).toEqual({
    captures: 5,
    specialTurns: 1,
    bestCombo: 2,
  });
  expect(matchHighlights({ game, seat: 1 })).toEqual({
    captures: 2,
    specialTurns: 0,
    bestCombo: 0,
  });
});

it('handles a duel ending before any card was played', () => {
  expect(matchHighlights({ game: null, seat: 0 })).toEqual({
    captures: 0,
    specialTurns: 0,
    bestCombo: 0,
  });
});
