import { ASTRAL_REWARDS, type ProfileBanner } from '@gacha-triad/shared/customization';
import type { CSSProperties } from 'react';
import { assetPath } from '../lib/connection';

export function AnimatedCosmeticArt({
  asset,
}: {
  asset: 'astral-frame' | 'astral-crest' | 'regalia-frame' | 'regalia-banner';
}) {
  const path = assetPath(`/assets/ui/${asset}`);
  const version = asset === 'astral-frame' || asset.startsWith('regalia-') ? '?v=2' : '';
  const placement = asset.endsWith('-frame') ? 'frame' : 'banner';
  return (
    <span
      className={`cosmetic-animation cosmetic-animation-${placement} ${asset}-art`}
      style={
        {
          '--cosmetic-poster': `url("${path}.webp${version}")`,
          '--cosmetic-loop': `url("${path}-loop.webp${version}")`,
        } as CSSProperties
      }
      aria-hidden="true"
    />
  );
}

export function ProfileBannerArt({ bannerId }: { bannerId?: ProfileBanner }) {
  if (bannerId === 'regalia') return <AnimatedCosmeticArt asset="regalia-banner" />;
  return bannerId === ASTRAL_REWARDS.banner.id ? (
    <AnimatedCosmeticArt asset="astral-crest" />
  ) : null;
}
