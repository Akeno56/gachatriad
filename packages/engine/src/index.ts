/** Pure, immutable rules engine. Stats are ordered top, right, bottom, left. */
export type Player = 0 | 1;
export type Stats = readonly [number, number, number, number];
export const ELEMENTS = [
  'fire',
  'water',
  'ice',
  'lightning',
  'wind',
  'earth',
  'holy',
  'poison',
] as const;
export type Element = (typeof ELEMENTS)[number];
export interface Card {
  readonly id: string;
  readonly characterId: string;
  readonly universeId: string;
  readonly name: string;
  readonly rarity: number;
  readonly stats: Stats;
  readonly element?: string;
  readonly type?: string;
  readonly set: string;
  readonly enabled: boolean;
  readonly artworkId?: string;
  readonly balanceVersion?: string;
  readonly baseCardId?: string;
  readonly finish?: 'holo';
}
export interface Rules {
  readonly allOpen: boolean;
  readonly same: boolean;
  readonly plus: boolean;
  readonly combo: boolean;
  readonly threeOpen?: boolean;
  readonly random?: boolean;
  readonly elemental?: boolean;
}
export interface PlacedCard {
  readonly card: Card;
  readonly owner: Player;
  readonly originalOwner: Player;
}
export interface Move {
  readonly player: Player;
  readonly cardId: string;
  readonly cell: number;
}
export type CaptureReason = 'standard' | 'same' | 'plus' | 'combo';
export interface Capture {
  readonly cell: number;
  readonly from: Player;
  readonly to: Player;
  readonly reason: CaptureReason;
}
export interface Turn {
  readonly move: Move;
  readonly captures: readonly Capture[];
}
export interface GameState {
  readonly board: readonly (PlacedCard | null)[];
  readonly hands: readonly [readonly Card[], readonly Card[]];
  readonly turn: Player;
  readonly firstPlayer: Player;
  readonly rules: Rules;
  readonly history: readonly Turn[];
  readonly status: 'playing' | 'complete';
  readonly revealed: readonly [readonly string[], readonly string[]];
  /** Optional for saves created before Elemental was introduced. Generated once per match. */
  readonly cellElements?: readonly (Element | null)[];
}
export const STANDARD: Rules = Object.freeze({
  allOpen: false,
  same: false,
  plus: false,
  combo: false,
});
export const PRESETS = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Every card visible. Pure strategy.',
    rules: { ...STANDARD, allOpen: true },
  },
  { id: 'standard', name: 'Standard', description: 'Keep your hand a secret.', rules: STANDARD },
  {
    id: 'same',
    name: 'Same Clash',
    description: 'Match two sides. Start a chain.',
    rules: { ...STANDARD, allOpen: true, same: true, combo: true },
  },
  {
    id: 'plus',
    name: 'Plus Battle',
    description: 'Equal sums turn the tide.',
    rules: { ...STANDARD, allOpen: true, plus: true, combo: true },
  },
  {
    id: 'combo',
    name: 'Combo Master',
    description: 'Same + Plus. A little calculated chaos.',
    rules: { ...STANDARD, allOpen: true, same: true, plus: true, combo: true },
  },
  {
    id: 'unranked',
    name: 'Unranked · Three Open',
    description: 'Three Open, Same, Plus and Combo. No card trade.',
    rules: { ...STANDARD, threeOpen: true, same: true, plus: true, combo: true },
  },
  {
    id: 'ranked',
    name: 'Ranked · Same / Plus / Combo',
    description: 'Closed hands. Trade One in ranked PvP.',
    rules: { ...STANDARD, same: true, plus: true, combo: true },
  },
  {
    id: 'random',
    name: 'Random',
    description: 'A legal deck is drawn from the available collection.',
    rules: { ...STANDARD, allOpen: true, random: true },
  },
  {
    id: 'elemental',
    name: 'Elemental',
    description:
      'Marked cells grant +1 for a matching element, −1 otherwise. Same/Plus use printed values.',
    rules: { ...STANDARD, allOpen: true, elemental: true },
  },
] as const;
export function supportsTradeOne(rules: Rules): boolean {
  return !rules.allOpen && !rules.threeOpen && rules.same && rules.plus && rules.combo;
}
export function generateCellElements(random: () => number): readonly (Element | null)[] {
  const cells: (Element | null)[] = Array(9).fill(null),
    count = 1 + Math.floor(random() * 5);
  for (const cell of shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], random).slice(0, count))
    cells[cell] = ELEMENTS[Math.floor(random() * ELEMENTS.length)];
  return cells;
}
export function elementalModifier(
  state: Pick<GameState, 'rules' | 'cellElements'>,
  card: Card,
  cell: number,
): number {
  const element = state.rules.elemental ? state.cellElements?.[cell] : null;
  return element ? (card.element === element ? 1 : -1) : 0;
}
export const otherPlayer = (player: Player): Player => (player === 0 ? 1 : 0);
export const displayValue = (value: number): string => (value === 10 ? 'A' : String(value));

