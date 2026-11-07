import type { Card } from '@gacha-triad/engine';
export interface TitleView {
  id: string;
  name: string;
  requirement: string;
  unlocked: boolean;
}
export const TITLES = [
  {
    id: 'card-player',
    name: 'Card Player',
    achievement: 'first-duel',
    requirement: 'Complete your first duel.',
  },
  {
    id: 'challenger',
    name: 'Challenger',
    achievement: 'first-win',
    requirement: 'Win your first duel.',
  },
  {
    id: 'rising-challenger',
    name: 'Rising Challenger',
    achievement: 'ten-wins',
    requirement: 'Win 10 duels.',
  },
  {
    id: 'professional',
    name: 'Professional Player',
    achievement: 'hundred-wins',
    requirement: 'Win 100 duels.',
  },
  {
    id: 'chain-reaction',
    name: 'Chain Reaction',
    achievement: 'combo',
    requirement: 'Make two Combo captures in one turn.',
  },
  {
    id: 'collector',
    name: 'Card Collector',
    achievement: 'collector',
    requirement: 'Collect 50 characters.',
  },
  {
    id: 'silver-tactician',
    name: 'Silver Tactician',
    rating: 1200,
    requirement: 'Reach 1200 constructed rating after 5 ranked duels.',
  },
  {
    id: 'gold-strategist',
    name: 'Gold Strategist',
    rating: 1400,
    requirement: 'Reach 1400 constructed rating after 5 ranked duels.',
  },
  {
    id: 'triad-master',
    name: 'Triad Master',
    rating: 1600,
    requirement: 'Reach 1600 constructed rating after 5 ranked duels.',
  },
] as const;
export interface BattleIdentity {
  id: string | null;
  name: string;
  title: string | null;
  avatar: Card | null;
}
export interface FriendView extends BattleIdentity {
  id: string;
  status: 'incoming' | 'outgoing' | 'friend';
  online: boolean;
}
export interface ChatMessage extends BattleIdentity {
  id: string;
  playerId: string;
  body: string;
  createdAt: string;
}
export interface DuelInvitation {
  id: string;
  sender: BattleIdentity;
  recipient: BattleIdentity;
  lobbyId: string;
  expiresAt: string;
}
export interface SocialView {
  friends: FriendView[];
  invitations: DuelInvitation[];
  chat: ChatMessage[];
}
export interface LadderEntry extends BattleIdentity {
  id: string;
  rank: number;
  rating: number;
  games: number;
  wins: number;
  draws: number;
}
