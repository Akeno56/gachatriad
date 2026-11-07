import { describe, expect, it } from 'vitest';
import {
  applyMove,
  chooseCpuMove,
  cpuView,
  createGame,
  displayValue,
  legalMoves,
  neighbors,
  PRESETS,
  scores,
  seededRandom,
  shuffle,
  STANDARD,
  validateMove,
  winner,
  type Card,
  type GameState,
  type Player,
  type Rules,
  type Stats,
} from './index';

function card(id: string, stats: Stats = [1, 1, 1, 1]): Card {
  return {
    id,
    characterId: id,
    universeId: 'test',
    name: id,
    rarity: 1,
    stats,
    set: 'test',
    enabled: true,
  };
}
const deck = (prefix: string) => Array.from({ length: 5 }, (_, i) => card(`${prefix}${i}`));
function fixture(
  attack: Stats,
  items: [number, Player, Stats][],
  rules: Partial<Rules> = {},
): GameState {
  const game = createGame(
    [[card('attack', attack), ...deck('a').slice(1)], deck('b')],
    { ...STANDARD, ...rules },
    () => 0,
  );
  const board = [...game.board];
  for (const [cell, owner, stats] of items)
    board[cell] = { card: card(`board${cell}`, stats), owner, originalOwner: owner };
  return { ...game, board };
}
const play = (state: GameState, cell = 4) =>
  applyMove(state, { player: 0, cardId: 'attack', cell });

describe('game creation and move validation', () => {
  it('creates two five-card hands, nine empty spaces, and a 5–5 score', () => {
    const state = createGame([deck('a'), deck('b')]);
    expect(state.board).toEqual(Array(9).fill(null));
    expect(scores(state)).toEqual([5, 5]);
    expect(legalMoves(state)).toHaveLength(45);
    expect(winner(state)).toBeNull();
  });
  it('uses injected randomness to choose either first player', () => {
    expect(createGame([deck('a'), deck('b')], STANDARD, () => 0.1).turn).toBe(0);
    expect(createGame([deck('a'), deck('b')], STANDARD, () => 0.9).turn).toBe(1);
  });
  it('copies input decks and rules so future catalog edits do not affect the match', () => {
    const first = deck('a');
    const rules = { ...STANDARD };
    const state = createGame([first, deck('b')], rules, () => 0);
    (first[0].stats as unknown as number[])[0] = 9;
    rules.same = true;
    expect(state.hands[0][0].stats[0]).toBe(1);
    expect(state.rules.same).toBe(false);
  });
  it('rejects wrong deck sizes, duplicates, disabled cards, and invalid stats', () => {
    expect(() => createGame([[], deck('b')])).toThrow('five distinct');
    expect(() => createGame([Array(5).fill(card('a')), deck('b')])).toThrow('five distinct');
    for (const stats of [
      [0, 1, 1, 1],
      [11, 1, 1, 1],
      [1.5, 1, 1, 1],
      [NaN, 1, 1, 1],
    ])
      expect(() =>
        createGame([[card('x', stats as unknown as Stats), ...deck('a').slice(1)], deck('b')]),
      ).toThrow('Invalid card');
    expect(() =>
      createGame([[{ ...card('x'), enabled: false }, ...deck('a').slice(1)], deck('b')]),
    ).toThrow('Invalid card');
    expect(() => createGame([deck('a'), deck('b')], { ...STANDARD, combo: true })).toThrow(
      'Combo requires',
    );
  });
  it('rejects wrong turns, absent cards, occupied cells, and invalid coordinates without mutation', () => {
    const state = createGame([deck('a'), deck('b')], STANDARD, () => 0);
    const before = JSON.stringify(state);
    const invalid = [
      { player: 1 as const, cardId: 'b0', cell: 0 },
      { player: 0 as const, cardId: 'b0', cell: 0 },
      ...[-1, 9, 0.5, NaN].map((cell) => ({ player: 0 as const, cardId: 'a0', cell })),
    ];
    for (const move of invalid) {
      expect(validateMove(state, move)).not.toBeNull();
      expect(() => applyMove(state, move)).toThrow();
    }
    expect(JSON.stringify(state)).toBe(before);
    const next = applyMove(state, { player: 0, cardId: 'a0', cell: 4 });
    expect(() => applyMove(next, { player: 1, cardId: 'b0', cell: 4 })).toThrow('occupied');
    expect(next.hands[0]).toHaveLength(4);
    expect(state.hands[0]).toHaveLength(5);
    expect(state.board[4]).toBeNull();
    expect(next.turn).toBe(1);
  });
});

