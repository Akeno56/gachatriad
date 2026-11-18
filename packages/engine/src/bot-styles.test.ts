import { expect, it } from 'vitest';
import {
  applyMove,
  chooseCpuMove,
  cpuView,
  createGame,
  CPU_STYLES,
  legalMoves,
  seededRandom,
  STANDARD,
  type Card,
  type CpuStyle,
  type GameState,
} from './index';
function position(seed: number) {
  const random = seededRandom(seed);
  const deck = (prefix: string) =>
    Array.from({ length: 5 }, (_, i): Card => ({
      id: prefix + i,
      characterId: prefix + i,
      universeId: 'test',
      name: prefix + i,
      rarity: 1,
      set: 'test',
      enabled: true,
      stats: [
        1 + Math.floor(random() * 9),
        1 + Math.floor(random() * 9),
        1 + Math.floor(random() * 9),
        1 + Math.floor(random() * 9),
      ],
    }));
  let state = createGame(
    [deck('a'), deck('b')],
    { ...STANDARD, same: true, plus: true, combo: true },
    random,
  );
  for (let turn = 0; turn < seed % 7; turn++) {
    const moves = legalMoves(state);
    state = applyMove(state, moves[Math.floor(random() * moves.length)]);
  }
  return state;
}
it('keeps the default balanced policy and all styles deterministic, legal and blind to hidden cards', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const state = position(seed),
      hidden = 1 - state.turn;
    const altered: GameState = {
      ...state,
      hands: state.hands.map((cards, i) =>
        i === hidden
          ? cards.map((c) => ({ ...c, id: 'hidden-' + c.id, stats: [10, 10, 10, 10] }))
          : cards,
      ) as unknown as GameState['hands'],
    };
    const previous = structuredClone(state);
    expect(chooseCpuMove(cpuView(state), 'normal', seededRandom(seed))).toEqual(
      chooseCpuMove(cpuView(state), 'normal', seededRandom(seed), 'balanced'),
    );
    for (const style of CPU_STYLES)
      for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        const move = chooseCpuMove(cpuView(state), difficulty, seededRandom(seed), style);
        expect(legalMoves(state)).toContainEqual(move);
        expect(chooseCpuMove(cpuView(altered), difficulty, seededRandom(seed), style)).toEqual(
          move,
        );
      }
    expect(state).toEqual(previous);
  }
});
it('makes attack, defence and combo preferences produce different real choices', () => {
  const different: Record<CpuStyle, number> = {
    balanced: 0,
    aggressive: 0,
    defensive: 0,
    combo: 0,
  };
  let comboAdvantages = 0,
    attackAdvantages = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const state = position(seed),
      view = cpuView(state),
      base = chooseCpuMove(view, 'normal', () => 0, 'balanced')!;
    const normal = applyMove(state, base).history.at(-1)!.captures;
    for (const style of CPU_STYLES) {
      const move = chooseCpuMove(view, 'normal', () => 0, style)!;
      if (move.cardId !== base.cardId || move.cell !== base.cell) different[style]++;
      const captures = applyMove(state, move).history.at(-1)!.captures;
      if (
        style === 'combo' &&
        captures.filter((c) => c.reason !== 'standard').length >
          normal.filter((c) => c.reason !== 'standard').length
      )
        comboAdvantages++;
      if (style === 'aggressive') attackAdvantages += captures.length - normal.length;
    }
  }
  expect(different.aggressive).toBeGreaterThan(0);
  expect(different.defensive).toBeGreaterThan(10);
  expect(different.combo).toBeGreaterThan(0);
  expect(comboAdvantages).toBeGreaterThan(0);
  expect(attackAdvantages).toBeGreaterThanOrEqual(0);
});
