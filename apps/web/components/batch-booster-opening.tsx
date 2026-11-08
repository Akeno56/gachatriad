'use client';
import type { BoosterView } from '@gacha-triad/shared/platform';
import { AutomaticBoosterOpening } from './automatic-booster-opening';
export function BatchBoosterOpening({
  packs,
  onClose,
}: {
  packs: BoosterView[];
  onClose: () => void;
}) {
  return (
    <AutomaticBoosterOpening
      key={packs.map((p) => p.id).join(',')}
      packs={packs}
      onClose={onClose}
    />
  );
}