describe('standard capture', () => {
  it.each([1, 3, 5, 7])('captures a weaker card at cell %i', (cell) => {
    const next = play(fixture([7, 7, 7, 7], [[cell, 1, [2, 2, 2, 2]]]));
    expect(next.board[cell]?.owner).toBe(0);
    expect(next.board[cell]?.originalOwner).toBe(1);
    expect(next.history[0].captures).toEqual([{ cell, from: 1, to: 0, reason: 'standard' }]);
  });
  it('compares the touching sides, not the same stat index', () => {
    const next = play(fixture([5, 2, 2, 2], [[1, 1, [9, 9, 4, 9]]]));
    expect(next.board[1]?.owner).toBe(0);
  });
  it('does not capture equal or stronger sides, friendly cards, or diagonals', () => {
    const next = play(
      fixture(
        [5, 5, 5, 5],
        [
          [1, 1, [5, 5, 5, 5]],
          [3, 1, [8, 8, 8, 8]],
          [5, 0, [1, 1, 1, 1]],
          [0, 1, [1, 1, 1, 1]],
        ],
      ),
    );
    expect(next.history[0].captures).toHaveLength(0);
  });
  it('does not wrap a row boundary or capture across the board', () => {
    expect(neighbors(2).map((n) => n.cell)).toEqual([5, 1]);
    const next = play(fixture([10, 10, 10, 10], [[3, 1, [1, 1, 1, 1]]]), 2);
    expect(next.board[3]?.owner).toBe(1);
  });
  it('displays 10 as A and other values as numbers', () => {
    expect(displayValue(10)).toBe('A');
    expect(displayValue(7)).toBe('7');
  });
});

describe('Same, Plus, and Combo resolution', () => {
  it('Same uses a friendly match to capture the opposing match', () => {
    const next = play(
      fixture(
        [4, 7, 1, 1],
        [
          [1, 0, [9, 9, 4, 9]],
          [5, 1, [9, 9, 9, 7]],
        ],
        { same: true, combo: true },
      ),
    );
    expect(next.history[0].captures).toEqual([{ cell: 5, from: 1, to: 0, reason: 'same' }]);
  });
  it('a single equal side cannot trigger Same', () => {
    const next = play(fixture([4, 1, 1, 1], [[1, 1, [9, 9, 4, 9]]], { same: true }));
    expect(next.board[1]?.owner).toBe(1);
  });
  it('two friendly Same matches cannot initiate a chain', () => {
    const next = play(
      fixture(
        [4, 7, 1, 1],
        [
          [1, 0, [9, 9, 4, 9]],
          [5, 0, [9, 9, 9, 7]],
          [2, 1, [1, 1, 1, 1]],
        ],
        { same: true, combo: true },
      ),
    );
    expect(next.history[0].captures).toHaveLength(0);
    expect(next.board[2]?.owner).toBe(1);
  });
  it('Plus captures equal sums using a friendly neighbor', () => {
    const next = play(
      fixture(
        [3, 5, 1, 1],
        [
          [1, 0, [9, 9, 6, 9]],
          [5, 1, [9, 9, 9, 4]],
        ],
        { plus: true },
      ),
    );
    expect(next.history[0].captures[0].reason).toBe('plus');
    expect(next.board[5]?.owner).toBe(0);
  });
  it('Plus supports multiple distinct matching sum groups in one placement', () => {
    const next = play(
      fixture(
        [2, 3, 4, 5],
        [
          [1, 1, [9, 9, 8, 9]],
          [5, 1, [9, 9, 9, 7]],
          [7, 1, [8, 9, 9, 9]],
          [3, 1, [9, 7, 9, 9]],
        ],
        { plus: true },
      ),
    );
    expect(next.history[0].captures).toHaveLength(4);
    expect(next.history[0].captures.every((c) => c.reason === 'plus')).toBe(true);
  });
  it('Same and Plus resolve from the same snapshot without duplicate flips', () => {
    const next = play(
      fixture(
        [5, 4, 2, 4],
        [
          [1, 1, [9, 9, 5, 9]],
          [5, 1, [9, 9, 9, 4]],
          [7, 1, [8, 9, 9, 9]],
          [3, 1, [9, 6, 9, 9]],
        ],
        { same: true, plus: true, combo: true },
      ),
    );
    expect(next.history[0].captures).toHaveLength(4);
    expect(new Set(next.history[0].captures.map((c) => c.cell)).size).toBe(4);
    expect(next.history[0].captures.map((c) => c.reason).sort()).toEqual([
      'plus',
      'plus',
      'same',
      'same',
    ]);
  });
  it('Combo chains through newly captured cards', () => {
    const next = play(
      fixture(
        [4, 4, 1, 1],
        [
          [1, 1, [1, 8, 4, 8]],
          [5, 1, [9, 1, 1, 4]],
          [2, 1, [1, 1, 1, 3]],
          [0, 1, [1, 3, 8, 1]],
          [3, 1, [1, 9, 1, 1]],
        ],
        { same: true, combo: true },
      ),
    );
    for (const cell of [1, 5, 2, 0, 3]) expect(next.board[cell]?.owner).toBe(0);
    expect(next.history[0].captures.filter((c) => c.reason === 'combo').map((c) => c.cell)).toEqual(
      [2, 0, 3],
    );
  });
  it('disabling Combo stops a special capture chain', () => {
    const next = play(
      fixture(
        [4, 4, 1, 1],
        [
          [1, 1, [1, 8, 4, 1]],
          [5, 1, [9, 1, 1, 4]],
          [2, 1, [1, 1, 1, 3]],
        ],
        { same: true },
      ),
    );
    expect(next.board[2]?.owner).toBe(1);
  });
  it('ordinary captures never initiate Combo', () => {
    const next = play(
      fixture(
        [5, 1, 1, 1],
        [
          [1, 1, [1, 8, 4, 1]],
          [2, 1, [1, 1, 1, 3]],
        ],
        { same: true, combo: true },
      ),
    );
    expect(next.board[1]?.owner).toBe(0);
    expect(next.board[2]?.owner).toBe(1);
    expect(next.history[0].captures[0].reason).toBe('standard');
  });
});

