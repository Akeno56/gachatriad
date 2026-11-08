import { it, expect } from 'vitest';
import { draftPool, rollRarity, rollFinish } from './draft-packs';
import { CARDS, HOLO_VARIANTS } from '@gacha-triad/shared';
import { ECONOMY } from '@gacha-triad/shared/platform';
import { buildBestDeck, validateDeck } from '@gacha-triad/engine';
it('uses exact revised rarity and Holo boundaries for ordinary and Draft slots', () => {
  expect(
    Array.from({ length: 100 }, (_, n) => rollRarity(ECONOMY.standardWeights, () => n)),
  ).toEqual([...[50, 27, 17, 5, 1].flatMap((count, i) => Array(count).fill(i + 1))]);
  expect(
    Array.from({ length: 100 }, (_, n) => rollRarity(ECONOMY.guaranteedWeights, () => n)),
  ).toEqual([...[80, 17, 3].flatMap((count, i) => Array(count).fill(i + 3))]);
  expect(
    Array.from({ length: 100 }, (_, n) => rollRarity(ECONOMY.draftGuaranteedWeights, () => n)),
  ).toEqual([...Array(85).fill(4), ...Array(15).fill(5)]);
  const base = CARDS[0],
    variants = HOLO_VARIANTS.filter((c) => c.baseCardId === base.id);
  expect(rollFinish(base.id, ECONOMY.holoPer10000, (n) => (n === 10000 ? 49 : 0))).toBe(
    variants[0].id,
  );
  expect(rollFinish(base.id, ECONOMY.holoPer10000, () => 50)).toBe(base.id);
  expect(rollFinish(base.id, ECONOMY.draftHoloPer10000, (n) => (n === 10000 ? 499 : 0))).toBe(
    variants[0].id,
  );
  expect(rollFinish(base.id, ECONOMY.draftHoloPer10000, () => 500)).toBe(base.id);
});
it('rolls three ordered five-card Draft boosters with both guarantees and a legal deck', () => {
  for (let n = 0; n < 100; n++) {
    const pool = draftPool();
    expect(pool).toHaveLength(15);
    expect(new Set(pool.map((c) => c.baseCardId ?? c.id)).size).toBe(15);
    for (let pack = 0; pack < 3; pack++) {
      expect(pool[pack * 5 + 3].rarity).toBeGreaterThanOrEqual(3);
      expect(pool[pack * 5 + 4].rarity).toBeGreaterThanOrEqual(4);
    }
    expect(validateDeck(buildBestDeck(pool))).toEqual([]);
  }
});
