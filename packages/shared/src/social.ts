import type { Card } from '@gacha-triad/engine';
export interface TitleView {
  id: string;
  name: string;
  requirement: string;
  unlocked: boolean;
}
export const TITLES = [
  {
    id: 'ranked-top-ten',
    name: 'Ranked Top 10',
    rank: 10,
    requirement: 'Reach the human Ranked top 10 after at least 5 ranked duels.',
  },
  {
    id: 'ranked-podium',
    name: 'Ranked Top 3',
    rank: 3,
    requirement: 'Reach the human Ranked top 3 after at least 5 ranked duels.',
  },
  {
    id: 'ranked-champion',
    name: 'Ranked Champion',
    rank: 1,
    requirement: 'Reach first place on the human Ranked ladder after at least 5 ranked duels.',
  },
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
  channel: ChatChannel;
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
  onlinePlayers: BattleIdentity[];
  friends: FriendView[];
  invitations: DuelInvitation[];
  chat: ChatMessage[];
  conversations: FriendConversation[];
}
export const CHAT_CHANNELS = ['general', 'trade', 'lobbies'] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];
export interface FriendMessage {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
}
export interface FriendConversation {
  playerId: string;
  lastMessage: string;
  lastAt: string;
  unread: number;
}
export interface LadderEntry extends BattleIdentity {
  id: string;
  rank: number;
  rating: number;
  games: number;
  wins: number;
  draws: number;
}
