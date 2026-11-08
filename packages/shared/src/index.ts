import type { Card, Stats } from '@gacha-triad/engine';
import catalog from '../../../data/cards/catalog.json' with { type: 'json' };
import universes from '../../../data/universes/index.json' with { type: 'json' };
export const CARDS: readonly Card[] = catalog.map((c) => ({
  ...c,
  stats: c.stats as unknown as Card['stats'],
}));
export const UNIVERSES = universes;
export const SIDE_NAMES = ['Top', 'Right', 'Bottom', 'Left'] as const;
const legacySide = (card: Card) => {
  const eligible = card.stats.flatMap((value, side) => (value < 10 ? [side] : []));
  const hash = [...card.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return eligible[hash % eligible.length];
};
/** Stable variant IDs preserve the acquired +1 direction through decks, trades and receipts. */
export const HOLO_VARIANTS: readonly Card[] = CARDS.flatMap((card) =>
  card.stats.flatMap((value, side) =>
    value >= 10
      ? []
      : [
          {
            ...card,
            id: side === legacySide(card) ? `${card.id}::holo` : `${card.id}::holo:${side}`,
            baseCardId: card.id,
            finish: 'holo' as const,
            holoBonusSide: side as 0 | 1 | 2 | 3,
            stats: card.stats.map((n, i) => n + Number(i === side)) as unknown as Stats,
          },
        ],
  ),
);
export const HOLO_CARDS = HOLO_VARIANTS.filter((card) => card.id.endsWith('::holo'));
export const ALL_CARDS: readonly Card[] = [...CARDS, ...HOLO_VARIANTS];
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
