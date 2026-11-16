import { applyMove, createGame, STANDARD, type GameState, type Move } from '@gacha-triad/engine';
import { CARDS } from './index';
export type ExampleRule = 'same' | 'plus' | 'combo';
const card = (id: string) => {
  const found = CARDS.find((item) => item.id === id);
  if (!found) throw new Error(`Missing rulebook card: ${id}`);
  return found;
};
/** Authored real-card examples, resolved through the same engine as actual duels. */
export function ruleExample(rule: ExampleRule) {
  const same = rule === 'same',
    combo = rule === 'combo';
  const placed = card(same ? 'epic-seven:alencia' : 'star-rail:asta');
  const north = card(same ? 'genshin:clorinde' : 'genshin:chongyun');
  const east = card(same ? 'genshin:traveler-electro' : 'genshin:xiao');
  const corner = card('genshin:dori');
  const yours = [
    placed,
    ...[
      'genshin:amber',
      'star-rail:march-7th',
      'zenless:billy-kid',
      'wuthering-waves:yangyang',
    ].map(card),
  ];
  const theirs = [north, east, corner, card('genshin:lisa'), card('genshin:kirara')];
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
