import { expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  distributeStats,
  normalizeTier,
  proposeBalance,
  type SourceCharacter,
} from './index';
const source = (rarity = 'S', tier = 'T0', universe = 'nte'): SourceCharacter => ({
  id: `${universe}:test`,
  name: 'Test',
  universeId: universe,
  sourceRarity: rarity,
  sourceElement: 'Chaos',
  tierPlacements: [{ tier }],
});
it('normalizes numeric and letter rarities through explicit game ladders', () => {
  expect(proposeBalance(source('5', 'T0', 'genshin')).powerIndex).toBe(100);
  expect(proposeBalance(source('S', 'T0', 'zenless')).powerIndex).toBe(100);
  expect(proposeBalance(source('5', 'T0', 'endfield')).powerIndex).toBe(87.5);
  expect(proposeBalance(source('4', 'T5', 'star-rail'))).toMatchObject({
    powerIndex: 0,
    triadRarity: 1,
    statBudget: 12,
  });
});
it('reproduces the four sheet examples consistently without copying placeholder budgets', () => {
  expect(proposeBalance(source('4', 'T5', 'star-rail'))).toMatchObject({
    triadRarity: 1,
    statBudget: 12,
  });
  expect(proposeBalance(source('5', 'T0', 'genshin'))).toMatchObject({
    triadRarity: 5,
    statBudget: 28,
  });
  expect(proposeBalance(source('S', 'T0', 'nte'))).toMatchObject({
    triadRarity: 5,
    statBudget: 28,
  });
  expect(proposeBalance(source('S', 'T1', 'zenless'))).toMatchObject({
    powerIndex: 85,
    triadRarity: 4,
    statBudget: 23,
  });
});
it('handles half tiers and rejects unsupported labels rather than assuming worst', () => {
  expect(normalizeTier('T0.5')).toBe(0.9);
  expect(normalizeTier('Unranked')).toBeNull();
  expect(normalizeTier('T6')).toBeNull();
  expect(proposeBalance({ ...source(), tierPlacements: [] })).toMatchObject({
    status: 'insufficient-data',
    stats: null,
  });
  expect(proposeBalance(source('?'))).toMatchObject({ status: 'insufficient-data', stats: null });
});
it('does not let duplicate appearances or best-of-role selection inflate a score', () => {
  const c = {
    ...source(),
    tierPlacements: [
      { tier: 'T0', role: 'DPS' },
      { tier: 'T0', role: 'DPS' },
      { tier: 'T4', role: 'Support' },
    ],
  };
  expect(proposeBalance(c).powerIndex).toBe(70);
});
it('flags unmapped elements and copy assumptions, and keeps element independent of tier', () => {
  const c = {
    ...source(),
    sourceElement: 'Quantum',
    tierPlacements: [{ tier: 'T0', assumptions: 'E6' }],
  };
  expect(proposeBalance(c).status).toBe('needs-review');
  expect(proposeBalance(c).notes).toHaveLength(2);
  expect(proposeBalance(source('S', 'T0')).element).toBe(proposeBalance(source('S', 'T5')).element);
});
it('produces legal deterministic stat spreads with exact budgets across all supported inputs', () => {
  for (const [universe, ladder] of Object.entries(DEFAULT_CONFIG.sourceRarities))
    for (const r of Object.keys(ladder))
      for (let t = 0; t <= 5; t += 0.5) {
        const c = source(r, `T${t}`, universe);
        const result = proposeBalance(c);
        expect(result).toEqual(proposeBalance(c));
        expect(result.stats?.reduce((a, b) => a + b, 0)).toBe(result.statBudget);
        expect(result.stats?.every((n) => Number.isInteger(n) && n >= 1 && n <= 10)).toBe(true);
        const band = DEFAULT_CONFIG.bands.find((b) => b.rarity === result.triadRarity)!;
        expect(result.stats?.every((n) => n <= band.sideCap)).toBe(true);
      }
  expect(() => distributeStats(41, 10, [1, 1, 1, 1])).toThrow();
  expect(() => distributeStats(0, 10, [1, 1, 1, 1])).toThrow();
});
it('scores monotonically within a fixed game and source rarity', () => {
  let last = Infinity;
  for (let t = 0; t <= 5; t += 0.1) {
    const p = proposeBalance(source('S', `T${t.toFixed(1)}`));
    expect(p.statBudget!).toBeLessThanOrEqual(last);
    last = p.statBudget!;
  }
});
