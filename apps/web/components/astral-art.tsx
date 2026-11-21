import { ASTRAL_REWARDS, type ProfileBanner } from '@gacha-triad/shared/customization';
import type { CSSProperties } from 'react';
import { assetPath } from '../lib/connection';

export function AstralArt({ kind }: { kind: 'frame' | 'crest' }) {
  const path = assetPath(`/assets/ui/astral-${kind}`);
  return (
    <span
      className={`astral-art astral-${kind}-art`}
      style={
        {
          '--astral-poster': `url("${path}.webp")`,
          '--astral-loop': `url("${path}-loop.webp")`,
        } as CSSProperties
      }
      aria-hidden="true"
    />
  );
}

export function AstralCrestArt({ bannerId }: { bannerId?: ProfileBanner }) {
  return bannerId === ASTRAL_REWARDS.banner.id ? <AstralArt kind="crest" /> : null;
}
