import type { CSSProperties } from 'react';
const ELEMENTS: Record<string, { name: string; color: string; path: string }> = {
  fire: {
    name: 'Fire',
    color: '#ff9b73',
    path: 'M12 2c1 5 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 4-7 0 4 2 4 2 4s3-4 0-9Z',
  },
  water: {
    name: 'Water',
    color: '#81c8ff',
    path: 'M12 2 5 12a8 8 0 1 0 14 0L12 2Z M8 15c0 3 2 4 4 4',
  },
  ice: {
    name: 'Ice',
    color: '#a5edff',
    path: 'M12 2v20 M3.3 7l17.4 10 M3.3 17 20.7 7 M9 4l3 3 3-3 M9 20l3-3 3 3',
  },
  lightning: { name: 'Lightning', color: '#ddbdff', path: 'm14 2-9 12h7l-2 8 9-13h-7l2-7Z' },
  wind: {
    name: 'Wind',
    color: '#a5edcc',
    path: 'M3 8h13c5 0 5-6 1-6-2 0-3 1-3 3 M3 12h16 M3 16h10c5 0 5 6 1 6-2 0-3-1-3-3',
  },
  earth: { name: 'Earth', color: '#e8c88c', path: 'm12 2 9 10-9 10L3 12 12 2Z M3 12h18 M12 2v20' },
  holy: { name: 'Holy', color: '#fff0ac', path: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z' },
  poison: {
    name: 'Poison',
    color: '#c4df91',
    path: 'M9 2h6 M10 2v7L4 19c-1 2 0 3 2 3h12c2 0 3-1 2-3L14 9V2 M7 16h10 M10 19h.1 M14 18h.1',
  },
};
export function ElementIcon({ element, className = '' }: { element: string; className?: string }) {
  const icon = ELEMENTS[element];
  if (!icon) return null;
  return (
    <span
      className={`element-icon ${className}`}
      data-element={element}
      style={{ '--element-color': icon.color } as CSSProperties}
      role="img"
      aria-label={`${icon.name} element`}
      title={icon.name}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={icon.path} />
      </svg>
    </span>
  );
}
