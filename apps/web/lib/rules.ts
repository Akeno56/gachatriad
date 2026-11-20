import type { Rules } from '@gacha-triad/engine';
import type { MatchView } from '@gacha-triad/shared/platform';

export const matchModeNames: Record<MatchView['mode'], string> = {
  solo: 'Practice',
  casual: 'Unranked',
  ranked: 'Ranked',
  'ranked-random': 'Ranked Random',
  correspondence: 'Correspondence',
  draft: 'Draft',
  'shared-draft': 'Shared Draft',
  custom: 'Custom game',
  roulette: 'Roulette',
};
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
