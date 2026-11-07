import { expect, it } from 'vitest';
import {
  applyMove,
  createGame,
  cpuView,
  isRevealed,
  randomDeck,
  seededRandom,
  STANDARD,
  validateDeck,
  type Card,
} from './index';
const card = (i: number, rarity = 1): Card => ({
  id: String(i),
  characterId: String(i),
  universeId: 'test',
  name: String(i),
  stats: [4, 4, 4, 4],
  rarity,
  set: 'test',
  enabled: true,
});
it('selects exactly three stable revealed cards per hand without exposing hidden identities to CPU', () => {
  const decks = [
    Array.from({ length: 5 }, (_, i) => card(i)),
    Array.from({ length: 5 }, (_, i) => card(i + 5)),
  ] as [Card[], Card[]];
  const state = createGame(decks, { ...STANDARD, threeOpen: true }, seededRandom(42));
  expect(state.revealed.map((r) => r.length)).toEqual([3, 3]);
  expect(state.hands[1].filter((c) => isRevealed(state, 1, c.id))).toHaveLength(3);
  expect(cpuView(state)).not.toHaveProperty('revealed');
  const next = applyMove(state, {
    player: state.turn,
    cardId: state.hands[state.turn][0].id,
    cell: 0,
  });
  expect(next.revealed).toEqual(state.revealed);
  expect(() => createGame(decks, { ...STANDARD, allOpen: true, threeOpen: true })).toThrow();
});
it('enforces rarity caps and generates legal random hands across many seeds', () => {
  const pool = Array.from({ length: 40 }, (_, i) => card(i, (i % 5) + 1));
  expect(validateDeck([card(1, 5), card(2, 5), card(3), card(4), card(5)])).not.toHaveLength(0);
  expect(validateDeck([card(1, 5), card(2, 4), card(3, 4), card(4), card(5)])).not.toHaveLength(0);
  expect(validateDeck([card(1, 4), card(2, 4), card(3), card(4), card(5)])).toEqual([]);
  for (let i = 0; i < 100; i++) expect(validateDeck(randomDeck(pool, seededRandom(i)))).toEqual([]);
});
