import { expect, it } from 'vitest';
import catalog from '../../../data/cards/catalog.json' with { type: 'json' };
import { CARDS, ALL_CARDS, HOLO_VARIANTS } from './index';
import { diversifySpreads } from './stat-spreads';
it('allows identical digits at different directional positions to coexist', () => {
  const a = { ...CARDS[0], id: 'rotation-a', stats: [4, 4, 5, 4] as const },
    b = { ...CARDS[0], id: 'rotation-b', stats: [4, 5, 4, 4] as const };
  expect(diversifySpreads([a, b]).map((c) => c.stats)).toEqual([a.stats, b.stats]);
});
it('repairs a unique low-rarity spread above 8 without changing its total', () => {
  const original = { ...CARDS[0], id: 'cap-review', rarity: 3, stats: [10, 9, 3, 2] as const };
  const [fixed] = diversifySpreads([original]);
  expect(fixed.stats.every((n) => n >= 1 && n <= 8)).toBe(true);
  expect(fixed.stats.reduce((a, b) => a + b, 0)).toBe(24);
});
it('balances the least-used spread after all possibilities for a total are exhausted', () => {
  const cards = Array.from({ length: 13 }, (_, i) => ({
    ...CARDS[0],
    id: `small-${i}`,
    stats: [2, 1, 1, 1] as const,
  }));
  const counts = new Map<string, number>();
  for (const card of diversifySpreads(cards))
    counts.set(card.stats.join('/'), (counts.get(card.stats.join('/')) || 0) + 1);
  expect(counts.size).toBe(4);
  expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBe(1);
});
it('preserves totals, rarities, IDs and the Aha override while removing repeated exact spreads', () => {
  expect(diversifySpreads(CARDS)).toEqual(CARDS);
  expect(diversifySpreads([...CARDS].reverse()).map((c) => c.stats)).toEqual(
    [...CARDS].reverse().map((c) => c.stats),
  );
  for (const old of catalog) {
    const current = CARDS.find((c) => c.id === old.id)!;
    expect(current.rarity).toBe(old.rarity);
    expect(current.stats.reduce((a, b) => a + b, 0)).toBe(old.stats.reduce((a, b) => a + b, 0));
    expect(
      current.stats.every(
        (n) => Number.isInteger(n) && n >= 1 && n <= (current.rarity <= 3 ? 8 : 10),
      ),
    ).toBe(true);
  }
  expect(new Set(CARDS.map((c) => c.stats.join('/'))).size).toBe(CARDS.length);
  expect(CARDS.find((c) => c.id === 'star-rail:aha')!.stats).toEqual([10, 8, 10, 2]);
});
it('keeps every previously issued Holo ID valid with exactly one capped +1', () => {
  for (const old of catalog) {
    const eligible = old.stats.flatMap((n, i) => (n < 10 ? [i] : [])),
      legacy = eligible[[...old.id].reduce((n, c) => n + c.charCodeAt(0), 0) % eligible.length];
    for (const side of eligible) {
      const id = side === legacy ? `${old.id}::holo` : `${old.id}::holo:${side}`;
      const current = ALL_CARDS.find((c) => c.id === id)!;
      expect(current).toBeDefined();
      const base = CARDS.find((c) => c.id === old.id)!;
      expect(current.stats.reduce((a, b) => a + b, 0)).toBe(
        base.stats.reduce((a, b) => a + b, 0) + 1,
      );
      expect(current.stats.every((n) => n <= (current.rarity <= 3 ? 8 : 10))).toBe(true);
    }
    const directions = new Set(
      HOLO_VARIANTS.filter((c) => c.baseCardId === old.id).map((c) => c.holoBonusSide),
    );
    expect(directions.size).toBe(
      CARDS.find((c) => c.id === old.id)!.stats.filter((n) => n < (old.rarity <= 3 ? 8 : 10))
        .length,
    );
  }
});
