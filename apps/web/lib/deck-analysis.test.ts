import { it, expect } from 'vitest';
import { analyseDeck } from './deck-analysis';
import type { Card } from '@gacha-triad/engine';
const card = (id: string, stats: Card['stats']): Card => ({
  id,
  characterId: id,
  name: id,
  universeId: 'test',
  set: 'test',
  enabled: true,
  rarity: 1,
  stats,
});
it('identifies exposed weak sides and a corner that protects them', () => {
  const result = analyseDeck([card('uneven', [10, 4, 2, 6])]);
  expect(result.strongest.name).toBe('Top');
  expect(result.weakest.name).toBe('Bottom');
  expect(result.high).toBe(1);
  expect(result.low).toBe(1);
  expect(result.corners[0]).toMatchObject({ corner: 2, exposed: [0, 3] });
});
it('uses the actual card values once, including a Holographic bonus already in the definition', () => {
  const holo = {
    ...card('holo', [7, 4, 3, 6]),
    finish: 'holo' as const,
    holoBonusSide: 0 as const,
  };
  const result = analyseDeck([holo, card('normal', [3, 6, 7, 4])]);
  expect(result.sides.map((side) => side.average)).toEqual([5, 5, 5, 5]);
  expect(result.balanced).toBe(true);
  expect(result.total).toBe(40);
});
it('keeps an empty or incomplete hand finite and reports its real sample size', () => {
  const empty = analyseDeck([]);
  expect(empty.sides.every((side) => side.average === 0)).toBe(true);
  expect(empty.total).toBe(0);
  expect(empty.corners).toEqual([]);
  const partial = analyseDeck([card('one', [1, 2, 3, 4]), card('two', [3, 4, 5, 6])]);
  expect(partial.sides[0].average).toBe(2);
  expect(partial.low).toBe(4);
});
