import type { Rules } from '@gacha-triad/engine';
export function ruleNames(r: Rules) {
  return [
    r.allOpen ? 'All Open' : r.threeOpen ? 'Three Open' : 'Closed',
    ...(r.same ? ['Same'] : []),
    ...(r.plus ? ['Plus'] : []),
    ...(r.combo ? ['Combo'] : []),
    ...(r.random ? ['Random'] : []),
    ...(r.elemental ? ['Elemental'] : []),
  ];
}
