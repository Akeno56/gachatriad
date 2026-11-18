export const CURRENT_SEASON = {
  id: 0,
  name: 'The First Gathering',
  description: 'Every collection starts with a first hand.',
  endAt: null,
} as const;

export const WEEKLY_OBJECTIVES = [
  {
    id: 'duels',
    name: 'Take a seat',
    description: 'Complete three full duels. Practice and bots count; wins are optional.',
    target: 3,
    href: '/',
  },
  {
    id: 'modes',
    name: 'Change tables',
    description: 'Complete full duels in two different modes.',
    target: 2,
    href: '/lobbies',
  },
  {
    id: 'puzzle',
    name: 'Find the winning move',
    description: 'Solve a Daily Triad puzzle.',
    target: 1,
    href: '/puzzle',
  },
  {
    id: 'boosters',
    name: 'Fresh possibilities',
    description: 'Open two non-starter boosters. Free daily boosters count.',
    target: 2,
    href: '/boosters',
  },
  {
    id: 'deck',
    name: 'Prepare your hand',
    description: 'Save a complete, legal named deck this week.',
    target: 1,
    href: '/decks',
  },
  {
    id: 'variant',
    name: 'A different rule',
    description: 'Complete a full custom or roulette duel.',
    target: 1,
    href: '/lobbies',
  },
] as const;
export type WeeklyObjectiveId = (typeof WEEKLY_OBJECTIVES)[number]['id'];
export const WEEKLY_REQUIRED = 3;
export const WEEKLY_REWARD = 150;

export const JOURNEY_CHAPTERS = [
  {
    id: 'learn',
    name: 'Learn the table',
    description: 'Finish the introductory tutorial.',
    href: '/',
    action: 'How to play',
  },
  {
    id: 'booster',
    name: 'Your first collection',
    description: 'Open a booster and discover your cards.',
    href: '/boosters',
    action: 'Open boosters',
  },
  {
    id: 'deck',
    name: 'A hand of your own',
    description: 'Save a complete, legal named deck.',
    href: '/decks',
    action: 'Build a deck',
  },
  {
    id: 'duel',
    name: 'Across the table',
    description: 'Complete a full duel in any mode.',
    href: '/',
    action: 'Play a game',
  },
  {
    id: 'puzzle',
    name: 'Read the position',
    description: 'Solve a Daily Triad puzzle.',
    href: '/puzzle',
    action: 'Try the puzzle',
  },
  {
    id: 'draft',
    name: 'Make every pick count',
    description: 'Complete a full Draft or Shared Draft duel.',
    href: '/',
    action: 'Choose a Draft',
  },
  {
    id: 'duplicates',
    name: 'New life for duplicates',
    description: 'Recycle spare copies or use Trade Up.',
    href: '/collection',
    action: 'Manage duplicates',
  },
  {
    id: 'market',
    name: 'A fair exchange',
    description: 'Complete a card exchange in the Market.',
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
