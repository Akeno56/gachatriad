import {
  applyMove,
  createGame,
  STANDARD,
  type Card,
  type GameState,
  type Move,
  type Stats,
} from '@gacha-triad/engine';
export type ExampleRule = 'same' | 'plus' | 'combo';
function diagramCard(id: string, stats: Stats): Card {
  return {
    id,
    characterId: id,
    universeId: 'tutorial',
    name: id,
    rarity: 1,
    stats,
    set: 'Rulebook',
    enabled: true,
  };
}
/** Numeric teaching diagrams, resolved through the same engine as actual duels. */
export function ruleExample(rule: ExampleRule) {
  const same = rule === 'same',
    combo = rule === 'combo';
  const placed = diagramCard('Your card', same ? [4, 7, 1, 1] : [3, 5, 1, 1]);
  const north = diagramCard('North', [1, 1, same ? 4 : 6, 1]);
  const east = diagramCard('East', [1, 1, 8, same ? 7 : 4]);
  const corner = diagramCard('Corner', [2, 1, 1, 1]);
  const yours = [placed, ...[0, 1, 2, 3].map((i) => diagramCard(`Blue ${i}`, [1, 1, 1, 1]))];
  const theirs = [
    north,
    east,
    corner,
    diagramCard('Red 3', [1, 1, 1, 1]),
    diagramCard('Red 4', [1, 1, 1, 1]),
  ];
  const moves: Move[] = [
    { player: 0, cardId: yours[1].id, cell: 6 },
    { player: 1, cardId: north.id, cell: 1 },
    { player: 0, cardId: yours[2].id, cell: 7 },
    { player: 1, cardId: east.id, cell: 5 },
    ...(combo
      ? [
          { player: 0 as const, cardId: yours[3].id, cell: 0 },
          { player: 1 as const, cardId: corner.id, cell: 8 },
        ]
      : []),
  ];
  const before = moves.reduce<GameState>(
    applyMove,
    createGame([yours, theirs], { ...STANDARD, allOpen: true, same, plus: !same, combo }, () => 0),
  );
  const after = applyMove(before, { player: 0, cardId: placed.id, cell: 4 });
  return { before, after, placed, captures: after.history.at(-1)!.captures };
}
