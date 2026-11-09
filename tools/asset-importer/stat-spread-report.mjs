import { readFile, writeFile } from 'node:fs/promises';
import { CARDS, HOLO_VARIANTS } from '../../packages/shared/src/index.ts';
const original = JSON.parse(await readFile('data/cards/catalog.json', 'utf8'));
const priorReport = JSON.parse(await readFile('data/balance/stat-spread-alpha010.json', 'utf8'));
const prior = original.map((c) => ({
  ...c,
  stats: priorReport.changed.find((change) => change.id === c.id)?.after ?? c.stats,
}));
const changed = CARDS.flatMap((c) => {
  const old = prior.find((o) => o.id === c.id);
  return old.stats.join() === c.stats.join()
    ? []
    : [
        {
          id: c.id,
          name: c.name,
          rarity: c.rarity,
          total: c.stats.reduce((a, b) => a + b, 0),
          before: old.stats,
          after: c.stats,
        },
      ];
});
const distinct = (cards) => new Set(cards.map((c) => c.stats.join('/'))).size;
const summary = {
  release: '0.1.1 Alpha',
  cards: CARDS.length,
  changed: changed.length,
  oldDistinct: distinct(prior),
  newDistinct: distinct(CARDS),
  totalsPreserved: CARDS.every(
    (c) =>
      c.stats.reduce((a, b) => a + b, 0) ===
      prior.find((p) => p.id === c.id).stats.reduce((a, b) => a + b, 0),
  ),
  raritiesPreserved: CARDS.every((c) => c.rarity === prior.find((p) => p.id === c.id).rarity),
  sideCaps: { 1: 8, 2: 8, 3: 8, 4: 10, 5: 10 },
  rarityAudit: [1, 2, 3, 4, 5].map((rarity) => {
    const base = CARDS.filter((c) => c.rarity === rarity),
      holo = HOLO_VARIANTS.filter((c) => c.rarity === rarity),
      cap = rarity <= 3 ? 8 : 10;
    return {
      rarity,
      cards: base.length,
      cap,
      maxBaseSide: Math.max(...base.flatMap((c) => c.stats)),
      maxHoloSide: Math.max(...holo.flatMap((c) => c.stats)),
      invalid: [...base, ...holo].filter((c) => c.stats.some((n) => n < 1 || n > cap)).length,
    };
  }),
};
if (
  !summary.totalsPreserved ||
  !summary.raritiesPreserved ||
  summary.rarityAudit.some((row) => row.invalid)
)
  throw Error('Rarity side-cap audit failed.');
await writeFile(
  'data/balance/stat-spread-alpha011.json',
  JSON.stringify({ summary, changed }, null, 2) + '\n',
);
await writeFile(
  'docs/STAT_SPREADS_ALPHA_011.md',
  `# 0.1.1 Alpha stat spreads

${CARDS.length} cards; ${changed.length} spreads changed from 0.1.0. Distinct spreads: **${summary.oldDistinct} → ${summary.newDistinct}**.

Every base card keeps its total, rarity, element and ID. Aha stays A / 8 / A / 2. **1★–3★ printed and Holo values range from 1 to 8. 4★–5★ range from 1 to A.** Each total reserves distinct, cap-compliant source spreads first, then distributes duplicates across unused ordered legal spreads. Equal digits in different positions count separately: 4 / 4 / 5 / 4 and 4 / 5 / 4 / 4 can coexist. There is no preference against repeated digit combinations. If a total exhausts its legal possibilities, the least-used ordered spreads are filled first. Selection is deterministic and does not change on restart.

| Rarity | Base cards | Side cap | Highest base side | Highest Holo side | Invalid cards |
|---|---:|---:|---:|---:|---:|
${summary.rarityAudit.map((row) => `| ${row.rarity}★ | ${row.cards} | ${row.cap} | ${row.maxBaseSide} | ${row.maxHoloSide} | ${row.invalid} |`).join('\n')}

The shared catalogue applies this versioned rule to both browser and server. Startup updates card definitions, so owned cards, decks and trade offers pick up their current definition. Active games keep their starting snapshot until finished. No inventory is removed.

Existing Holo IDs remain valid. If their former +1 direction reaches the rarity's cap, the bonus moves to the next eligible direction; every Holo retains exactly +1 total and no side exceeds its rarity's cap. New drops choose equally between eligible sides. Elemental cell modifiers continue to apply during matches.

The authored Combo puzzle uses fixed teaching values so its demonstration remains reproducible. Its UI identifies those values as training values.

Full before/after data: [stat-spread-alpha011.json](../data/balance/stat-spread-alpha011.json). Regenerate with:

    node --import ./apps/server/node_modules/tsx/dist/loader.mjs tools/asset-importer/stat-spread-report.mjs
`,
);
console.log(JSON.stringify(summary));