describe('completion, scoring, and deterministic CPU', () => {
  it('counts the tenth card in hand, returns draws, and blocks moves after completion', () => {
    let state = createGame([deck('a'), deck('b')], STANDARD, () => 0);
    for (let i = 0; i < 9; i++) state = applyMove(state, legalMoves(state)[0]);
    expect(state.status).toBe('complete');
    expect(state.hands[1]).toHaveLength(1);
    expect(scores(state)).toEqual([5, 5]);
    expect(winner(state)).toBe('draw');
    expect(legalMoves(state)).toEqual([]);
    expect(() => applyMove(state, { player: 1, cardId: state.hands[1][0].id, cell: 0 })).toThrow(
      'ended',
    );
    const board = state.board.map((c) => (c ? { ...c, owner: 0 as const } : null));
    expect(winner({ ...state, board })).toBe(0);
    expect(scores({ ...state, board })).toEqual([9, 1]);
    expect(
      winner({ ...state, board: board.map((c) => (c ? { ...c, owner: 1 as const } : null)) }),
    ).toBe(1);
  });
  it('Normal finds a Same capture and prefers it to an empty placement', () => {
    const state = fixture(
      [4, 4, 1, 1],
      [
        [1, 1, [9, 9, 4, 9]],
        [5, 1, [9, 9, 9, 4]],
      ],
      { same: true, combo: true },
    );
    const view = { ...cpuView(state), hand: [state.hands[0][0]] };
    expect(chooseCpuMove(view, 'normal', () => 0)?.cell).toBe(4);
  });
  it('never exposes the opposing hand to the CPU', () => {
    const state = createGame([deck('a'), deck('b')], STANDARD, () => 0);
    const view = cpuView(state);
    expect('hands' in view).toBe(false);
    expect(JSON.stringify(view)).not.toContain('b0');
    const changed = { ...state, hands: [state.hands[0], deck('secret')] } as GameState;
    expect(chooseCpuMove(view, 'normal', seededRandom(4))).toEqual(
      chooseCpuMove(cpuView(changed), 'normal', seededRandom(4)),
    );
    expect(chooseCpuMove(view, 'hard', seededRandom(4))).toEqual(
      chooseCpuMove(cpuView(changed), 'hard', seededRandom(4)),
    );
    expect(validateMove(state, chooseCpuMove(view, 'hard', seededRandom(4))!)).toBeNull();
  });
  it('replays identical seeded shuffles and games', () => {
    expect(shuffle(deck('a'), seededRandom(8))).toEqual(shuffle(deck('a'), seededRandom(8)));
    const run = () => {
      const random = seededRandom(123);
      let state = createGame([deck('a'), deck('b')], STANDARD, random);
      while (state.status === 'playing')
        state = applyMove(state, chooseCpuMove(cpuView(state), 'easy', random)!);
      return state;
    };
    expect(run()).toEqual(run());
  });
  it('finishes 200 varied seeded games with ten conserved cards and valid scores', () => {
    for (let seed = 0; seed < 200; seed++) {
      const random = seededRandom(seed);
      const makeDeck = (prefix: string) =>
        deck(prefix).map((c) => ({
          ...c,
          stats: Array.from({ length: 4 }, () => 1 + Math.floor(random() * 10)) as unknown as Stats,
        }));
      let state = createGame(
        [makeDeck('a'), makeDeck('b')],
        PRESETS[seed % PRESETS.length].rules,
        random,
      );
      while (state.status === 'playing') {
        const move = chooseCpuMove(cpuView(state), seed % 2 === 0 ? 'easy' : 'normal', random)!;
        expect(validateMove(state, move)).toBeNull();
        const before = JSON.stringify(state);
        const previous = state;
        state = applyMove(state, move);
        expect(JSON.stringify(previous)).toBe(before);
        expect(scores(state).reduce((a, b) => a + b)).toBe(10);
        expect(
          state.board.filter(Boolean).length + state.hands[0].length + state.hands[1].length,
        ).toBe(10);
      }
      expect(state.history).toHaveLength(9);
      expect(winner(state)).not.toBeNull();
      expect(chooseCpuMove(cpuView(state), 'normal', random)).toBeNull();
    }
  });
});
