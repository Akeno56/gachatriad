import type { Card, GameState, Player, Rules } from '@gacha-triad/engine';
import type { BattleIdentity, TitleView } from './social';
export type Mode = 'solo' | 'casual' | 'custom' | 'ranked' | 'draft' | 'roulette';
export interface HandCard {
  slotId: string;
  card: Card | null;
}
export interface MatchView {
  players: readonly [BattleIdentity, BattleIdentity];
  prismReward: number;
  id: string;
  mode: Mode;
  version: number;
  status: 'drafting' | 'playing' | 'complete';
  seat: Player;
  names: readonly [string, string];
  game:
    | (Omit<GameState, 'hands' | 'revealed'> & {
        hands: readonly [readonly HandCard[], readonly HandCard[]];
      })
    | null;
  score: readonly [number, number];
  winner: Player | 'draw' | null;
  rules: Rules;
  deadline: number | null;
  endReason: string | null;
  draftPool: Card[];
  draftLocked: boolean;
  draftRevealed: number;
  rematch: { requestedBy: string | null; matchId: string | null; expiresAt: number | null };
  trade: {
    rule: 'none' | 'one';
    pending: boolean;
    canClaim: boolean;
    choices: Card[];
    claimedCard: Card | null;
    expiresAt: number | null;
  };
}
export interface LobbyView {
  allowBots: boolean;
  inviteOnly: boolean;
  hostId: string;
  id: string;
  name: string;
  host: string;
  mode: Mode;
  rules: Rules;
  tradeRule: 'none' | 'one';
  status: 'waiting' | 'playing';
  players: 1 | 2;
  matchId: string | null;
  createdAt: string;
}
export interface ProfileView {
  rankedAcknowledged: boolean;
  titleId: string | null;
  isAdmin: boolean;
  prisms: number;
  unopenedBoosters: number;
  tutorialCompleted: boolean;
  avatarCardId: string | null;
  id: string;
  name: string;
  registered: boolean;
  rating: number;
  draftRating: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  inventory: Record<string, { quantity: number; available: number }>;
  deck: string[];
  activeMatchId: string | null;
  pendingTrade: { matchId: string; canClaim: boolean } | null;
  waitingLobbyId: string | null;
  profiles: { id: string; name: string }[];
}
export const ECONOMY = {
  currency: 'Stellar Prisms',
  packCost: 150,
  winReward: 50,
  drawReward: 25,
  lossReward: 10,
  standardWeights: [50, 27, 17, 5, 1],
  starterWeights: [50, 27, 17, 0, 0],
  guaranteedWeights: [0, 0, 80, 17, 3],
  draftGuaranteedWeights: [0, 0, 0, 85, 15],
  holoPer10000: 50,
  draftHoloPer10000: 500,
  cardPrices: [50, 125, 200, 300, 500],
  recyclePrisms: [5, 10, 20, 40, 75],
} as const;
export interface BoosterView {
  newCardIds: string[];
  id: string;
  source: 'starter' | 'purchase' | 'admin' | 'daily';
  cost: number;
  createdAt: string;
  openedAt: string | null;
  cards: Card[];
}
export interface DuplicateInput {
  cardId: string;
  count: number;
}
export interface DuplicateResult {
  kind: 'recycle' | 'trade-up';
  consumed: number;
  prisms: number;
  card: Card | null;
}
export interface DailyBooster {
  available: boolean;
  resetAt: string;
  packId: string | null;
}
export const ACHIEVEMENTS = [
  {
    id: 'first-duel',
    name: 'Card Player',
    description: 'Complete your first duel.',
    stat: 'played',
    target: 1,
  },
  {
    id: 'first-win',
    name: 'First Victory',
    description: 'Win your first duel.',
    stat: 'wins',
    target: 1,
  },
  {
    id: 'ten-wins',
    name: 'Rising Challenger',
    description: 'Win 10 duels.',
    stat: 'wins',
    target: 10,
  },
  {
    id: 'hundred-wins',
    name: 'Professional Player',
    description: 'Win 100 duels.',
    stat: 'wins',
    target: 100,
  },
  {
    id: 'first-draw',
    name: 'Perfect Balance',
    description: 'Finish a duel at 5–5.',
    stat: 'draws',
    target: 1,
  },
  {
    id: 'same',
    name: 'A Match Made',
    description: 'Capture a card with Same.',
    stat: 'same_captures',
    target: 1,
  },
  {
    id: 'plus',
    name: 'It All Adds Up',
    description: 'Capture a card with Plus.',
    stat: 'plus_captures',
    target: 1,
  },
  {
    id: 'combo',
    name: 'Chain Reaction',
    description: 'Make two Combo captures in one turn.',
    stat: 'best_combo',
    target: 2,
  },
  {
    id: 'perfect',
    name: 'Total Control',
    description: 'Win a completed duel 10–0.',
    stat: 'perfect_wins',
    target: 1,
  },
  {
    id: 'trade-one',
    name: 'Spoils of Victory',
    description: 'Claim a card under Trade One.',
    stat: 'trade_wins',
    target: 1,
  },
  {
    id: 'collector',
    name: 'Card Collector',
    description: 'Own 50 different cards.',
    stat: 'collection',
    target: 50,
  },
] as const;
export interface PlayerProfileView {
  title: string | null;
  titleId: string | null;
  titles: TitleView[];
  id: string;
  name: string;
  isBot: boolean;
  joinedAt: string;
  rating: number;
  draftRating: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  avatar: Card | null;
  collection: { unique: number; copies: number; holo: number };
  achievements: { id: string; name: string; unlockedAt: string }[];
}
export interface AchievementView {
  id: string;
  name: string;
  description: string;
  target: number;
  progress: number;
  unlockedAt: string | null;
}
export interface TradeOfferView {
  id: string;
  ownerId: string;
  owner: string;
  offered: Card;
  wanted: Card;
  createdAt: string;
}
export interface PopulationView {
  difficulty: 'easy' | 'medium' | 'hard';
  available: boolean;
  enabled: boolean;
  bots: number;
  activeGames: number;
}