/** Mulberry32: deterministic randomness for fixtures, shuffles, and CPU decisions. Not for economy. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function createGame(
  decks: readonly [readonly Card[], readonly Card[]],
  rules: Rules = STANDARD,
  random: () => number = seededRandom(1),
): GameState {
  for (const deck of decks) {
    if (deck.length !== 5 || new Set(deck.map((c) => c.baseCardId ?? c.id)).size !== 5)
      throw new Error('A deck requires five distinct cards.');
    for (const card of deck) {
      if (
        !card.enabled ||
        !card.id ||
        card.stats.length !== 4 ||
        card.stats.some((n) => !Number.isInteger(n) || n < 1 || n > 10)
      )
        throw new Error('Invalid card definition.');
    }
  }
  if (rules.combo && !rules.same && !rules.plus) throw new Error('Combo requires Same or Plus.');
  if (rules.allOpen && rules.threeOpen)
    throw new Error('All Open and Three Open cannot be combined.');
  const firstPlayer: Player = random() < 0.5 ? 0 : 1;
  // Copy card definitions so callers cannot mutate an active deck through catalog references.
  const copy = (deck: readonly Card[]) =>
    deck.map((c) => ({ ...c, stats: [...c.stats] as unknown as Stats }));
  return {
    board: Array(9).fill(null),
    hands: [copy(decks[0]), copy(decks[1])],
    turn: firstPlayer,
    firstPlayer,
    rules: { ...rules },
    history: [],
    status: 'playing',
    cellElements: rules.elemental ? generateCellElements(random) : Array(9).fill(null),
    revealed: decks.map((deck) =>
      rules.allOpen
        ? deck.map((c) => c.id)
        : rules.threeOpen
          ? shuffle(deck, random)
              .slice(0, 3)
              .map((c) => c.id)
          : [],
    ) as [string[], string[]],
  };
}
export interface Neighbor {
  readonly cell: number;
  readonly side: number;
  readonly opposite: number;
}
export function neighbors(cell: number): Neighbor[] {
  const result: Neighbor[] = [];
  if (cell >= 3) result.push({ cell: cell - 3, side: 0, opposite: 2 });
  if (cell % 3 < 2) result.push({ cell: cell + 1, side: 1, opposite: 3 });
  if (cell < 6) result.push({ cell: cell + 3, side: 2, opposite: 0 });
  if (cell % 3 > 0) result.push({ cell: cell - 1, side: 3, opposite: 1 });
  return result;
}
export function scores(state: GameState): readonly [number, number] {
  const result: [number, number] = [state.hands[0].length, state.hands[1].length];
  for (const item of state.board) if (item) result[item.owner]++;
  return result;
}
export function winner(state: GameState): Player | 'draw' | null {
  if (state.status !== 'complete') return null;
  const [a, b] = scores(state);
  return a === b ? 'draw' : a > b ? 0 : 1;
}
export function isRevealed(state: GameState, player: Player, cardId: string): boolean {
  return (
    state.status === 'complete' || state.rules.allOpen || state.revealed[player].includes(cardId)
  );
}
export function validateDeck(cards: readonly Card[]): string[] {
  const errors: string[] = [];
  if (cards.length !== 5) errors.push('Select exactly five cards.');
  if (new Set(cards.map((c) => c.baseCardId ?? c.id)).size !== cards.length)
    errors.push('A deck cannot contain duplicate card definitions.');
  const fives = cards.filter((c) => c.rarity === 5).length;
  const fours = cards.filter((c) => c.rarity === 4).length;
  if (fives > 1) errors.push('Only one 5-star card is allowed.');
  if (fours > (fives ? 1 : 2))
    errors.push(
      fives ? 'A 5-star deck may contain one 4-star card.' : 'Only two 4-star cards are allowed.',
    );
  if (cards.some((c) => !c.enabled)) errors.push('A selected card is disabled.');
  return errors;
}
export function randomDeck(pool: readonly Card[], random: () => number): Card[] {
  const candidates = shuffle(
    pool.filter((c) => c.enabled),
    random,
  );
  const deck: Card[] = [];
  for (const card of candidates) {
    if (deck.some((c) => (c.baseCardId ?? c.id) === (card.baseCardId ?? card.id))) continue;
    const next = [...deck, card];
    if (validateDeck(next).every((e) => e === 'Select exactly five cards.')) deck.push(card);
    if (deck.length === 5) return deck;
  }
  throw new Error('The available collection cannot form a legal deck.');
}
/** Maximize total rarity; a supplied RNG varies peers, otherwise printed values break ties. */
export function buildBestDeck(pool: readonly Card[], random?: () => number): Card[] {
  const value = (c: Card) => c.stats.reduce((sum, n) => sum + n, 0);
  const enabled = pool.filter((c) => c.enabled);
  const sorted = random
    ? shuffle(enabled, random).sort((a, b) => b.rarity - a.rarity)
    : enabled.sort(
        (a, b) => b.rarity - a.rarity || value(b) - value(a) || a.id.localeCompare(b.id),
      );
  const unique = sorted.filter(
    (c, i) =>
      sorted.findIndex((other) => (other.baseCardId ?? other.id) === (c.baseCardId ?? c.id)) === i,
  );
  const fives = unique.filter((c) => c.rarity === 5),
    fours = unique.filter((c) => c.rarity === 4),
    lower = unique.filter((c) => c.rarity < 4);
  let best: Card[] | null = null;
  for (let five = 0; five <= 1; five++)
    for (let four = 0; four <= (five ? 1 : 2); four++) {
      if (fives.length < five || fours.length < four) continue;
      const deck = [
        ...fives.slice(0, five),
        ...fours.slice(0, four),
        ...lower.slice(0, 5 - five - four),
      ];
      if (validateDeck(deck).length) continue;
      const rarity = deck.reduce((s, c) => s + c.rarity, 0),
        stats = deck.reduce((s, c) => s + value(c), 0);
      if (
        !best ||
        rarity > best.reduce((s, c) => s + c.rarity, 0) ||
        (rarity === best.reduce((s, c) => s + c.rarity, 0) &&
          stats > best.reduce((s, c) => s + value(c), 0))
      )
        best = deck;
    }
  if (!best) throw new Error('The available collection cannot form a legal deck.');
  return best;
}
export function validateMove(state: GameState, move: Move): string | null {
  if (state.status !== 'playing') return 'This match has ended.';
  if (move.player !== state.turn) return 'It is not your turn.';
  if (!Number.isInteger(move.cell) || move.cell < 0 || move.cell > 8)
    return 'Choose a cell on the board.';
  if (state.board[move.cell]) return 'That cell is occupied.';
  if (!state.hands[move.player].some((c) => c.id === move.cardId))
    return 'That card is not in your hand.';
  return null;
}
export function legalMoves(state: GameState): Move[] {
  if (state.status !== 'playing') return [];
  return state.hands[state.turn].flatMap((card) =>
    state.board.flatMap((item, cell) =>
      item ? [] : [{ player: state.turn, cardId: card.id, cell }],
    ),
  );
}

