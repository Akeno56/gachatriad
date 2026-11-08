'use client';
import type { BoosterView } from '@gacha-triad/shared/platform';
import { AutomaticBoosterOpening } from './automatic-booster-opening';
export function BoosterOpening({
  pack,
  onClose,
}: {
  pack: BoosterView;
  onClose: () => void;
  onNext?: () => void;
}) {
  return <AutomaticBoosterOpening key={pack.id} packs={[pack]} onClose={onClose} />;
}
