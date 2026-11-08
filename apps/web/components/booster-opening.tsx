'use client';
import { LocaleView } from './i18n';

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
  return (
    <LocaleView>
      <AutomaticBoosterOpening key={pack.id} packs={[pack]} onClose={onClose} />
    </LocaleView>
  );
}
