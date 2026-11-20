import type { Card, GameState, Player, Rules, CpuStyle } from '@gacha-triad/engine';
import type { BattleIdentity, TitleView } from './social';
import type { PortraitFrame, FeaturedMode } from './customization';
export const RATED_MODES = ['ranked', 'ranked-random', 'draft', 'shared-draft'] as const;
export type RatedMode = (typeof RATED_MODES)[number];
export type Mode = 'solo' | 'casual' | 'custom' | RatedMode | 'roulette' | 'correspondence';
export const CORRESPONDENCE_HOURS = [24, 48, 72] as const;
export type CorrespondenceHours = (typeof CORRESPONDENCE_HOURS)[number];
export interface CorrespondenceMatch {
  id: string;
  opponent: string;
  yourTurn: boolean;
  deadline: number | null;
  outcome: 'win' | 'loss' | 'draw' | null;
}
export interface LobbyPreset {
  id: string;
  name: string;
  rules: Rules;
  tradeRule: 'one' | 'none';
  allowBots: boolean;
}
export const isDraftMode = (mode: string) => mode === 'draft' || mode === 'shared-draft';
export const isRatedMode = (mode: string): mode is RatedMode =>
  (RATED_MODES as readonly string[]).includes(mode);
export const isRankedMode = (mode: string) => mode === 'ranked' || mode === 'ranked-random';
const ratingFields = {
  ranked: 'rating',
  'ranked-random': 'ranked_random_rating',
  draft: 'draft_rating',
  'shared-draft': 'shared_draft_rating',
} as const;
export const modeRatingField = (mode: string) =>
  isRatedMode(mode) ? ratingFields[mode] : 'rating';
export interface HandCard {
  slotId: string;
  card: Card | null;
}
export interface MatchView {
  cpuStyle?: CpuStyle;
  sharedDraft?: {
    first: Player;
    turn: Player | null;
    picks: readonly [readonly Card[], readonly Card[]];
    available: readonly string[];
    legal: readonly string[];
    ready: readonly [boolean, boolean];
  };
  spectator?: boolean;
  spectatorResult?: {
    season: number;
    decks: readonly [readonly Card[], readonly Card[]];
    ratings: readonly [
      { before: number; after: number; delta: number } | null,
      { before: number; after: number; delta: number } | null,
    ];
  } | null;
  missedTurns?: readonly [number, number];
  chatAvailable: boolean;
  ratingApplies: boolean;
  ratedResult?: {
    season: number;
    rating: number;
    delta: number | null;
    wins: number;
    losses: number;
    draws: number;
  } | null;
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
  turnHours?: CorrespondenceHours;
  endReason: string | null;
  draftPool: Card[];
  draftLocked: boolean;
  draftRevealed: number;
  rematch: {
    requestedBy: string | null;
    matchId: string | null;
    expiresAt: number | null;
    unavailableReason?: string | null;
  };
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
  botStyle?: CpuStyle | null;
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
  frameId?: PortraitFrame;
  profileRevision?: number;
  activeLoadoutId?: string | null;
  rankedAcknowledged: boolean;
  titleId: string | null;
  isAdmin: boolean;
  prisms: number;
  unopenedBoosters: number;
  starterBoosters: number;
  tutorialCompleted: boolean;
  avatarCardId: string | null;
  id: string;
  name: string;
  registered: boolean;
  rating: number;
  rankedRandomRating: number;
  draftRating: number;
  sharedDraftRating: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  inventory: Record<string, { quantity: number; available: number }>;
  deck: string[];
  activeMatchId: string | null;
  pendingTrade: { matchId: string; canClaim: boolean } | null;
  waitingLobbyId: string | null;
  waitingLobby: {
    id: string;
    mode: Mode;
    createdAt: string;
    invited: boolean;
    allowBots?: boolean;
  } | null;
  profiles: { id: string; name: string }[];
}
export interface DeckLoadout {
  id: string;
  name: string;
  cards: string[];
  revision: number;
  updatedAt: string;
}
export interface DeckLoadoutsView {
  loadouts: DeckLoadout[];
  activeId: string | null;
  limit: number;
}
export const ECONOMY = {
  currency: 'Stellar Prisms',
  packCost: 150,
  winReward: 50,
  drawReward: 25,
  lossReward: 10,
  standardWeights: [50, 27, 17, 5, 1],
  starterWeights: [50, 35, 10, 5, 0],
  starterGuaranteedWeights: [0, 0, 2, 1, 0],
  starterHoloPer10000: 100,
  guaranteedWeights: [0, 0, 80, 17, 3],
  draftGuaranteedWeights: [0, 0, 0, 85, 15],
  holoPer10000: 50,
  draftHoloPer10000: 500,
  cardPrices: [100, 200, 500, 1000, 2500],
  recyclePrisms: [5, 10, 20, 40, 75],
} as const;
export const BOOSTER_TYPES = [
  {
    id: 'starter',
    name: 'Starter Booster',
    artwork: null,
    universes: ['genshin', 'star-rail', 'zenless', 'wuthering-waves'],
    color: '#d8bd7e',
  },
  {
    id: 'standard',
    name: 'Gacha Universe I Booster',
    artwork: '/assets/ui/gacha-universe-i.webp',
    universes: ['genshin', 'star-rail', 'zenless', 'wuthering-waves'],
    color: '#b6bfdc',
  },
  {
    id: 'universe-ii',
    name: 'Gacha Universe II Booster',
    artwork: '/assets/ui/gacha-universe-ii.webp',
    universes: ['epic-seven', 'star-savior', 'nte', 'endfield'],
    color: '#c7afd6',
  },
] as const;
export type BoosterType = (typeof BOOSTER_TYPES)[number]['id'];
export interface BoosterView {
  type: BoosterType;
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
  cards?: Card[];
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
  bio: string;
  frameId: PortraitFrame;
  featuredMode: FeaturedMode;
  featuredCards: Card[];
  featuredAchievements: { id: string; name: string; unlockedAt: string }[];
  botStyle?: CpuStyle | null;
  title: string | null;
  titleId: string | null;
  titles: TitleView[];
  id: string;
  name: string;
  isBot: boolean;
  joinedAt: string;
  rating: number;
  rankedRandomRating: number;
  draftRating: number;
  sharedDraftRating: number;
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
  wanted: Card | null;
  price: number | null;
  createdAt: string;
}
export interface WishlistEntry {
  cardId: string;
  listings: number;
  requestId: string | null;
}
export interface MarketRequestView {
  id: string;
  requesterId: string;
  requester: string;
  cardId: string;
  createdAt: string;
  responses: TradeOfferView[];
}
export type BotMix = { easy: number; medium: number; hard: number };
export interface PopulationView {
  mix: BotMix;
  counts: BotMix;
  difficulty: 'easy' | 'medium' | 'hard';
  available: boolean;
  enabled: boolean;
  bots: number;
  activeGames: number;
}
