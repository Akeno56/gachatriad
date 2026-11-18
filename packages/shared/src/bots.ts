import type { CpuStyle } from '@gacha-triad/engine';
export const BOT_STYLES: readonly { id: CpuStyle; name: string; description: string }[] = [
  { id: 'balanced', name: 'Balanced', description: 'Captures and defence.' },
  { id: 'aggressive', name: 'Attack', description: 'Prioritises captures.' },
  { id: 'defensive', name: 'Defence', description: 'Protects exposed sides.' },
  { id: 'combo', name: 'Combos', description: 'Prioritises Same, Plus and Combo.' },
];
