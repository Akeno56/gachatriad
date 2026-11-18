export const CURRENT_SEASON = {
  id: 0,
  name: 'Astral',
  endAt: null,
} as const;

export const WEEKLY_OBJECTIVES = [
  {
    id: 'duels',
    name: 'Duels',
    description: 'Complete 3 full duels.',
    target: 3,
    href: '/',
  },
  {
    id: 'modes',
    name: 'Game modes',
    description: 'Complete duels in 2 different modes.',
    target: 2,
    href: '/lobbies',
  },
  {
    id: 'puzzle',
    name: 'Daily puzzle',
    description: 'Solve the daily puzzle.',
    target: 1,
    href: '/puzzle',
  },
  {
    id: 'boosters',
    name: 'Boosters',
    description: 'Open 2 non-starter boosters.',
    target: 2,
    href: '/boosters',
  },
  {
    id: 'deck',
    name: 'Saved deck',
    description: 'Save a complete named deck.',
    target: 1,
    href: '/decks',
  },
  {
    id: 'variant',
    name: 'Custom rules',
    description: 'Complete a Custom or Roulette duel.',
    target: 1,
    href: '/lobbies',
  },
] as const;
export type WeeklyObjectiveId = (typeof WEEKLY_OBJECTIVES)[number]['id'];
export const WEEKLY_REQUIRED = 5;
export const WEEKLY_REWARD = 150;

export const JOURNEY_CHAPTERS = [
  {
    id: 'learn',
    name: 'Tutorial',
    description: 'Complete the tutorial.',
    href: '/',
    action: 'How to play',
  },
  {
    id: 'booster',
    name: 'Boosters',
    description: 'Open a booster.',
    href: '/boosters',
    action: 'Open boosters',
  },
  {
    id: 'deck',
    name: 'Decks',
    description: 'Save a complete named deck.',
    href: '/decks',
    action: 'Build a deck',
  },
  {
    id: 'duel',
    name: 'Duels',
    description: 'Complete a full duel.',
    href: '/',
    action: 'Play a game',
  },
  {
    id: 'puzzle',
    name: 'Daily puzzle',
    description: 'Solve the daily puzzle.',
    href: '/puzzle',
    action: 'Try the puzzle',
  },
  {
    id: 'draft',
    name: 'Draft',
    description: 'Complete a Draft or Shared Draft duel.',
    href: '/',
    action: 'Choose a Draft',
  },
  {
    id: 'duplicates',
    name: 'Duplicates',
    description: 'Recycle duplicates or use Trade Up.',
    href: '/collection',
    action: 'Manage duplicates',
  },
  {
    id: 'market',
    name: 'Market',
    description: 'Complete a card exchange.',
    href: '/market',
    action: 'Visit the Market',
  },
] as const;
export type JourneyChapterId = (typeof JOURNEY_CHAPTERS)[number]['id'];
export interface WeeklyView {
  week: string;
  resetAt: string;
  required: number;
  reward: number;
  claimed: boolean;
  completed: number;
  registered: boolean;
  objectives: { id: WeeklyObjectiveId; progress: number }[];
}
export interface SeasonRecord {
  mode: 'ranked' | 'draft' | 'shared-draft';
  rating: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
}
export interface JourneyView {
  weekly: WeeklyView;
  chapters: { id: JourneyChapterId; completed: boolean }[];
  season: typeof CURRENT_SEASON;
  records: SeasonRecord[];
}
