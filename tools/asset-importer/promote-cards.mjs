import { readFile, writeFile } from 'node:fs/promises';
const proposals = JSON.parse(await readFile('data/balance/proposals.json', 'utf8'));
const characters = JSON.parse(await readFile('data/characters/catalog.json', 'utf8'));
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
      set: 'first-contact',
      enabled: true,
      artworkId: `${p.universeId}:${c.characterId}`,
      balanceVersion: 'approved-v1',
    };
  });
await writeFile('data/cards/catalog.json', JSON.stringify(cards, null, 2) + '\n');
await writeFile(
  'data/cards/release.json',
  JSON.stringify(
    {
      version: 'approved-v1',
      approvedOn: '2026-11-07',
      sourceModel: 'draft-v1',
      cards: cards.length,
      excluded: proposals.filter((p) => !p.stats).map((p) => p.id),
      approval: 'User approved replacing the earlier test cards with these generated drafts.',
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
