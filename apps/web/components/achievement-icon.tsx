import { achievementCategory } from '@gacha-triad/shared/platform';
export function AchievementIcon({ id, earned = false }: { id: string; earned?: boolean }) {
  const category = achievementCategory(id);
  const paths = {
    duels: 'm5 3 13 13-2 2L3 5V3h2ZM12 18l6-6M15 21l6-6M17 17l4 4',
    milestones: 'M12 2l9 10-9 10-9-10 9-10ZM12 7l4 5-4 5-4-5 4-5Z',
    techniques: 'M12 3v18M3 12h18M6 6l12 12M18 6 6 18',
    collection: 'M5 6h13v15H5ZM8 3h13v15M8 10h7M8 14h7',
    exchanges: 'M3 7h16l-4-4M21 17H5l4 4M19 7l-4 4M5 17l4-4',
    puzzles: 'M3 3h7v4h4V3h7v7h-4v4h4v7h-7v-4h-4v4H3v-7h4v-4H3Z',
  };
  return (
    <span
      className={`achievement-icon category-${category} ${earned ? 'is-earned' : ''}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="miter"
      >
        <path d={paths[category]} />
      </svg>
    </span>
  );
}
