import { applyMove, createGame, PRESETS, type GameState, type Move } from '@gacha-triad/engine';
import { STARTER_DECK, CPU_DECK } from './index';
import originalCatalog from '../../../data/cards/catalog.json' with { type: 'json' };
/** Fixed teaching values keep this authored puzzle valid across balance updates. */
const training = (deck: typeof STARTER_DECK) =>
  deck.map((c) => ({
    ...c,
    stats: originalCatalog
      .find((old) => old.id === c.id)!
      .stats.map((value) => Math.min(value, c.rarity <= 3 ? 8 : 10)) as unknown as typeof c.stats,
  }));
const SETUP: readonly Move[] = [
  { player: 0, cardId: 'star-rail:march-7th', cell: 6 },
  { player: 1, cardId: 'wuthering-waves:chixia', cell: 5 },
  { player: 0, cardId: 'wuthering-waves:yangyang', cell: 3 },
  { player: 1, cardId: 'endfield:endministrator', cell: 0 },
  { player: 0, cardId: 'genshin:amber', cell: 2 },
  { player: 1, cardId: 'zenless:anby-demara', cell: 4 },
];
export const COMBO_SOLUTION: Move = { player: 0, cardId: 'zenless:billy-kid', cell: 1 };
export function createComboLesson(): GameState {
  return SETUP.reduce(
    applyMove,
    createGame([training(STARTER_DECK), training(CPU_DECK)], PRESETS[4].rules, () => 0),
  );
}
