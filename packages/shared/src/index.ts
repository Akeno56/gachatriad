import type { Card } from '@gacha-triad/engine';
import catalog from '../../../data/cards/catalog.json';
import universes from '../../../data/universes/index.json';
export const CARDS: readonly Card[] = catalog.map((c) => ({
  ...c,
  stats: c.stats as unknown as Card['stats'],
}));
export const UNIVERSES = universes;
/** A finish changes ownership/trading identity, never rarity, element or values. Booster acquisition follows. */
export const HOLO_CARDS: readonly Card[] = CARDS.map((card) => ({
  ...card,
  id: `${card.id}::holo`,
  baseCardId: card.id,
  finish: 'holo',
}));
export const ALL_CARDS: readonly Card[] = [...CARDS, ...HOLO_CARDS];
export const STARTER_DECK = CARDS.filter((c) =>
  [
    'star-rail:march-7th',
    'genshin:amber',
    'zenless:billy-kid',
    'wuthering-waves:yangyang',
    'endfield:perlica',
  ].includes(c.id),
);
export const CPU_DECK = CARDS.filter((c) =>
  [
    'star-rail:dan-heng',
    'genshin:kaeya',
    'zenless:anby-demara',
    'wuthering-waves:chixia',
    'endfield:endministrator',
  ].includes(c.id),
);
export function universeName(id: string): string {
  return UNIVERSES.find((u) => u.id === id)?.name ?? id;
}
