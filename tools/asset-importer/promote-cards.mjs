import { readFile, writeFile } from 'node:fs/promises';
const proposals = JSON.parse(await readFile('data/balance/proposals.json', 'utf8'));
const characters = JSON.parse(await readFile('data/characters/catalog.json', 'utf8'));
const config = JSON.parse(await readFile('data/balance/config.json', 'utf8'));
const overrides = JSON.parse(await readFile('data/balance/overrides.json', 'utf8'));
const previous = JSON.parse(await readFile('data/cards/release.json', 'utf8'));
const version = config.version.replace('draft-', 'approved-');
const cards = proposals
  .filter((p) => p.stats && p.triadRarity)
  .map((p) => {
    const c = characters.find((c) => c.id === p.id);
    if (
      p.stats.length !== 4 ||
      p.stats.some((n) => !Number.isInteger(n) || n < 1 || n > 10) ||
      p.stats.reduce((a, b) => a + b, 0) !== p.statBudget
    )
      throw Error(`Invalid card: ${p.id}`);
    return {
      id: p.id,
      characterId: c.characterId,
      universeId: p.universeId,
      name: p.name,
      rarity: p.triadRarity,
      stats: p.stats,
      ...(p.element ? { element: p.element } : {}),
      set: ['epic-seven', 'star-savior', 'nte', 'endfield'].includes(p.universeId)
        ? 'gacha-universe-ii'
        : 'first-contact',
      enabled: true,
      artworkId: `${p.universeId}:${c.characterId}`,
      balanceVersion: version,
    };
  });
await writeFile('data/cards/catalog.json', JSON.stringify(cards, null, 2) + '\n');
await writeFile(
  'data/cards/release.json',
  JSON.stringify(
    {
      ...previous,
      version,
      approvedOn: new Date().toISOString().slice(0, 10),
      sourceModel: config.version,
      cards: cards.length,
      excluded: proposals.filter((p) => !p.stats).map((p) => p.id),
      approval: previous.approval,
      ahaOverride: overrides['star-rail:aha'],
      sourceSnapshot: proposals[0].sourceSnapshot,
      modelDigest: proposals[0].modelDigest,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Promoted ${cards.length} cards. ${proposals.length - cards.length} incomplete records remain artwork-only.`,
);
