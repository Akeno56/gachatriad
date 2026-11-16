import { expect, it } from 'vitest';
import { ruleExample } from './rule-examples';
import { CARDS } from './index';
import { validateDeck } from '@gacha-triad/engine';
it('teaches Same, Plus and the subsequent Combo with legal engine replays', () => {
  for (const rule of ['same', 'plus', 'combo'] as const) {
    const { before, after, captures } = ruleExample(rule);
    expect(before.board[4]).toBeNull();
    expect(before.turn).toBe(0);
    for (const [seat, remaining] of before.hands.entries()) {
      const hand = [
        ...remaining,
        ...before.history
          .filter((turn) => turn.move.player === seat)
          .map((turn) => CARDS.find((card) => card.id === turn.move.cardId)!),
      ];
      expect(validateDeck(hand)).toEqual([]);
      for (const card of hand) expect(card).toEqual(CARDS.find((real) => real.id === card.id));
    }
    for (const item of before.board.filter((item) => item !== null))
      expect(item.card).toEqual(CARDS.find((real) => real.id === item.card.id));
    expect(after.board[4]?.owner).toBe(0);
    expect(
      captures
        .filter((c) => c.reason === (rule === 'same' ? 'same' : 'plus'))
        .map((c) => c.cell)
        .sort(),
    ).toEqual([1, 5]);
    expect(captures.filter((c) => c.reason === 'combo').map((c) => c.cell)).toEqual(
      rule === 'combo' ? [8] : [],
    );
    expect(after.history).toHaveLength(rule === 'combo' ? 7 : 5);
  }
});
