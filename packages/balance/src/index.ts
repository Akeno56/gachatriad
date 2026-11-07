import defaults from '../../../data/balance/config.json' with { type: 'json' };
export interface Band {
  rarity: number;
  minimumScore: number;
  minimumBudget: number;
  maximumBudget: number;
  sideCap: number;
}
export interface Config {
  version: string;
  rarityWeight: number;
  tierWeight: number;
  worstTierAnchor: number;
  sourceRarities: Record<string, Record<string, number>>;
  bands: Band[];
  archetypes: Record<string, number[]>;
  elements: Record<string, { element: string | null; review: boolean; note?: string }>;
}
export interface TierPlacement {
  tier: string;
  role?: string;
  context?: string;
  assumptions?: string;
  conditions?: string;
  sourcePage?: string;
}
export interface SourceCharacter {
  id: string;
  name: string;
  universeId: string;
  sourceRarity: string | null;
  sourceElement: string | null;
  tierPlacements: TierPlacement[];
}
export const DEFAULT_CONFIG: Config = defaults;
export function normalizeTier(tier: string, worst = 5): number | null {
  const match = tier
    .trim()
    .toUpperCase()
    .match(/^T(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const number = Number(match[1]);
  return number >= 0 && number <= worst ? 1 - number / worst : null;
}
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
}
function hashId(id: string) {
  let h = 2166136261;
  for (const char of id) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function distributeStats(
  budget: number,
  cap: number,
  weights: readonly number[],
  rotation = 0,
): readonly number[] {
  if (
    !Number.isInteger(budget) ||
    budget < 4 ||
    budget > cap * 4 ||
    cap > 10 ||
    cap < 1 ||
    weights.length !== 4 ||
    weights.some((w) => !Number.isFinite(w) || w <= 0)
  )
    throw new Error('Invalid playable budget or profile.');
  const stats = [1, 1, 1, 1];
  for (let points = 4; points < budget; points++) {
    let target = -1,
      best = Infinity;
    for (let i = 0; i < 4; i++) {
      if (stats[i] >= cap) continue;
      const ratio = (stats[i] - 1 + 0.5) / weights[i];
      if (ratio < best) {
        best = ratio;
        target = i;
      }
    }
    if (target < 0) throw new Error('Budget exceeds the profile capacity.');
    stats[target]++;
  }
  const result = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) result[(i + rotation) % 4] = stats[i];
  return result;
}
/** A reviewable proposal, never a mutation of a live card definition. */
export function proposeBalance(source: SourceCharacter, config: Config = DEFAULT_CONFIG) {
  if (
    Math.abs(config.rarityWeight + config.tierWeight - 1) > 0.00001 ||
    config.rarityWeight < 0 ||
    config.tierWeight < 0
  )
    throw new Error('Scoring weights must sum to one.');
  const notes: string[] = [];
  const rarity =
    source.sourceRarity === null
      ? undefined
      : config.sourceRarities[source.universeId]?.[String(source.sourceRarity).toUpperCase()];
  const placements = [
    ...new Map(
      source.tierPlacements.map((p) => [
        `${p.context}|${p.role}|${p.assumptions}|${p.conditions}|${p.tier}`,
        p,
      ]),
    ).values(),
  ];
  const tierValues = placements.map((p) => normalizeTier(p.tier, config.worstTierAnchor));
  if (rarity === undefined) notes.push('Missing or unsupported original rarity.');
  if (!tierValues.length) notes.push('No tier placement in the supplied snapshot.');
  if (tierValues.some((t) => t === null)) notes.push('Unsupported tier label requires review.');
  const elementMapping = source.sourceElement
    ? config.elements[source.sourceElement.toLowerCase()]
    : undefined;
  if (!elementMapping)
    notes.push(`Element mapping required: ${source.sourceElement ?? 'missing'}.`);
  else if (elementMapping.review)
    notes.push(elementMapping.note ?? 'Thematic element mapping needs review.');
  if (
    placements.some((p) =>
      /(?:E|M|C|S|A)[1-9]/i.test(`${p.assumptions ?? ''} ${p.conditions ?? ''}`),
    )
  )
    notes.push('Tier uses upgraded-copy assumptions; review in context.');
  if (placements.some((p) => /expert|signature/i.test(p.conditions ?? '')))
    notes.push('Tier includes an expert/signature condition; review in context.');
  const incomplete =
    rarity === undefined || !tierValues.length || tierValues.some((t) => t === null);
  if (incomplete)
    return {
      id: source.id,
      name: source.name,
      universeId: source.universeId,
      modelVersion: config.version,
      powerIndex: null,
      triadRarity: null,
      statBudget: null,
      stats: null,
      archetype: null,
      element: elementMapping?.element ?? null,
      status: 'insufficient-data' as const,
      notes,
    };
  const tier = median(tierValues as number[]);
  // Keep full precision for band selection. Display rounding must not promote to a higher band.
  const exactIndex = 100 * (config.rarityWeight * rarity! + config.tierWeight * tier);
  const powerIndex = Math.round(exactIndex * 100) / 100;
  const band = [...config.bands]
    .sort((a, b) => b.minimumScore - a.minimumScore)
    .find((b) => exactIndex + 1e-9 >= b.minimumScore);
  if (!band) throw new Error('No rarity band matches the model score.');
  const nextBand = [...config.bands]
    .sort((a, b) => a.minimumScore - b.minimumScore)
    .find((b) => b.minimumScore > band.minimumScore);
  const upperScore = nextBand?.minimumScore ?? 100;
  const fraction = Math.max(
    0,
    Math.min(1, (exactIndex - band.minimumScore) / (upperScore - band.minimumScore || 1)),
  );
  const budget = Math.max(
    band.minimumBudget,
    Math.min(
      band.maximumBudget,
      Math.round(band.minimumBudget + fraction * (band.maximumBudget - band.minimumBudget)),
    ),
  );
  const names = Object.keys(config.archetypes);
  const hash = hashId(source.id);
  const archetype = names[hash % names.length];
  const stats = distributeStats(
    budget,
    band.sideCap,
    config.archetypes[archetype],
    Math.floor(hash / names.length) % 4,
  );
  return {
    id: source.id,
    name: source.name,
    universeId: source.universeId,
    modelVersion: config.version,
    powerIndex,
    triadRarity: band.rarity,
    statBudget: budget,
    stats,
    archetype,
    element: elementMapping?.element ?? null,
    status: notes.length ? ('needs-review' as const) : ('draft-ready' as const),
    notes,
  };
}
