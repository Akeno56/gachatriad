import type { Card, Stats } from '@gacha-triad/engine';
const hash = (id: string) =>
  [...id].reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const key = (stats: readonly number[]) => stats.join('/');
const shape = (stats: readonly number[]) => key([...stats].sort((a, b) => a - b));
export const cardSideCap = (card: Pick<Card, 'rarity'>) => (card.rarity <= 3 ? 8 : 10);
/** Versioned deterministic redistribution: fixed total, unique spreads before repetition. */
export function diversifySpreads<T extends Card>(cards: readonly T[]): T[] {
  const result = new Map<string, T>(),
    groups = new Map<number, T[]>();
  for (const card of cards) {
    const total = card.stats.reduce((n, v) => n + v, 0);
    groups.set(total, [...(groups.get(total) || []), card]);
  }
  for (const [total, group] of groups) {
    const candidates: Stats[] = [];
    for (let a = 1; a <= 10; a++)
      for (let b = 1; b <= 10; b++)
        for (let c = 1; c <= 10; c++) {
          const d = total - a - b - c;
          if (d >= 1 && d <= 10) candidates.push([a, b, c, d]);
        }
    const counts = new Map<string, number>(),
      shapes = new Map<string, number>(),
      duplicate: T[] = [];
    const remember = (stats: Stats) => {
      counts.set(key(stats), (counts.get(key(stats)) || 0) + 1);
      shapes.set(shape(stats), (shapes.get(shape(stats)) || 0) + 1);
    };
    for (const card of [...group].sort(
      (a, b) =>
        Number(b.id === 'star-rail:aha') - Number(a.id === 'star-rail:aha') ||
        a.id.localeCompare(b.id),
    )) {
      if (
        card.stats.every((value) => value >= 1 && value <= cardSideCap(card)) &&
        !counts.has(key(card.stats))
      ) {
        result.set(card.id, card);
        remember(card.stats);
      } else duplicate.push(card);
    }
    for (const card of duplicate.sort(
      (a, b) => cardSideCap(a) - cardSideCap(b) || a.id.localeCompare(b.id),
    )) {
      const eligible = candidates.filter((stats) =>
        stats.every((value) => value <= cardSideCap(card)),
      );
      if (!eligible.length)
        throw Error(`Card ${card.id} cannot keep total ${total} within its rarity cap.`);
      const least = Math.min(...eligible.map((s) => counts.get(key(s)) || 0));
      const available = eligible.filter((s) => (counts.get(key(s)) || 0) === least);
      const leastShape = Math.min(...available.map((s) => shapes.get(shape(s)) || 0));
      const varied = available.filter((s) => (shapes.get(shape(s)) || 0) === leastShape);
      const stats = varied[hash(card.id) % varied.length];
      result.set(card.id, {
        ...card,
        stats,
        balanceVersion: `${card.balanceVersion}+spread-alpha010`,
      });
      remember(stats);
    }
  }
  return cards.map((c) => result.get(c.id)!);
}
