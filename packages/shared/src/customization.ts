import type { TitleView } from './social';
export const PORTRAIT_FRAMES = [
  { id: 'classic', name: 'Classic', achievementId: null, requirement: 'Available to everyone.' },
  {
    id: 'silver',
    name: 'Silver',
    achievementId: 'first-duel',
    requirement: 'Complete your first duel.',
  },
  { id: 'azure', name: 'Azure', achievementId: 'first-win', requirement: 'Win your first duel.' },
  {
    id: 'verdant',
    name: 'Verdant',
    achievementId: 'collector',
    requirement: 'Own 50 different cards.',
  },
  {
    id: 'amethyst',
    name: 'Amethyst',
    achievementId: 'combo',
    requirement: 'Make two Combo captures in one turn.',
  },
  { id: 'gold', name: 'Gold', achievementId: 'hundred-wins', requirement: 'Win 100 duels.' },
] as const;
export type PortraitFrame = (typeof PORTRAIT_FRAMES)[number]['id'];
export type FeaturedMode = import('./platform').RatedMode;
export interface ProfileCustomization {
  revision: number;
  bio: string;
  frameId: PortraitFrame;
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
    achievementId: string | null;
    requirement: string;
    unlocked: boolean;
  }[];
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
