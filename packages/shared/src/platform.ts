import type { Card, GameState, Player, Rules, CpuStyle } from '@gacha-triad/engine';
import type { BattleIdentity, TitleView } from './social';
import {
  COSMETIC_SETS,
  type CosmeticSetId,
  type PortraitFrame,
  type FeaturedMode,
  type ProfileBanner,
} from './customization';
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
export const LOBBY_EVENT_GOALS = [
  'play-one',
  'win-one',
  'most-played',
  'most-wins',
  'most-losses',
] as const;
export type LobbyEventGoal = (typeof LOBBY_EVENT_GOALS)[number];
export type LobbyEventReward =
  { kind: 'prisms' | 'boosters'; amount: number } | { kind: 'title'; name: string };
export interface LobbyEventPrize {
  goal: LobbyEventGoal;
  reward: LobbyEventReward;
}
export interface LobbyEvent extends LobbyPreset {
  startsAt: number;
  endsAt: number;
  prizes: LobbyEventPrize[];
  locked: boolean;
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
export interface BoardMoveUpdate {
  matchId: string;
  version: number;
}
export type SiteArea =
  | 'profile'
  | 'identity'
  | 'social'
  | 'market'
  | 'boosters'
  | 'daily-booster'
  | 'wishlist'
  | 'replays'
  | 'decks'
  | 'lobbies'
  | 'lobby-events'
  | 'ladder';
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
  lobbyEventId?: string | null;
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
  ratedCosmeticGames?: number;
  unlockedCosmeticSets?: CosmeticSetId[];
  achievementGrantsEnabled?: boolean;
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
  winReward: 25,
  drawReward: 13,
  lossReward: 5,
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
  source: 'starter' | 'purchase' | 'admin' | 'daily' | 'achievement';
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
export const ACHIEVEMENT_CATEGORIES = [
  { id: 'all', name: 'All achievements' },
  { id: 'duels', name: 'Duels' },
  { id: 'milestones', name: 'Rated milestones' },
  { id: 'techniques', name: 'Techniques' },
  { id: 'collection', name: 'Collection' },
  { id: 'exchanges', name: 'Exchanges' },
  { id: 'puzzles', name: 'Puzzles' },
] as const;
type AchievementCategory = Exclude<(typeof ACHIEVEMENT_CATEGORIES)[number]['id'], 'all'>;
export type AchievementReward =
  | { kind: 'title'; id: string; name: string }
  | { kind: 'prisms'; amount: number }
  | { kind: 'booster' }
  | { kind: 'cosmetic-set'; id: CosmeticSetId; name: string };

export const ACHIEVEMENTS = [
  {
    id: 'first-duel',
    name: 'Card Player',
    description: 'Complete your first duel.',
    category: 'duels',
    stat: 'played',
    target: 1,
    reward: { kind: 'title', id: 'card-player', name: 'Card Player' },
  },
  {
    id: 'first-win',
    name: 'First Victory',
    description: 'Win your first duel.',
    category: 'duels',
    stat: 'wins',
    target: 1,
    reward: { kind: 'title', id: 'challenger', name: 'Challenger' },
  },
  {
    id: 'ten-wins',
    name: 'Rising Challenger',
    description: 'Win 10 duels.',
    category: 'duels',
    stat: 'wins',
    target: 10,
    reward: { kind: 'title', id: 'rising-challenger', name: 'Rising Challenger' },
  },
  {
    id: 'hundred-wins',
    name: 'Professional Player',
    description: 'Win 100 duels.',
    category: 'duels',
    stat: 'wins',
    target: 100,
    reward: { kind: 'title', id: 'professional', name: 'Professional Player' },
  },
  {
    id: 'first-draw',
    name: 'Perfect Balance',
    description: 'Finish a duel at 5–5.',
    category: 'duels',
    stat: 'draws',
    target: 1,
    reward: { kind: 'prisms', amount: 50 },
  },
  {
    id: 'perfect',
    name: 'Total Control',
    description: 'Win a completed duel 10–0.',
    category: 'duels',
    stat: 'perfect_wins',
    target: 1,
    reward: { kind: 'booster' },
  },
  {
    id: 'random-debut',
    name: 'Luck of the Draw',
    description: 'Finish a full rated Ranked Random match.',
    category: 'duels',
    stat: 'ranked_random_finishes',
    target: 1,
    reward: { kind: 'prisms', amount: 75 },
  },
  {
    id: 'draft-debut',
    name: 'Fresh Picks',
    description: 'Finish a full rated Draft match.',
    category: 'duels',
    stat: 'draft_finishes',
    target: 1,
    reward: { kind: 'booster' },
  },
  {
    id: 'shared-draft-debut',
    name: 'Pick and Deny',
    description: 'Finish a full rated Shared Draft match.',
    category: 'duels',
    stat: 'shared_draft_finishes',
    target: 1,
    reward: { kind: 'booster' },
  },
  {
    id: 'correspondence-debut',
    name: 'The Long Game',
    description: 'Finish a full correspondence match.',
    category: 'duels',
    stat: 'correspondence_finishes',
    target: 1,
    reward: { kind: 'title', id: 'patient-tactician', name: 'Patient Tactician' },
  },
  {
    id: 'same',
    name: 'A Match Made',
    description: 'Capture a card with Same.',
    category: 'techniques',
    stat: 'same_captures',
    target: 1,
    reward: { kind: 'prisms', amount: 50 },
  },
  {
    id: 'plus',
    name: 'It All Adds Up',
    description: 'Capture a card with Plus.',
    category: 'techniques',
    stat: 'plus_captures',
    target: 1,
    reward: { kind: 'prisms', amount: 50 },
  },
  {
    id: 'combo',
    name: 'Chain Reaction',
    description: 'Make two Combo captures in one turn.',
    category: 'techniques',
    stat: 'best_combo',
    target: 2,
    reward: { kind: 'title', id: 'chain-reaction', name: 'Chain Reaction' },
  },
  {
    id: 'plus-25',
    name: 'Sum Total',
    description: 'Capture 25 cards with Plus.',
    category: 'techniques',
    stat: 'plus_captures',
    target: 25,
    reward: { kind: 'prisms', amount: 150 },
  },
  {
    id: 'combo-20',
    name: 'Domino Effect',
    description: 'Capture 20 cards through Combo.',
    category: 'techniques',
    stat: 'combo_captures',
    target: 20,
    reward: { kind: 'booster' },
  },
  {
    id: 'collector',
    name: 'Card Collector',
    description: 'Own 50 different cards.',
    category: 'collection',
    stat: 'collection',
    target: 50,
    reward: { kind: 'title', id: 'collector', name: 'Card Collector' },
  },
  {
    id: 'collector-150',
    name: 'Card Cabinet',
    description: 'Own 150 different cards.',
    category: 'collection',
    stat: 'collection',
    target: 150,
    reward: { kind: 'prisms', amount: 250 },
  },
  {
    id: 'collector-300',
    name: 'Grand Archive',
    description: 'Own 300 different cards.',
    category: 'collection',
    stat: 'collection',
    target: 300,
    reward: { kind: 'title', id: 'archivist', name: 'Archivist' },
  },
  {
    id: 'holo-5',
    name: 'Prismatic',
    description: 'Own 5 different Holo cards.',
    category: 'collection',
    stat: 'holos',
    target: 5,
    reward: { kind: 'booster' },
  },
  {
    id: 'boosters-10',
    name: 'Pack Routine',
    description: 'Open 10 non-starter boosters.',
    category: 'collection',
    stat: 'boosters',
    target: 10,
    reward: { kind: 'prisms', amount: 150 },
  },
  {
    id: 'trade-one',
    name: 'Spoils of Victory',
    description: 'Claim a card under Trade One.',
    category: 'exchanges',
    stat: 'trade_wins',
    target: 1,
    reward: { kind: 'prisms', amount: 75 },
  },
  {
    id: 'market-swap',
    name: 'Fair Exchange',
    description: 'Complete a card-for-card trade on the Market.',
    category: 'exchanges',
    stat: 'card_swaps',
    target: 1,
    reward: { kind: 'prisms', amount: 100 },
  },
  {
    id: 'trade-up-first',
    name: 'Upgraded',
    description: 'Complete a Trade Up.',
    category: 'exchanges',
    stat: 'trade_ups',
    target: 1,
    reward: { kind: 'booster' },
  },
  {
    id: 'puzzle-first',
    name: 'Puzzle Solver',
    description: 'Solve a Daily Triad puzzle.',
    category: 'puzzles',
    stat: 'puzzle_solves',
    target: 1,
    reward: { kind: 'prisms', amount: 75 },
  },
  {
    id: 'puzzle-10',
    name: 'Ten Solutions',
    description: 'Solve Daily Triad puzzles on 10 different days.',
    category: 'puzzles',
    stat: 'puzzle_solves',
    target: 10,
    reward: { kind: 'title', id: 'puzzle-specialist', name: 'Puzzle Specialist' },
  },
  ...COSMETIC_SETS.map(({ id, achievementId, achievementName, name, games }) => ({
    id: achievementId,
    name: achievementName,
    description: `Complete ${games} rated games.`,
    category: 'milestones' as const,
    stat: 'rated_cosmetic_games' as const,
    target: games,
    reward: { kind: 'cosmetic-set' as const, id, name },
  })),
] as const satisfies readonly {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  stat: string;
  target: number;
  reward: AchievementReward;
}[];

export type AchievementStat = (typeof ACHIEVEMENTS)[number]['stat'];

export function achievementCategory(id: string): AchievementCategory {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id)?.category ?? 'duels';
}
export interface PlayerProfileView {
  bio: string;
  frameId: PortraitFrame;
  bannerId?: ProfileBanner;
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
  reward?: AchievementReward;
  rewardClaimed?: boolean;
}
export type PlayerMiniProfile = Pick<
  PlayerProfileView,
  | 'id'
  | 'name'
  | 'isBot'
  | 'avatar'
  | 'frameId'
  | 'bannerId'
  | 'title'
  | 'rating'
  | 'rankedRandomRating'
  | 'draftRating'
  | 'sharedDraftRating'
>;
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