export function applyMove(state: GameState, move: Move): GameState {
  const error = validateMove(state, move);
  if (error) throw new Error(error);
  const card = state.hands[move.player].find((c) => c.id === move.cardId)!;
  const board = state.board.map((item) => (item ? { ...item } : null));
  board[move.cell] = { card, owner: move.player, originalOwner: move.player };
  const adjacent = neighbors(move.cell).filter((n) => board[n.cell]);
  const special = new Map<number, CaptureReason>();
  // Same and Plus use the same pre-capture snapshot; friendly neighbors count.
  if (state.rules.same) {
    const equal = adjacent.filter(
      (n) => card.stats[n.side] === board[n.cell]!.card.stats[n.opposite],
    );
    if (equal.length >= 2) for (const n of equal) special.set(n.cell, 'same');
  }
  if (state.rules.plus) {
    const groups = new Map<number, Neighbor[]>();
    for (const n of adjacent) {
      const sum = card.stats[n.side] + board[n.cell]!.card.stats[n.opposite];
      groups.set(sum, [...(groups.get(sum) ?? []), n]);
    }
    for (const group of groups.values())
      if (group.length >= 2)
        for (const n of group) if (!special.has(n.cell)) special.set(n.cell, 'plus');
  }
  const captures: Capture[] = [];
  const queue: number[] = [];
  function capture(cell: number, reason: CaptureReason): boolean {
    const target = board[cell]!;
    if (target.owner === move.player) return false;
    captures.push({ cell, from: target.owner, to: move.player, reason });
    board[cell] = { ...target, owner: move.player };
    return true;
  }
  for (const [cell, reason] of special) if (capture(cell, reason)) queue.push(cell);
  // Direct ordinary captures never initiate a combo.
  for (const n of adjacent)
    if (
      card.stats[n.side] + elementalModifier(state, card, move.cell) >
      board[n.cell]!.card.stats[n.opposite] + elementalModifier(state, board[n.cell]!.card, n.cell)
    )
      capture(n.cell, 'standard');
  if (state.rules.combo) {
    for (let i = 0; i < queue.length; i++) {
      const source = board[queue[i]]!;
      for (const n of neighbors(queue[i])) {
        const target = board[n.cell];
        if (
          target &&
          source.card.stats[n.side] + elementalModifier(state, source.card, queue[i]) >
            target.card.stats[n.opposite] + elementalModifier(state, target.card, n.cell) &&
          capture(n.cell, 'combo')
        )
          queue.push(n.cell);
      }
    }
  }
  const hands: [readonly Card[], readonly Card[]] = [state.hands[0], state.hands[1]];
  hands[move.player] = hands[move.player].filter((c) => c.id !== move.cardId);
  return {
    ...state,
    board,
    hands,
    turn: otherPlayer(state.turn),
    history: [...state.history, { move: { ...move }, captures }],
    status: board.every(Boolean) ? 'complete' : 'playing',
  };
}

