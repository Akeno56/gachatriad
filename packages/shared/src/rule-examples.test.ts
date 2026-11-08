import { expect, it } from 'vitest';
import { ruleExample } from './rule-examples';
it('teaches Same, Plus and the subsequent Combo with legal engine replays', () => {
  for (const rule of ['same', 'plus', 'combo'] as const) {
    const { before, after, captures } = ruleExample(rule);
    expect(before.board[4]).toBeNull();
    expect(before.turn).toBe(0);
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
