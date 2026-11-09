import { expect, it } from 'vitest';
import { createGame, PRESETS } from '@gacha-triad/engine';
import {
  CARDS,
  HOLO_CARDS,
  HOLO_VARIANTS,
  ALL_CARDS,
  CPU_DECK,
  STARTER_DECK,
  UNIVERSES,
} from './index';
import { validateDeck } from '@gacha-triad/engine';
import { BOOSTER_TYPES } from './platform';
it('provides two valid complete decks and stable unique catalog IDs', () => {
  expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
  expect(STARTER_DECK).toHaveLength(5);
  expect(CPU_DECK).toHaveLength(5);
  for (const c of CARDS) expect(UNIVERSES.some((u) => u.id === c.universeId)).toBe(true);
  for (const preset of PRESETS)
    expect(() => createGame([STARTER_DECK, CPU_DECK], preset.rules)).not.toThrow();
});
it('splits eight universes across the two booster pools and preserves the exact Aha override', () => {
  const one = BOOSTER_TYPES.find((type) => type.id === 'standard')!,
    two = BOOSTER_TYPES.find((type) => type.id === 'universe-ii')!;
  expect(one.universes).toHaveLength(4);
  expect(two.universes).toHaveLength(4);
  expect(new Set([...one.universes, ...two.universes]).size).toBe(8);
  for (const card of CARDS) expect([...one.universes, ...two.universes]).toContain(card.universeId);
  const aha = CARDS.find((card) => card.id === 'star-rail:aha')!;
  expect(aha.stats).toEqual([10, 8, 10, 2]);
  expect(aha.rarity).toBe(5);
  expect(
    Math.max(
      ...CARDS.filter((card) => card.id !== aha.id).map((card) =>
        card.stats.reduce((s, n) => s + n, 0),
      ),
    ),
  ).toBe(28);
  expect(
    [
      ...new Set(
        HOLO_VARIANTS.filter((card) => card.baseCardId === aha.id).map(
          (card) => card.holoBonusSide,
        ),
      ),
    ].sort(),
  ).toEqual([1, 3]);
  expect(CARDS.some((card) => ['star-rail:ellen', 'star-rail:astra-yao'].includes(card.id))).toBe(
    false,
  );
});
it('provides fixed +1 Holo variants without exceeding A or adding duplicate-character slots', () => {
  expect(HOLO_CARDS).toHaveLength(CARDS.length);
  expect(new Set(ALL_CARDS.map((card) => card.id)).size).toBe(ALL_CARDS.length);
  for (let i = 0; i < CARDS.length; i++) {
    expect(HOLO_CARDS[i]).toMatchObject({
      baseCardId: CARDS[i].id,
      rarity: CARDS[i].rarity,
      finish: 'holo',
    });
    expect(HOLO_CARDS[i].element).toBe(CARDS[i].element);
    const variants = HOLO_VARIANTS.filter((card) => card.baseCardId === CARDS[i].id);
    expect(new Set(variants.map((c) => c.holoBonusSide)).size).toBe(
      CARDS[i].stats.filter((value) => value < (CARDS[i].rarity <= 3 ? 8 : 10)).length,
    );
    for (const variant of variants) {
      expect(variant.stats.reduce((s, n) => s + n, 0)).toBe(
        CARDS[i].stats.reduce((s, n) => s + n, 0) + 1,
      );
      expect(variant.stats.every((value) => value <= (variant.rarity <= 3 ? 8 : 10))).toBe(true);
      expect(variant.stats.map((n, side) => n - CARDS[i].stats[side])).toEqual(
        [0, 1, 2, 3].map((side) => Number(side === variant.holoBonusSide)),
      );
    }
  }
  const base = STARTER_DECK[0],
    holo = HOLO_CARDS.find((c) => c.baseCardId === base.id)!;
  expect(validateDeck([base, holo, ...STARTER_DECK.slice(1, 4)])).toContain(
    'A deck cannot contain duplicate card definitions.',
  );
  expect(validateDeck([holo, ...STARTER_DECK.slice(1)])).toEqual([]);
});
