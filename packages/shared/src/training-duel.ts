import {
  applyMove,
  createGame,
  STANDARD,
  type Card,
  type GameState,
  type Move,
  type Stats,
} from '@gacha-triad/engine';
import { STARTER_DECK, CPU_DECK } from './index';
import { ECONOMY } from './platform';
const blueStats: Stats[] = [
  [2, 2, 2, 2],
  [2, 2, 2, 6],
  [1, 1, 1, 1],
  [4, 5, 1, 6],
  [2, 3, 1, 2],
];
const redStats: Stats[] = [
  [1, 3, 4, 1],
  [5, 6, 3, 1],
  [7, 1, 7, 7],
  [1, 1, 1, 2],
  [1, 1, 1, 1],
];
const teach = (card: Card, stats: Stats, seat: number, index: number): Card => ({
  ...card,
  id: `training:${seat}:${index}`,
  baseCardId: `training:${seat}:${index}`,
  rarity: 1,
  stats,
  element: seat === 0 && index === 4 ? 'fire' : seat === 1 && index === 3 ? 'ice' : card.element,
  set: 'Training values',
});
export const TRAINING_HANDS: [Card[], Card[]] = [
  STARTER_DECK.map((c, i) => teach(c, blueStats[i], 0, i)),
  CPU_DECK.map((c, i) => teach(c, redStats[i], 1, i)),
];
export const TRAINING_MOVES: Move[] = [
  { player: 0, cardId: TRAINING_HANDS[0][0].id, cell: 0 },
  { player: 1, cardId: TRAINING_HANDS[1][0].id, cell: 1 },
  { player: 0, cardId: TRAINING_HANDS[0][1].id, cell: 2 },
  { player: 1, cardId: TRAINING_HANDS[1][1].id, cell: 3 },
  { player: 0, cardId: TRAINING_HANDS[0][2].id, cell: 6 },
  { player: 1, cardId: TRAINING_HANDS[1][2].id, cell: 5 },
  { player: 0, cardId: TRAINING_HANDS[0][3].id, cell: 4 },
  { player: 1, cardId: TRAINING_HANDS[1][3].id, cell: 8 },
  { player: 0, cardId: TRAINING_HANDS[0][4].id, cell: 7 },
];
export function trainingStart(): GameState {
  return {
    ...createGame(
      TRAINING_HANDS,
      { ...STANDARD, allOpen: true, same: true, plus: true, combo: true, elemental: true },
      () => 0,
    ),
    cellElements: [null, null, null, null, null, null, null, 'fire', 'ice'],
  };
}
const states = [trainingStart()];
for (const move of TRAINING_MOVES) states.push(applyMove(states.at(-1)!, move));
export type TrainingStep = {
  title: string;
  text: string;
  kind: 'info' | 'visibility' | 'play' | 'rival' | 'trade' | 'random';
  before: GameState;
  after?: GameState;
  move?: Move;
};
function turn(index: number, title: string, text: string): TrainingStep {
  return {
    title,
    text,
    kind: TRAINING_MOVES[index].player === 0 ? 'play' : 'rival',
    before: states[index],
    after: states[index + 1],
    move: TRAINING_MOVES[index],
  };
}
const beforeSpecial = (same: boolean, plus: boolean, combo: boolean): GameState => ({
  ...states[6],
  rules: { ...states[6].rules, same, plus, combo },
});
const same = beforeSpecial(true, false, false),
  plus = beforeSpecial(false, true, false);
