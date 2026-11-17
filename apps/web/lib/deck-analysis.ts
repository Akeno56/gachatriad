import type { Card } from '@gacha-triad/engine';

export const SIDE_NAMES = ['Top', 'Right', 'Bottom', 'Left'] as const;
export const CORNER_NAMES = ['Top left', 'Top right', 'Bottom right', 'Bottom left'] as const;
const exposed = [
  [1, 2],
  [2, 3],
  [0, 3],
  [0, 1],
] as const;
/** Descriptive printed-value coverage; this never estimates a win rate. */
export function analyseDeck(cards: readonly Card[]) {
  const sides = SIDE_NAMES.map((name, side) => {
    const values = cards.map((card) => card.stats[side]);
    return {
      name,
      side,
      average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
      low: values.filter((value) => value <= 3).length,
      high: values.filter((value) => value >= 7).length,
    };
  });
  const corners = cards.map((card) => {
    const choices = exposed.map((edges, index) => ({
      index,
      floor: Math.min(...edges.map((edge) => card.stats[edge])),
      total: edges.reduce<number>((sum, edge) => sum + card.stats[edge], 0),
    }));
    choices.sort((a, b) => b.floor - a.floor || b.total - a.total || a.index - b.index);
    return { cardId: card.id, corner: choices[0].index, exposed: exposed[choices[0].index] };
  });
  const ordered = [...sides].sort((a, b) => b.average - a.average || a.side - b.side);
  return {
    sides,
    corners,
    strongest: ordered[0],
    weakest: ordered.at(-1)!,
    total: cards.reduce((sum, card) => sum + card.stats.reduce((a, b) => a + b, 0), 0),
    low: sides.reduce((sum, side) => sum + side.low, 0),
    high: sides.reduce((sum, side) => sum + side.high, 0),
    balanced: sides.every((side) => side.average === sides[0].average),
  };
}
