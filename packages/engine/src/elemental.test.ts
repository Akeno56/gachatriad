import { expect, it } from 'vitest';
import {
  applyMove,
  createGame,
  elementalModifier,
  seededRandom,
  STANDARD,
  type Card,
  type Stats,
  type GameState,
  type Element,
  type Rules,
} from './index';
const card = (id: string, stats: Stats = [4, 4, 4, 4], element?: string): Card => ({
  id,
  stats,
  element,
  characterId: id,
  universeId: 'test',
  name: id,
  rarity: 1,
  set: 'test',
  enabled: true,
});
function fixture(
  attack: Card,
  placed: [number, Card][],
  marks: Record<number, Element>,
  rules: Partial<Rules> = {},
) {
  const game = createGame(
    [
      [attack, ...Array.from({ length: 4 }, (_, i) => card('a' + i))],
      Array.from({ length: 5 }, (_, i) => card('b' + i)),
    ],
    { ...STANDARD, elemental: true, ...rules },
    () => 0,
  );
  const board = [...game.board];
  for (const [cell, c] of placed) board[cell] = { card: c, owner: 1, originalOwner: 1 };
  return {
    ...game,
    board,
    cellElements: Array.from({ length: 9 }, (_, i) => marks[i] ?? null),
  } as GameState;
}
const play = (s: GameState) => applyMove(s, { player: 0, cardId: 'attack', cell: 4 });
it('generates one to five deterministic marked cells once and leaves non-elemental games neutral', () => {
  const d = Array.from({ length: 5 }, (_, i) => card(String(i)));
  for (let seed = 0; seed < 50; seed++) {
    const a = createGame([d, d], { ...STANDARD, elemental: true }, seededRandom(seed)),
      b = createGame([d, d], { ...STANDARD, elemental: true }, seededRandom(seed));
    expect(a.cellElements).toEqual(b.cellElements);
    expect(a.cellElements!.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect(a.cellElements!.filter(Boolean).length).toBeLessThanOrEqual(5);
    const next = applyMove(a, { player: a.turn, cardId: a.hands[a.turn][0].id, cell: 0 });
    expect(next.cellElements).toEqual(a.cellElements);
  }
  expect(createGame([d, d]).cellElements).toEqual(Array(9).fill(null));
});
it('matches give +1 and mismatches including no affinity give −1, without changing printed stats', () => {
  const attack = card('attack', [4, 4, 4, 4], 'fire');
  const s = fixture(attack, [[5, card('target')]], { 4: 'fire' });
  expect(play(s).board[5]?.owner).toBe(0);
  expect(s.hands[0][0].stats).toEqual([4, 4, 4, 4]);
  expect(elementalModifier(s, attack, 4)).toBe(1);
  expect(elementalModifier(s, card('neutral'), 4)).toBe(-1);
  expect(elementalModifier(s, card('ice', undefined, 'ice'), 4)).toBe(-1);
  expect(elementalModifier(s, attack, 0)).toBe(0);
});
it('applies defenders’ cells too and keeps their modifier after a capture', () => {
  const a = card('attack', [4, 5, 4, 4]);
  const s = fixture(a, [[5, card('target', [4, 4, 4, 5], 'fire')]], { 5: 'fire' });
  expect(play(s).board[5]?.owner).toBe(1);
  const t = fixture(card('attack'), [[5, card('target')]], { 5: 'fire' });
  const next = play(t);
  expect(next.board[5]?.owner).toBe(0);
  expect(elementalModifier(next, next.board[5]!.card, 5)).toBe(-1);
});
it('penalties can prevent a normal capture and effective ranks can reach zero or eleven', () => {
  const s = fixture(card('attack', [1, 4, 10, 4], 'ice'), [[5, card('target', [3, 3, 3, 3])]], {
    4: 'fire',
  });
  expect(play(s).board[5]?.owner).toBe(1);
  expect(s.hands[0][0].stats[0] + elementalModifier(s, s.hands[0][0], 4)).toBe(0);
  const high = card('high', [10, 10, 10, 10], 'fire');
  expect(high.stats[0] + elementalModifier(s, high, 4)).toBe(11);
});
it('Same uses printed values despite different elemental modifiers', () => {
  const s = fixture(
    card('attack', [5, 5, 1, 1], 'ice'),
    [
      [1, card('top', [1, 1, 5, 1], 'fire')],
      [5, card('right', [1, 1, 1, 5])],
    ],
    { 4: 'fire', 1: 'fire' },
    { same: true },
  );
  expect(
    play(s)
      .history.at(-1)!
      .captures.map((c) => c.reason),
  ).toEqual(['same', 'same']);
});
it('Plus uses printed sums and Combo comparisons use the adjusted ordinary values', () => {
  const s = fixture(
    card('attack', [3, 4, 1, 1]),
    [
      [1, card('top', [1, 1, 5, 1])],
      [5, card('right', [4, 1, 1, 4], 'fire')],
      [2, card('chain', [1, 1, 4, 9])],
    ],
    { 5: 'fire' },
    { plus: true, combo: true },
  );
  const n = play(s);
  expect(n.history.at(-1)!.captures).toContainEqual({ cell: 2, from: 1, to: 0, reason: 'combo' });
  expect(n.board[2]?.owner).toBe(0);
});
