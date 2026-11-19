import { achievementCategory } from '@gacha-triad/shared/customization';
export function AchievementIcon({ id, earned = false }: { id: string; earned?: boolean }) {
  const category = achievementCategory(id);
  const paths = {
    duels: 'm5 3 13 13-2 2L3 5V3h2ZM12 18l6-6M15 21l6-6M17 17l4 4',
    techniques: 'M12 3v18M3 12h18M6 6l12 12M18 6 6 18',
    collection: 'M5 6h13v15H5ZM8 3h13v15M8 10h7M8 14h7',
    exchanges: 'M3 7h16l-4-4M21 17H5l4 4M19 7l-4 4M5 17l4-4',
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
        <path d={paths[category as keyof typeof paths]} />
      </svg>
    </span>
  );
}
