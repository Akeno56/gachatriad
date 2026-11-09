import { randomInt } from 'node:crypto';
import { CARDS, ALL_CARDS, HOLO_VARIANTS } from '@gacha-triad/shared';
import { ECONOMY } from '@gacha-triad/shared/platform';
import { buildBestDeck, type Card } from '@gacha-triad/engine';
export function rollRarity(weights: readonly number[], draw = randomInt): number {
  let roll = draw(weights.reduce((a, b) => a + b, 0));
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i + 1;
  }
  throw Error('Invalid rarity weights.');
}
const definitions = new Map(ALL_CARDS.map((card) => [card.id, card]));
export function rollFinish(baseId: string, per10000: number, draw = randomInt) {
  if (draw(10000) >= per10000) return baseId;
  const directions = new Set<number>();
  const variants = HOLO_VARIANTS.filter((card) => {
    if (card.baseCardId !== baseId || directions.has(card.holoBonusSide!)) return false;
    directions.add(card.holoBonusSide!);
    return true;
  });
  return variants.length ? variants[draw(variants.length)].id : baseId;
}
export function draftPool(): Card[] {
  // Three packs, five slots each; keep characters distinct so every offer can be selected.
  for (let attempt = 0; attempt < 100; attempt++) {
    const selected: Card[] = [],
      used = new Set<string>();
    for (let slot = 0; slot < 15; slot++) {
      const weights =
        slot % 5 === 4
          ? ECONOMY.draftGuaranteedWeights
          : slot % 5 === 3
            ? ECONOMY.guaranteedWeights
            : ECONOMY.standardWeights;
      const rank = rollRarity(weights);
      const pool = CARDS.filter(
        (card) => card.enabled && card.rarity === rank && !used.has(card.id),
      );
      if (!pool.length) break;
      const base = pool[randomInt(pool.length)];
      used.add(base.id);
      const id = rollFinish(base.id, ECONOMY.draftHoloPer10000);
      selected.push(definitions.get(id)!);
    }
    if (selected.length !== 15) continue;
    try {
      buildBestDeck(selected);
      return selected;
    } catch {
      /* Resample the exceptional pool that cannot make a legal deck. */
    }
  }
  throw Error('Unable to create a playable Draft pool.');
}
