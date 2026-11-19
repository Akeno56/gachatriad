'use client';
import { PORTRAIT_FRAMES, type PortraitFrame } from '@gacha-triad/shared/customization';
export function frameClass(id: PortraitFrame | null | undefined) {
  return `portrait-frame frame-${PORTRAIT_FRAMES.some((f) => f.id === id) ? id : 'classic'}`;
}
export function FrameArt({ frameId = 'classic' }: { frameId?: PortraitFrame | null }) {
  if (!frameId || frameId === 'classic') return null;
  const paths: Record<string, string> = {
    silver:
      'M2 28V2H28 M72 2H98V28 M98 72V98H72 M28 98H2V72 M7 23V7H23 M77 7H93V23 M93 77V93H77 M23 93H7V77',
    azure:
      'M2 24V10L10 2H38 M62 2H90L98 10V24 M98 76V90L90 98H62 M38 98H10L2 90V76 M43 6L50 1L57 6L50 11Z',
    verdant:
      'M2 30V14H8V8H14V2H30 M70 2H86V8H92V14H98V30 M98 70V86H92V92H86V98H70 M30 98H14V92H8V86H2V70 M7 21L21 7 M79 7L93 21 M93 79L79 93 M21 93L7 79',
    amethyst:
      'M2 22L22 2H78L98 22V78L78 98H22L2 78Z M5 20L12 12L20 5L21 14L14 21Z M80 5L88 12L95 20L86 21L79 14Z M95 80L88 88L80 95L79 86L86 79Z M20 95L12 88L5 80L14 79L21 86Z',
    gold: 'M2 30V2H32 M68 2H98V30 M98 70V98H70 M30 98H2V70 M38 3L43 11L50 2L57 11L62 3L59 18H41Z M7 23V7H23 M77 7H93V23 M93 77V93H77 M23 93H7V77',
  };
  return (
    <svg
      className="portrait-frame-art"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={paths[frameId] ?? ''} />
    </svg>
  );
}
