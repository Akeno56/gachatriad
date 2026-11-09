import type { BotMix } from '@gacha-triad/shared/platform';
import { GameError } from './errors';
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export function validateMix(input: unknown): BotMix {
  const mix = input as BotMix | null;
  if (
    !mix ||
    DIFFICULTIES.some((d) => !Number.isInteger(mix[d]) || mix[d] < 0 || mix[d] > 100) ||
    DIFFICULTIES.reduce((sum, d) => sum + mix[d], 0) !== 100
  )
    throw new GameError('Bot difficulty percentages must be whole numbers totaling 100%.');
  return { easy: mix.easy, medium: mix.medium, hard: mix.hard };
}
/** Largest remainders preserve all bots when percentages cannot divide 30 exactly. */
export function distributeBots(mix: BotMix, total = 30) {
  const counts = DIFFICULTIES.map((d) => Math.floor((total * mix[d]) / 100));
  const order = DIFFICULTIES.map((d, i) => ({
    i,
    remainder: (total * mix[d]) / 100 - counts[i],
  })).sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (let n = 0, spare = total - counts.reduce((a, b) => a + b, 0); n < spare; n++)
    counts[order[n].i]++;
  return DIFFICULTIES.flatMap((d, i) => Array.from({ length: counts[i] }, () => d));
}
