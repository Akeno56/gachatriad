'use client';
import { PORTRAIT_FRAMES, type PortraitFrame } from '@gacha-triad/shared/customization';
import type { CSSProperties } from 'react';
import { assetPath } from '../lib/connection';
import { AnimatedCosmeticArt } from './astral-art';

export function frameClass(id: PortraitFrame | null | undefined) {
  return `portrait-frame frame-${PORTRAIT_FRAMES.some((frame) => frame.id === id) ? id : 'classic'}`;
}

export function FrameArt({ frameId }: { frameId?: PortraitFrame | null }) {
  if (frameId === 'astral') return <AnimatedCosmeticArt asset="astral-frame" />;
  if (frameId === 'regalia') return <AnimatedCosmeticArt asset="regalia-frame" />;
  if (!frameId || frameId === 'classic' || !PORTRAIT_FRAMES.some(({ id }) => id === frameId))
    return null;
  return (
    <span
      className="cosmetic-frame-art"
      style={
        {
          '--frame-art': `url("${assetPath(`/assets/ui/${frameId}-frame.webp`)}")`,
        } as CSSProperties
      }
      aria-hidden="true"
    />
  );
}
