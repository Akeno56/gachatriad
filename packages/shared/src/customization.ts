import type { TitleView } from './social';
export const ASTRAL_REWARDS = {
  seasonId: 0,
  frame: {
    id: 'astral',
    name: 'Astral frame',
    games: 5,
    requirement: 'Complete 5 full rated games in Astral.',
  },
  staticFrame: {
    id: 'astral-season',
    name: 'Astral',
    games: 5,
    requirement: 'Complete 5 full rated games in Astral.',
  },
  banner: {
    id: 'astral-crest',
    name: 'Astral Crest',
    games: 15,
    requirement: 'Complete 15 full rated games in Astral for Astral Crest.',
  },
} as const;
export const COSMETIC_SETS = [
  { id: 'slate', name: 'Slate', games: 25 },
  { id: 'ember', name: 'Ember', games: 50 },
  { id: 'jade', name: 'Jade', games: 100 },
  { id: 'eclipse', name: 'Eclipse', games: 200 },
  { id: 'regalia', name: 'Regalia', games: 500 },
] as const;
export const COSMETIC_STYLES = [
  { id: 'classic', name: 'Classic', games: 0 },
  ...COSMETIC_SETS,
  { id: 'astral', name: 'Astral', games: 0 },
] as const;
export type CosmeticStyle = (typeof COSMETIC_STYLES)[number]['id'];
export function availableStyle(style: CosmeticStyle, played: number): CosmeticStyle {
  const choice = COSMETIC_STYLES.find(({ id }) => id === style);
  return choice && played >= choice.games ? style : 'classic';
}
export const PORTRAIT_FRAMES = [
  { id: 'classic', name: 'Classic', games: 0, requirement: 'Available to everyone.' },
  ...COSMETIC_SETS.map((set) => ({ ...set, requirement: `${set.games} rated games` })),
  ASTRAL_REWARDS.staticFrame,
  {
    ...ASTRAL_REWARDS.frame,
    name: 'Astral Premium',
  },
] as const;
export type PortraitFrame = (typeof PORTRAIT_FRAMES)[number]['id'];
export const PROFILE_BANNERS = [...COSMETIC_STYLES, ASTRAL_REWARDS.banner] as const;
export type ProfileBanner = (typeof PROFILE_BANNERS)[number]['id'];
export type FeaturedMode = import('./platform').RatedMode;
export interface ProfileCustomization {
  revision: number;
  bio: string;
  frameId: PortraitFrame;
  bannerId?: ProfileBanner;
  featuredMode: FeaturedMode;
  featuredCards: string[];
  featuredAchievements: string[];
  avatarCardId: string | null;
  titleId: string | null;
}
export interface CustomizationView {
  settings: ProfileCustomization;
  frames: {
    id: PortraitFrame;
    name: string;
    requirement: string;
    unlocked: boolean;
  }[];
  banners?: { id: ProfileBanner; name: string; unlocked: boolean; requirement?: string }[];
  titles: TitleView[];
  achievements: { id: string; name: string; unlockedAt: string }[];
}
export const ACHIEVEMENT_CATEGORIES = [
  { id: 'all', name: 'All achievements', sigil: '✦' },
  { id: 'duels', name: 'Duels', sigil: '⚔' },
  { id: 'techniques', name: 'Techniques', sigil: '＋' },
  { id: 'collection', name: 'Collection', sigil: '▥' },
  { id: 'exchanges', name: 'Exchanges', sigil: '⇄' },
] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number]['id'];
export function achievementCategory(id: string): AchievementCategory {
  return id === 'collector'
    ? 'collection'
    : id === 'trade-one'
      ? 'exchanges'
      : ['same', 'plus', 'combo'].includes(id)
        ? 'techniques'
        : 'duels';
}
