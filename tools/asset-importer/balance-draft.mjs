import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { proposeBalance } from '../../packages/balance/src/index.ts';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const characters = JSON.parse(
  await readFile(resolve(root, 'data/characters/catalog.json'), 'utf8'),
);
const sourceSnapshot = createHash('sha256')
  .update(
    JSON.stringify(
      characters.map(({ id, sourceRarity, sourceElement, tierPlacements }) => ({
        id,
        sourceRarity,
        sourceElement,
        tierPlacements,
      })),
    ),
  )
  .digest('hex');
const modelDigest = createHash('sha256')
  .update(
    JSON.stringify(JSON.parse(await readFile(resolve(root, 'data/balance/config.json'), 'utf8'))),
  )
  .digest('hex');
let overrides = {};
try {
  overrides = JSON.parse(await readFile(resolve(root, 'data/balance/overrides.json'), 'utf8'));
} catch {}
const proposals = process.argv.includes('--report-only')
  ? JSON.parse(await readFile(resolve(root, 'data/balance/proposals.json'), 'utf8'))
  : characters.map((c) => ({
      ...proposeBalance(c),
      ...(overrides[c.id]
        ? {
            triadRarity: overrides[c.id].rarity,
            stats: overrides[c.id].stats,
            statBudget: overrides[c.id].statBudget,
            powerIndex: 100,
            status: 'approved-override',
            notes: [overrides[c.id].reason],
          }
        : {}),
      sourceRarity: c.sourceRarity,
      sourceElement: c.sourceElement,
      tierPlacements: c.tierPlacements,
      sourcePage: c.sourcePage,
      sourceSnapshot,
      modelDigest,
    }));
await mkdir(resolve(root, 'data/balance'), { recursive: true });
if (!process.argv.includes('--report-only'))
  await writeFile(
    resolve(root, 'data/balance/proposals.json'),
    JSON.stringify(proposals, null, 2) + '\n',
  );
const columns = [
  'id',
  'name',
  'universeId',
  'sourceRarity',
  'sourceElement',
  'tiers',
  'powerIndex',
  'triadRarity',
  'statBudget',
  'top',
  'right',
  'bottom',
  'left',
  'element',
  'archetype',
  'status',
  'notes',
  'sourcePage',
  'modelVersion',
  'sourceSnapshot',
  'modelDigest',
];
const cell = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
const rows = proposals.map((p) => [
  p.id,
  p.name,
  p.universeId,
  p.sourceRarity,
  p.sourceElement,
  p.tierPlacements
    .map(
      (t) =>
        `${t.tier} (${t.role}; ${t.assumptions || 'unspecified copies'}; ${t.conditions || ''})`,
    )
    .join(' / '),
  p.powerIndex,
  p.triadRarity,
  p.statBudget,
  ...(p.stats ?? [null, null, null, null]),
  p.element,
  p.archetype,
  p.status,
  p.notes.join(' | '),
  p.sourcePage,
  p.modelVersion,
  p.sourceSnapshot,
  p.modelDigest,
]);
await writeFile(
  resolve(root, 'data/balance/proposals.csv'),
  '\ufeff' + [columns, ...rows].map((row) => row.map(cell).join(',')).join('\r\n'),
);
console.log(
  JSON.stringify(
    {
      characters: proposals.length,
      byStatus: Object.fromEntries(
        [...new Set(proposals.map((p) => p.status))].map((s) => [
          s,
          proposals.filter((p) => p.status === s).length,
        ]),
      ),
      rarityDistribution: Object.fromEntries(
        [1, 2, 3, 4, 5].map((r) => [r, proposals.filter((p) => p.triadRarity === r).length]),
      ),
      missingElements: [
        ...new Set(
          proposals
            .filter((p) => p.notes.some((n) => n.startsWith('Element mapping required')))
            .map((p) => p.sourceElement),
        ),
      ],
      examples: proposals
        .filter((p) => ['Sampo', 'Vodyanitsa', 'Lacrimosa', 'Orphie & Magus'].includes(p.name))
        .map(({ tierPlacements, notes, ...p }) => p),
    },
    null,
    2,
  ),
);
