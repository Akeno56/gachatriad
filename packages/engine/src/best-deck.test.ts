import { expect, it } from 'vitest';
import { buildBestDeck, validateDeck, seededRandom, type Card } from './index';
function card(id: string, rarity: number, value = 1): Card {
  return {
    id,
    characterId: id,
    universeId: 'test',
    name: id,
    rarity,
    stats: [value, value, value, value],
    set: 'test',
    enabled: true,
  };
}
it('maximizes total rarity before side values and retains a legal unique deck', () => {
  const pool = [
    card('five-low', 5, 1),
    card('five-high', 5, 8),
    card('four-low', 4, 1),
    card('four-high', 4, 7),
    card('a', 3, 1),
    card('b', 3, 2),
    card('c', 3, 3),
    card('two', 2, 10),
    { ...card('disabled', 5, 10), enabled: false },
  ];
  const selected = buildBestDeck(pool);
  expect(selected.map((c) => c.id)).toEqual(['five-high', 'four-high', 'c', 'b', 'a']);
  expect(validateDeck(selected)).toEqual([]);
  expect(buildBestDeck(pool.filter((c) => c.rarity !== 5)).map((c) => c.id)).toEqual([
    'four-high',
    'four-low',
    'c',
    'b',
    'a',
  ]);
});
it('treats Holo and Standard as the same character and handles sparse legal pools', () => {
  const pool = [
    card('a', 5),
    { ...card('a-holo', 5), baseCardId: 'a', finish: 'holo' as const },
    card('b', 4),
    card('c', 3),
    card('d', 2),
    card('e', 1),
  ];
  expect(buildBestDeck(pool)).toHaveLength(5);
  expect(validateDeck(buildBestDeck(pool))).toEqual([]);
  expect(() => buildBestDeck(pool.slice(0, 5))).toThrow('legal deck');
});
it('varies equivalent-rarity choices while preserving the maximal rarity budget', () => {
  const pool = Array.from({ length: 25 }, (_, i) =>
    card(`variety-${i}`, 1 + (i % 5), 1 + (i % 10)),
  );
  const variants = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const next = buildBestDeck(pool, seededRandom(i));
    expect(validateDeck(next)).toEqual([]);
    expect(next.reduce((sum, c) => sum + c.rarity, 0)).toBe(18);
    variants.add(
      next
        .map((c) => c.id)
        .sort()
        .join('|'),
    );
  }
  expect(variants.size).toBeGreaterThan(10);
});
it('matches exhaustive legal choices for mixed pools', () => {
  for (let seed = 0; seed < 12; seed++) {
    const pool = Array.from({ length: 10 }, (_, i) =>
      card(`c${i}`, 1 + ((i * 7 + seed * 3) % 5), 1 + ((i + seed) % 10)),
    );
    let best = -1;
    for (let a = 0; a < 6; a++)
      for (let b = a + 1; b < 7; b++)
        for (let c = b + 1; c < 8; c++)
          for (let d = c + 1; d < 9; d++)
            for (let e = d + 1; e < 10; e++) {
              const candidate = [pool[a], pool[b], pool[c], pool[d], pool[e]];
              if (!validateDeck(candidate).length)
                best = Math.max(
                  best,
                  candidate.reduce(
                    (s, c) => s + c.rarity * 1000 + c.stats.reduce((s, n) => s + n, 0),
                    0,
                  ),
                );
            }
    expect(
      buildBestDeck(pool).reduce(
        (s, c) => s + c.rarity * 1000 + c.stats.reduce((s, n) => s + n, 0),
        0,
      ),
    ).toBe(best);
  }
});