export const TRAINING_STEPS: TrainingStep[] = [
  {
    title: 'Five cards. Nine spaces.',
    kind: 'info',
    before: states[0],
    text: 'This is a made-up training duel. The cards use teaching values, not their collection values. Each side brings five different cards. Numbers face up, right, down and left; A means 10. Real decks allow one 5★ plus one 4★, or two 4★ without a 5★. Nothing here changes your cards, currency or rating.',
  },
  {
    title: 'All Open, Three Open, Closed',
    kind: 'visibility',
    before: states[0],
    text: 'Try the three hand views. All Open reveals every card. Three Open reveals three randomly chosen cards from each starting hand; those identities stay fixed. Closed hides unplayed cards. You always see your own hand. We use All Open in this lesson so you can follow every move.',
  },
  turn(
    0,
    'Place your first card',
    'Select the highlighted card from your hand, then place it in the highlighted top-left cell. A placed card stays in that cell; only its owner can change.',
  ),
  turn(
    1,
    'Your rival takes a turn',
    'Players alternate placing one card. Only touching sides compare; diagonals do not count. Watch the rival place a card beside yours.',
  ),
  turn(
    2,
    'Capture with a higher number',
    'Select the highlighted card and place it at the top right. Its left 6 beats the rival’s right 3, so the touching rival card turns blue. An equal number does not capture by itself.',
  ),
  turn(
    3,
    'Cards can be taken back',
    'Now the rival’s top 5 beats your card’s bottom 2. Your earlier card turns red. Capture changes ownership, not a card’s printed values.',
  ),
  turn(
    4,
    'Prepare the center',
    'Place the highlighted card in the lower-left cell. Good positioning leaves opportunities for later turns. Blue and red borders tell you who currently owns each card.',
  ),
  turn(
    5,
    'Watch the next reply',
    'The rival plays on the right and captures your top-right card. We will replay the upcoming center move three times to learn Same, Plus, then Combo.',
  ),
  {
    title: 'Same: two matching pairs',
    kind: 'play',
    before: same,
    after: applyMove(same, TRAINING_MOVES[6]),
    move: TRAINING_MOVES[6],
    text: 'Place the highlighted card in the center. Top 4 matches bottom 4, and left 6 matches right 6. Two touching equal pairs activate Same. A friendly neighbor counts toward the pair; the matching enemy turns blue.',
  },
  {
    title: 'Plus: two equal sums',
    kind: 'play',
    before: plus,
    after: applyMove(plus, TRAINING_MOVES[6]),
    move: TRAINING_MOVES[6],
    text: 'Replay that turn with Plus. On the left, 6 + 6 = 12. On the right, 5 + 7 = 12. Equal sums on at least two touching sides activate Plus and capture the matching enemy cards. Same and Plus can be enabled together.',
  },
  turn(
    6,
    'Combo: captures spread',
    'Replay the center move with Same, Plus and Combo enabled. Newly captured cards attack adjacent enemies using ordinary higher-number comparisons: 5 beats 2 on the left, and 7 beats 2 on the right. The chain continues while it finds captures. An ordinary capture alone never starts Combo.',
  ),
  {
    title: 'Elemental: +1 or −1',
    kind: 'play',
    before: states[8],
    after: states[9],
    move: TRAINING_MOVES[8],
    text: 'The rival’s Ice card has left 2 + 1 = 3. Your Fire card’s printed right 3 would only tie on a neutral cell. Place it on the Fire cell: right 3 + 1 = 4 now beats 3 and captures the rival. All four values gain +1 on a matching cell; a different affinity, or no affinity, loses 1. Same, Plus, ordinary and Combo captures all use the adjusted values displayed on the cards.',
  },
  {
    title: 'Count the result',
    kind: 'info',
    before: states[9],
    text: 'The board is full. Count cards you control plus the card left in your hand, if any. The total is always ten: more than five wins, 5–5 draws. Blue wins this lesson 9–1. Unranked uses Three Open, Same, Plus and Combo, with no card trade.',
  },
  {
    title: 'Optional custom rule: Trade One',
    kind: 'trade',
    before: states[9],
    text: 'Ranked, Draft and Shared Draft never take cards from your collection. Trade One applies only when you choose it in a custom game: the winner takes one card from the loser’s original deck, even after a forfeit. Draws trade nothing. This optional practice shows that custom rule; you can continue without choosing a card. A real Trade One match must settle the transfer before another game.',
  },
  {
    title: 'Random, Draft and your next duel',
    kind: 'random',
    before: states[9],
    text: `Random draws a legal hand from your collection. Draft uses private boosters. Shared Draft uses a shared pool. Roulette changes the rules each match. A completed duel pays ${ECONOMY.winReward} Stellar Prisms for a win, ${ECONOMY.drawReward} for a draw, or ${ECONOMY.lossReward} for a loss.`,
  },
];
