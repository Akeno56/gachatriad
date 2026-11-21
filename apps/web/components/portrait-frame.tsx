'use client';
import { PORTRAIT_FRAMES, type PortraitFrame } from '@gacha-triad/shared/customization';
import { AstralArt } from './astral-art';

const paths = {
  silver: 'M2 28V2H28 M72 2H98V28 M98 72V98H72 M28 98H2V72',
  azure:
    'M2 29V6L6 2H38 M62 2H94L98 6V29 M98 71V94L94 98H62 M38 98H6L2 94V71 M44 4L50 1L56 4L50 7Z',
  verdant:
    'M2 36V8H4V4H8V2H36 M64 2H92V4H96V8H98V36 M98 64V92H96V96H92V98H64 M36 98H8V96H4V92H2V64',
  amethyst: 'M2 8L8 2H92L98 8V92L92 98H8L2 92Z M3 16L16 3 M84 3L97 16 M97 84L84 97 M16 97L3 84',
  gold: 'M2 32V2H32 M68 2H98V32 M98 68V98H68 M32 98H2V68 M40 2L45 4L50 1L55 4L60 2L58 7H42Z',
};

export function frameClass(id: PortraitFrame | null | undefined) {
  return `portrait-frame frame-${PORTRAIT_FRAMES.some((frame) => frame.id === id) ? id : 'classic'}`;
}

export function FrameArt({ frameId }: { frameId?: PortraitFrame | null }) {
  if (frameId === 'astral') return <AstralArt kind="frame" />;
  if (frameId === 'ember') return <span className="ember-frame-art" aria-hidden="true" />;
  if (!frameId || frameId === 'classic' || !Object.hasOwn(paths, frameId)) return null;
  return (
    <span className="portrait-frame-art" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d={paths[frameId]} />
      </svg>
    </span>
  );
}
