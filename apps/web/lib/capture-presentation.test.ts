import { it, expect } from 'vitest';
import { capturePhases } from './capture-presentation';
it('presents Same, Plus, ordinary captures and Combo as separate ordered phases', () => {
  const phases = capturePhases([
    { cell: 0, from: 1, to: 0, reason: 'same' },
    { cell: 2, from: 1, to: 0, reason: 'plus' },
    { cell: 3, from: 1, to: 0, reason: 'combo' },
    { cell: 4, from: 1, to: 0, reason: 'combo' },
  ]);
  expect(phases.map((p) => p.label)).toEqual(['SAME', 'PLUS', 'COMBO']);
  expect(phases.map((p) => p.captures.map((c) => c.cell))).toEqual([[0], [2], [3, 4]]);
});