export type Difficulty = 'easy' | 'normal' | 'hard';
/** CPU receives only its own hand and the public board. Opponent hidden cards are omitted. */
export type CpuView = Omit<GameState, 'hands' | 'revealed'> & { readonly hand: readonly Card[] };
export function cpuView(state: GameState): CpuView {
  const { hands, revealed, ...publicState } = state;
  return { ...publicState, hand: hands[state.turn] };
}
export function chooseCpuMove(
  view: CpuView,
  difficulty: Difficulty,
  random: () => number,
): Move | null {
  // A synthetic empty opposing hand is sufficient for local capture evaluation. No hidden knowledge.
  const hands: [readonly Card[], readonly Card[]] = [[], []];
  hands[view.turn] = view.hand;
  const state: GameState = { ...view, hands, revealed: [[], []] };
  const moves = legalMoves(state);
  if (!moves.length) return null;
  if (difficulty === 'easy' && random() < 0.75) return moves[Math.floor(random() * moves.length)];
  let best = -Infinity;
  let candidates: Move[] = [];
  for (const move of moves) {
    const next = applyMove(state, move);
    const captures = next.history.at(-1)!.captures.length;
    const card = next.board[move.cell]!.card;
    const exposure = neighbors(move.cell).filter((n) => !next.board[n.cell]);
    const modifier = elementalModifier(state, card, move.cell);
    const defense = exposure.reduce((total, n) => total + card.stats[n.side] + modifier, 0);
    const weakness = exposure.reduce(
      (total, n) => total + Math.max(0, 6 - card.stats[n.side] - modifier),
      0,
    );
    let value =
      captures * 12 + defense * 0.22 - weakness * 0.65 + (exposure.length === 0 ? 0.4 : 0);
    if (difficulty === 'hard') {
      // Evaluate exposed friendly edges, including flipped cards, without reading hidden hands.
      let risk = 0;
      for (let cell = 0; cell < 9; cell++) {
        const placed = next.board[cell];
        if (!placed || placed.owner !== view.turn) continue;
        const mark = elementalModifier(next, placed.card, cell);
        for (const edge of neighbors(cell))
          if (!next.board[edge.cell]) risk += Math.max(0, 9 - placed.card.stats[edge.side] - mark);
      }
      value =
        captures * 15 +
        defense * 0.32 -
        weakness * 0.85 -
        risk * 0.9 +
        (exposure.length === 0 ? 2 : 0);
    }
    if (value > best + 0.0001) {
      best = value;
      candidates = [move];
    } else if (Math.abs(value - best) < 0.0001) candidates.push(move);
  }
  return candidates[Math.floor(random() * candidates.length)];
}
