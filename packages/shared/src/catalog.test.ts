import { expect, it } from 'vitest';
import { createGame, PRESETS } from '@gacha-triad/engine';
import { CARDS, HOLO_CARDS, ALL_CARDS, CPU_DECK, STARTER_DECK, UNIVERSES } from './index';
import { validateDeck } from '@gacha-triad/engine';
it('provides two valid complete decks and stable unique catalog IDs', () => {
  expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
  expect(STARTER_DECK).toHaveLength(5);
  expect(CPU_DECK).toHaveLength(5);
  for (const c of CARDS) expect(UNIVERSES.some((u) => u.id === c.universeId)).toBe(true);
  for (const preset of PRESETS)
    expect(() => createGame([STARTER_DECK, CPU_DECK], preset.rules)).not.toThrow();
});
it('provides a cosmetic Holo finish for each card without adding gameplay power or duplicate-character slots', () => {
  expect(ALL_CARDS).toHaveLength(800);
  for (let i = 0; i < CARDS.length; i++) {
    expect(HOLO_CARDS[i]).toMatchObject({
      baseCardId: CARDS[i].id,
      stats: CARDS[i].stats,
      rarity: CARDS[i].rarity,
      finish: 'holo',
    });
    expect(HOLO_CARDS[i].element).toBe(CARDS[i].element);
  }
  const base = STARTER_DECK[0],
    holo = HOLO_CARDS.find((c) => c.baseCardId === base.id)!;
  expect(validateDeck([base, holo, ...STARTER_DECK.slice(1, 4)])).toContain(
    'A deck cannot contain duplicate card definitions.',
  );
  expect(validateDeck([holo, ...STARTER_DECK.slice(1)])).toEqual([]);
});
