import { randomUUID, randomInt, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  applyMove,
  chooseCpuMove,
  CPU_STYLES,
  cpuView,
  createGame,
  isRevealed,
  legalMoves,
  randomDeck,
  buildBestDeck,
  scores,
  seededRandom,
  shuffle,
  STANDARD,
  RANKED_RULES,
  RANKED_RANDOM_RULES,
  UNRANKED_RULES,
  supportsTradeOne,
  validateDeck,
  validateMove,
  winner,
  type Card,
  type GameState,
  type Player,
  type Rules,
  type CpuStyle,
} from '@gacha-triad/engine';
import { CARDS, ALL_CARDS } from '@gacha-triad/shared';
import {
  ACHIEVEMENTS,
  ECONOMY,
  RATED_MODES,
  isDraftMode,
  isRankedMode,
  isRatedMode,
  modeRatingField,
  type AchievementView,
  type CorrespondenceHours,
  type CorrespondenceMatch,
  type LobbyView,
  type MatchView,
  type Mode,
  type ProfileView,
  type PlayerProfileView,
} from '@gacha-triad/shared/platform';
import { Database, type Sql } from './database';
import { GameError } from './errors';
export { GameError } from './errors';
import { Economy } from './economy';
import { draftPool } from './draft-packs';
import { draftTurn, legalDraftCards, type SharedDraft } from './shared-draft';
import { pruneDeck } from './inventory';
import { titleName, titlesFor, awardRankTitles } from './titles';
import { archiveReplay } from './replays';
import type { PortraitFrame, FeaturedMode, ProfileBanner } from '@gacha-triad/shared/customization';
export interface Actor {
  id: string;
  name: string;
  isAnonymous?: boolean | null;
}
export type ProfileIdentity = Pick<
  ProfileView,
  | 'id'
  | 'name'
  | 'registered'
  | 'isAdmin'
  | 'rating'
  | 'rankedRandomRating'
  | 'draftRating'
  | 'sharedDraftRating'
>;
interface ProfileRow {
  id: string;
  name: string;
  rating: number;
  ranked_random_rating: number;
  draft_rating: number;
  shared_draft_rating: number;
  wins: number;
  losses: number;
  draws: number;
  played: number;
  rated_cosmetic_games: number;
  default_deck: string[];
  [key: string]: unknown;
}
interface MatchRow {
  cpu_style: CpuStyle;
  shared_draft: SharedDraft | null;
  season: number;
  disconnected_at: [number | null, number | null];
  activity_at: [number, number];
  id: string;
  mode: Mode;
  player0: string;
  player1: string | null;
  difficulty: 'easy' | 'normal' | null;
  state: GameState | null;
  decks: [string[], string[]];
  pools: [string[], string[]] | null;
  rules: Rules;
  trade_rule: 'none' | 'one';
  status: 'drafting' | 'playing' | 'complete';
  winner: Player | null;
  is_draw: boolean;
  version: number;
  deadline: string | number | null;
  turn_hours: CorrespondenceHours | null;
  auto_turns: [number, number];
  claim_deadline: string | number | null;
  claimed_card: string | null;
  settlement_done: boolean;
  end_reason: string | null;
  draft_revealed: [number, number];
  rematch_requested_by: string | null;
  rematch_requested_at: Date | null;
  rematch_match_id: string | null;
  unrated_rematch: boolean;
  departed: string[];
}
interface LobbyRow {
  allow_bots: boolean;
  invited_profile: string | null;
  spectatable: boolean;
  id: string;
  host_id: string;
  guest_id: string | null;
  mode: Mode;
  name: string;
  rules: Rules;
  trade_rule: 'none' | 'one';
  status: 'waiting' | 'playing' | 'closed';
  match_id: string | null;
  created_at: Date;
}
const rng = () => seededRandom(randomInt(0, 2 ** 32));
const byId = new Map(ALL_CARDS.map((c) => [c.id, c]));
const cards = (ids: readonly string[]) =>
  ids.map((id) => {
    const card = byId.get(id);
    if (!card) throw new GameError('Unknown card definition.');
    return card;
  });
export const UNRANKED = UNRANKED_RULES;
export const RANKED = RANKED_RULES;
export function cleanRules(input: unknown): Rules {
  if (!input || typeof input !== 'object') return UNRANKED;
  const r = input as Record<string, unknown>;
  const rules: Rules = {
    allOpen: r.allOpen === true,
    threeOpen: r.threeOpen === true,
    same: r.same === true,
    plus: r.plus === true,
    combo: r.combo === true,
    random: r.random === true,
    elemental: r.elemental === true,
  };
  if (rules.allOpen && rules.threeOpen)
    throw new GameError('Choose either All Open or Three Open.');
  if (rules.combo && !rules.same && !rules.plus)
    throw new GameError('Combo requires Same or Plus.');
  return rules;
}
function roulette(): Rules {
  const random = rng();
  const visibility = random();
  return {
    ...STANDARD,
    allOpen: visibility < 0.34,
    threeOpen: visibility >= 0.34 && visibility < 0.67,
    same: random() < 0.5,
    plus: random() < 0.5,
    combo: true,
    random: random() < 0.35,
    elemental: random() < 0.35,
  };
}
export class GameStore {
  isOnline: ((profileId: string) => boolean) | null = null;
  readonly economy: Economy;
  constructor(
    readonly db: Database,
    readonly redactionSecret: string,
  ) {
    this.economy = new Economy(db);
  }
  async migrate(root: string) {
    for (const file of [
      '001_platform.sql',
      '002_local_population.sql',
      '003_profile.sql',
      '004_tutorial.sql',
      '005_economy_admin.sql',
      '006_social_lifecycle.sql',
      '007_friend_messages.sql',
      '008_booster_batches.sql',
      '009_duplicate_cards_daily.sql',
      '010_ranked_titles.sql',
      '011_chat_channels.sql',
      '012_draft_shop_rematches.sql',
      '013_booster_types_departures.sql',
      '014_activity_chat_moderation.sql',
      '015_spectator_privacy.sql',
      '016_account_networks.sql',
      '017_market_season.sql',
      '018_playtest_feedback.sql',
      '019_shared_draft_daily_puzzle.sql',
      '020_deck_loadouts.sql',
      '021_player_journey.sql',
      '022_replays_bot_styles.sql',
      '023_profile_customization.sql',
      '024_ranked_random.sql',
      '025_correspondence.sql',
      '026_collection_choices.sql',
      '027_profile_banners.sql',
      '028_battle_stamps.sql',
      '029_astral_cosmetics.sql',
      '030_ember_frame.sql',
      '031_cosmetic_milestones.sql',
    ])
      await this.db.exec(await readFile(resolve(root, 'apps/server/migrations', file), 'utf8'));
    await this.db.read((sql) =>
      sql(
        "INSERT INTO card_definitions(id,definition) SELECT entry->>'id',entry FROM jsonb_array_elements($1::jsonb) entry ON CONFLICT(id) DO UPDATE SET definition=excluded.definition",
        [JSON.stringify(ALL_CARDS)],
      ),
    );
    await this.db.read((sql) =>
      sql(
        "UPDATE lobbies SET status='closed' WHERE status='waiting' AND trade_rule='one' AND (rules->>'allOpen'='true' OR rules->>'threeOpen'='true' OR rules->>'same' IS DISTINCT FROM 'true' OR rules->>'plus' IS DISTINCT FROM 'true' OR rules->>'combo' IS DISTINCT FROM 'true')",
      ),
    );
    await this.db.read(awardRankTitles);
  }
  /** Authorize routine API reads without loading inventory, packs, deck or match history. */
  async identity(actor: Actor, requested?: string): Promise<ProfileIdentity> {
    const row = await this.db.read(async (sql) => {
      const [p] = await sql<{
        id: string;
        name: string;
        rating: number;
        ranked_random_rating: number;
        draft_rating: number;
        shared_draft_rating: number;
        last_seen_at: Date;
        suspended: boolean;
        admin: boolean;
      }>(
        `SELECT p.id,p.name,p.rating,p.ranked_random_rating,p.draft_rating,p.shared_draft_rating,p.last_seen_at,
        EXISTS(SELECT 1 FROM server_suspensions s WHERE s.auth_user_id=$1) AS suspended,
        EXISTS(SELECT 1 FROM server_admins a WHERE a.auth_user_id=$1) AS admin
        FROM profiles p JOIN profile_accounts a ON a.profile_id=p.id
        WHERE a.auth_user_id=$1 AND a.is_primary ${requested ? 'AND p.id=$2' : ''} LIMIT 1`,
        requested ? [actor.id, requested] : [actor.id],
      );
      if (!p) return null;
      if (p.suspended)
        throw new GameError('This account is suspended. Contact the server host.', 403);
      if (actor.isAnonymous && Date.now() - new Date(p.last_seen_at).getTime() > 7 * 86400000)
        throw new GameError(
          'Your unused guest account has expired. Start a new guest session.',
          401,
        );
      await sql(
        "UPDATE profiles SET last_seen_at=now() WHERE id=$1 AND last_seen_at<now()-interval '1 minute'",
        [p.id],
      );
      return {
        id: p.id,
        name: p.name,
        registered: !actor.isAnonymous,
        isAdmin: !actor.isAnonymous && p.admin,
        rating: p.rating,
        rankedRandomRating: p.ranked_random_rating,
        draftRating: p.draft_rating,
        sharedDraftRating: p.shared_draft_rating,
      };
    });
    // Creation and invalid-profile checks use the same path as /api/profile, outside the lease.
    return row ?? this.profile(actor, requested);
  }
  async profile(actor: Actor, requested?: string): Promise<ProfileView> {
    const result = await this.db.tx(async (sql) => {
      if ((await sql('SELECT 1 FROM server_suspensions WHERE auth_user_id=$1', [actor.id])).length)
        throw new GameError('This account is suspended. Contact the server host.', 403);
      let rows = await sql<ProfileRow>(
        `SELECT p.* FROM profiles p JOIN profile_accounts a ON a.profile_id=p.id WHERE a.auth_user_id=$1 AND a.is_primary ${requested ? 'AND p.id=$2' : ''} ORDER BY p.created_at LIMIT 1`,
        requested ? [actor.id, requested] : [actor.id],
      );
      if (!rows.length && requested) throw new GameError('You do not own that profile.', 403);
      if (!rows.length) {
        const id = randomUUID();
        await sql(
          'INSERT INTO profiles(id,name,default_deck,starter_granted) VALUES($1,$2,$3::jsonb,true)',
          [id, actor.name, '[]'],
        );
        await sql(
          'INSERT INTO profile_accounts(user_key,profile_id,auth_user_id,is_primary) VALUES($1,$2,$1,true)',
          [actor.id, id],
        );
        await this.economy.grantStarter(sql, id);
        rows = await sql<ProfileRow>('SELECT * FROM profiles WHERE id=$1', [id]);
      }
      const p = rows[0];
      if (
        actor.isAnonymous &&
        Date.now() - new Date(p.last_seen_at as Date).getTime() > 7 * 86400000
      )
        throw new GameError(
          'Your unused guest account has expired. Start a new guest session.',
          401,
        );
      await sql(
        "UPDATE profiles SET last_seen_at=now() WHERE id=$1 AND last_seen_at<now()-interval '1 minute'",
        [p.id],
      );
      const pruned = await pruneDeck(sql, p.id);
      if (pruned) {
        p.default_deck = pruned.default_deck;
        p.avatar_card = pruned.avatar_card;
        p.active_loadout_id = pruned.active_loadout_id;
        p.profile_revision = pruned.profile_revision;
      }
      const owned = await sql<{ card_id: string; quantity: number; reserved: number }>(
        'SELECT * FROM inventory WHERE profile_id=$1 AND quantity>0',
        [p.id],
      );
      const active = await sql<{ id: string }>(
        "SELECT id FROM matches WHERE (player0=$1 OR player1=$1) AND mode<>'correspondence' AND status IN('playing','drafting') ORDER BY created_at DESC LIMIT 1",
        [p.id],
      );
      const [pendingTrade] = await sql<{ id: string; winner: number; player0: string }>(
        "SELECT id,winner,player0 FROM matches WHERE (player0=$1 OR player1=$1) AND status='complete' AND settlement_done=false ORDER BY completed_at LIMIT 1",
        [p.id],
      );
      const waiting = await sql<{
        id: string;
        mode: Mode;
        created_at: Date;
        invited_profile: string | null;
        allow_bots: boolean;
      }>(
        "SELECT id,mode,created_at,invited_profile,allow_bots FROM lobbies WHERE host_id=$1 AND status='waiting'",
        [p.id],
      );
      const profiles = await sql<{ id: string; name: string }>(
        'SELECT p.id,p.name FROM profiles p JOIN profile_accounts a ON a.profile_id=p.id WHERE a.auth_user_id=$1 AND a.is_primary',
        [actor.id],
      );
      const [account] = await sql<{ unopened: number; starter: number; admin: boolean }>(
        `SELECT count(*)::int AS unopened,
                count(*) FILTER (WHERE pack_type='starter')::int AS starter,
                NOT $3::boolean AND EXISTS(SELECT 1 FROM server_admins WHERE auth_user_id=$2) AS admin
         FROM booster_packs WHERE profile_id=$1 AND opened_at IS NULL`,
        [p.id, actor.id, !!actor.isAnonymous],
      );
      return {
        rankedAcknowledged: p.ranked_acknowledged === true,
        frameId: (p.portrait_frame as PortraitFrame) ?? 'classic',
        profileRevision: Number(p.profile_revision ?? 0),
        titleId: typeof p.selected_title === 'string' ? p.selected_title : null,
        isAdmin: account.admin,
        prisms: Number(p.prisms ?? 0),
        unopenedBoosters: account.unopened,
        id: p.id,
        avatarCardId: typeof p.avatar_card === 'string' ? p.avatar_card : null,
        tutorialCompleted: p.tutorial_completed === true,
        name: p.name,
        registered: !actor.isAnonymous,
        rating: p.rating,
        rankedRandomRating: p.ranked_random_rating,
        draftRating: p.draft_rating,
        sharedDraftRating: p.shared_draft_rating,
        played: p.played,
        ratedCosmeticGames: p.rated_cosmetic_games,
        wins: p.wins,
        losses: p.losses,
        draws: p.draws,
        inventory: Object.fromEntries(
          owned.map((c) => [
            c.card_id,
            { quantity: c.quantity, available: c.quantity - c.reserved },
          ]),
        ),
        deck: p.default_deck,
        activeLoadoutId: typeof p.active_loadout_id === 'string' ? p.active_loadout_id : null,
        activeMatchId: active[0]?.id ?? null,
        pendingTrade: pendingTrade
          ? {
              matchId: pendingTrade.id,
              canClaim:
                pendingTrade.winner === 0
                  ? pendingTrade.player0 === p.id
                  : pendingTrade.player0 !== p.id,
            }
          : null,
        waitingLobbyId: waiting[0]?.id ?? null,
        starterBoosters: account.starter,
        waitingLobby: waiting[0]
          ? {
              id: waiting[0].id,
              mode: waiting[0].mode,
              createdAt: new Date(waiting[0].created_at).toISOString(),
              invited: !!waiting[0].invited_profile,
              allowBots: waiting[0].allow_bots,
            }
          : null,
        profiles,
      };
    });
    return result;
  }
  private async available(sql: Sql, id: string) {
    const rows = await sql<{ card_id: string }>(
      'SELECT card_id FROM inventory WHERE profile_id=$1 AND quantity>reserved',
      [id],
    );
    return cards(rows.map((r) => r.card_id));
  }
  private async busy(sql: Sql, id: string) {
    await this.requireSettlement(sql, id);
    const [p] = await sql<{ played: number; tutorial_completed: boolean; is_bot: boolean }>(
      'SELECT played,tutorial_completed,is_bot FROM profiles WHERE id=$1',
      [id],
    );
    if (p && p.played === 0 && !p.tutorial_completed && !p.is_bot)
      throw new GameError(
        'Complete the first-duel tutorial or acknowledge the rulebook before starting a match.',
        428,
      );
    const rows = await sql(
      "SELECT id FROM matches WHERE (player0=$1 OR player1=$1) AND mode<>'correspondence' AND status IN('playing','drafting')",
      [id],
    );
    const waiting = await sql("SELECT id FROM lobbies WHERE host_id=$1 AND status='waiting'", [id]);
    if (rows.length || waiting.length)
      throw new GameError('Finish your active match or leave your waiting lobby first.', 409);
  }
  private async requireSettlement(sql: Sql, id: string) {
    if (
      (
        await sql(
          "SELECT id FROM matches WHERE (player0=$1 OR player1=$1) AND status='complete' AND settlement_done=false",
          [id],
        )
      ).length
    )
      throw new GameError(
        'Resolve the pending Trade One card selection before starting another game.',
        409,
      );
  }
  private async deck(sql: Sql, id: string, random = false, mode: Mode = 'solo') {
    const pool =
      mode === 'correspondence'
        ? cards(
            (
              await sql<{ card_id: string }>(
                'SELECT card_id FROM inventory WHERE profile_id=$1 AND quantity>0',
                [id],
              )
            ).map((row) => row.card_id),
          )
        : await this.available(sql, id);
    if (mode === 'ranked-random') {
      try {
        return randomDeck(pool, rng());
      } catch {
        throw new GameError(
          'Your available collection cannot form a legal five-card deck. Open a booster or cancel reserved trade offers.',
          428,
        );
      }
    }
    const [p] = await sql<ProfileRow>('SELECT * FROM profiles WHERE id=$1', [id]);
    if (p.default_deck.length !== 5)
      throw new GameError(
        `Your active deck has ${p.default_deck.length}/5 cards. Add ${5 - p.default_deck.length} more in Collection before starting a duel.`,
        428,
      );
    if (random) return randomDeck(pool, rng());
    const selected = cards(p.default_deck);
    if (validateDeck(selected).length || selected.some((c) => !pool.some((p) => p.id === c.id)))
      throw new GameError('Your saved deck has unavailable cards. Rebuild it in Collection.');
    return selected;
  }
  async saveDeck(id: string, ids: string[]) {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string'))
      throw new GameError('Invalid deck.');
    const deck = cards(ids);
    const errors = validateDeck(deck);
    if (errors.length) throw new GameError(errors.join(' '));
    await this.db.tx(async (sql) => {
      const pool = await this.available(sql, id);
      if (deck.some((c) => !pool.some((p) => p.id === c.id)))
        throw new GameError('You do not have an available copy of every selected card.');
      await sql('UPDATE profiles SET default_deck=$1::jsonb,active_loadout_id=NULL WHERE id=$2', [
        JSON.stringify(ids),
        id,
      ]);
    });
  }
  async rebuildDeck(id: string) {
    return this.db.tx(async (sql) => {
      let next: string[];
      try {
        next = shuffle(buildBestDeck(await this.available(sql, id), rng()), rng()).map((c) => c.id);
      } catch {
        throw new GameError(
          'Your available collection cannot form a legal five-card deck. Open a booster or cancel reserved trade offers.',
          428,
        );
      }
      await sql('UPDATE profiles SET default_deck=$1::jsonb,active_loadout_id=NULL WHERE id=$2', [
        JSON.stringify(next),
        id,
      ]);
      return next;
    });
  }
  private async reserve(sql: Sql, id: string, deck: readonly Card[], delta: 1 | -1) {
    for (const c of deck) {
      const rows = await sql(
        `UPDATE inventory SET reserved=reserved+$3 WHERE profile_id=$1 AND card_id=$2 AND ${delta === 1 ? 'quantity>reserved' : 'reserved>0'} RETURNING card_id`,
        [id, c.id, delta],
      );
      if (rows.length !== 1) throw new GameError('A card is no longer available.', 409);
    }
  }
  async solo(id: string, difficulty: 'easy' | 'normal', rules: Rules, style: unknown = 'balanced') {
    if (!CPU_STYLES.includes(style as CpuStyle)) throw new GameError('Choose a bot style.');
    return this.db.tx(async (sql) => {
      await this.busy(sql, id);
      const deck = await this.deck(sql, id, !!rules.random);
      const cpu = randomDeck(
        CARDS.filter((c) => c.rarity <= Math.max(...deck.map((c) => c.rarity))),
        rng(),
      );
      const matchId = await this.newMatch(
        sql,
        'solo',
        id,
        null,
        rules,
        'none',
        [deck, cpu],
        difficulty,
      );
      await sql('UPDATE matches SET cpu_style=$1 WHERE id=$2', [style, matchId]);
      return matchId;
    });
  }
  private async newMatch(
    sql: Sql,
    mode: Mode,
    a: string,
    b: string | null,
    rules: Rules,
    trade: 'none' | 'one',
    decks: [Card[], Card[]],
    difficulty: 'easy' | 'normal' | null = null,
    unratedRematch = false,
    turnHours: CorrespondenceHours | null = null,
  ) {
    const id = randomUUID();
    if (!turnHours) {
      await this.requireSettlement(sql, a);
      if (b) await this.requireSettlement(sql, b);
    }
    let state: GameState | null = null;
    let pools: [Card[], Card[]] | null = null;
    if (isDraftMode(mode)) {
      if (mode === 'shared-draft') {
        const shared = draftPool(4);
        pools = [shared, shared];
      } else pools = [draftPool(), draftPool()];
      decks = [[], []];
    } else {
      state = createGame(decks, rules, rng());
      if (b && !turnHours) {
        await this.reserve(sql, a, decks[0], 1);
        await this.reserve(sql, b, decks[1], 1);
      }
    }
    await sql(
      `INSERT INTO matches(id,mode,player0,player1,difficulty,state,decks,pools,rules,trade_rule,status,deadline,unrated_rematch,turn_hours) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14)`,
      [
        id,
        mode,
        a,
        b,
        difficulty,
        JSON.stringify(state),
        JSON.stringify(decks.map((d) => d.map((c) => c.id))),
        JSON.stringify(pools?.map((p) => p.map((c) => c.id)) ?? null),
        JSON.stringify(rules),
        trade,
        isDraftMode(mode) ? 'drafting' : 'playing',
        state
          ? Date.now() +
            (turnHours ? turnHours * 3_600_000 : mode === 'solo' && state.turn === 1 ? 700 : 60_000)
          : Date.now() + 180_000,
        unratedRematch,
        turnHours,
      ],
    );
    if (!turnHours)
      await sql('UPDATE matches SET activity_at=$1::jsonb,disconnected_at=$2::jsonb WHERE id=$3', [
        JSON.stringify([Date.now(), Date.now()]),
        JSON.stringify(
          [a, b].map((p) => (p && this.isOnline && !this.isOnline(p) ? Date.now() : null)),
        ),
        id,
      ]);
    if (mode === 'shared-draft')
      await sql('UPDATE matches SET shared_draft=$1::jsonb WHERE id=$2', [
        JSON.stringify({ first: randomInt(2) }),
        id,
      ]);
    return id;
  }
  async correspondence(profileId: string): Promise<CorrespondenceMatch[]> {
    return this.db.read(async (sql) => {
      const rows = await sql<{
        id: string;
        opponent: string;
        your_turn: boolean;
        deadline: string | null;
        outcome: CorrespondenceMatch['outcome'];
      }>(
        `SELECT m.id,p.name AS opponent,
           m.status='playing' AND (m.state->>'turn')::int=seat AS your_turn,m.deadline,
           CASE WHEN m.status='complete' THEN CASE WHEN m.is_draw THEN 'draw' WHEN m.winner=seat THEN 'win' ELSE 'loss' END END AS outcome
         FROM (
           SELECT *,CASE WHEN player0=$1 THEN 0 ELSE 1 END AS seat
           FROM matches WHERE mode='correspondence' AND (player0=$1 OR player1=$1)
           AND (status='playing' OR completed_at>now()-interval '7 days')
         ) m JOIN profiles p ON p.id=CASE WHEN m.seat=0 THEN m.player1 ELSE m.player0 END
         ORDER BY (m.status='playing') DESC,your_turn DESC,m.deadline,m.completed_at DESC LIMIT 24`,
        [profileId],
      );
      return rows.map((row) => ({
        id: row.id,
        opponent: row.opponent,
        yourTurn: row.your_turn,
        deadline: row.deadline === null ? null : Number(row.deadline),
        outcome: row.outcome,
      }));
    });
  }
  async startCorrespondence(
    sql: Sql,
    sender: string,
    recipient: string,
    hours: CorrespondenceHours,
  ) {
    const participants = [sender, recipient];
    const active = await sql<{ player0: string; player1: string }>(
      "SELECT player0,player1 FROM matches WHERE mode='correspondence' AND status='playing' AND (player0=ANY($1::text[]) OR player1=ANY($1::text[]))",
      [participants],
    );
    if (active.some((m) => participants.includes(m.player0) && participants.includes(m.player1)))
      throw new GameError('You already have a correspondence match with this friend.', 409);
    if (
      participants.some(
        (id) => active.filter((m) => m.player0 === id || m.player1 === id).length >= 12,
      )
    )
      throw new GameError('A player has reached the limit of 12 correspondence matches.', 409);
    const decks: [Card[], Card[]] = [[], []];
    for (const seat of [0, 1] as const) {
      try {
        decks[seat] = await this.deck(sql, participants[seat], false, 'correspondence');
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        throw new GameError('Both players need a legal saved deck.', 428);
      }
    }
    return this.newMatch(
      sql,
      'correspondence',
      sender,
      recipient,
      UNRANKED,
      'none',
      decks,
      null,
      false,
      hours,
    );
  }
  async lobbies(includeRated = false): Promise<LobbyView[]> {
    return this.db.read(async (sql) => {
      const rows = await sql<LobbyRow & { host: string; bot_style: CpuStyle | null }>(
        "SELECT l.*,p.name host,CASE WHEN p.is_bot THEN p.bot_style ELSE NULL END bot_style FROM lobbies l JOIN profiles p ON p.id=l.host_id WHERE l.status IN('waiting','playing') AND ($1 OR l.mode<>ALL($2::text[])) ORDER BY l.created_at DESC LIMIT 200",
        [includeRated, RATED_MODES],
      );
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        host: r.host,
        botStyle: r.bot_style,
        hostId: r.host_id,
        allowBots: r.allow_bots,
        inviteOnly: !!r.invited_profile || !r.spectatable,
        mode: r.mode,
        rules: r.rules,
        tradeRule: r.trade_rule,
        status: r.status as 'waiting' | 'playing',
        players: r.guest_id ? 2 : 1,
        matchId: r.match_id,
        createdAt: new Date(r.created_at).toISOString(),
      }));
    });
  }
  private async related(sql: Sql, a: string, b: string) {
    return (
      (
        await sql(
          'SELECT 1 FROM profile_accounts a JOIN profile_accounts b ON a.auth_user_id=b.auth_user_id WHERE a.profile_id=$1 AND b.profile_id=$2 AND a.auth_user_id IS NOT NULL LIMIT 1',
          [a, b],
        )
      ).length > 0
    );
  }
  async createLobby(
    profile: ProfileIdentity,
    input: {
      mode: Mode;
      name?: string;
      rules?: unknown;
      tradeRule?: string;
      allowBots?: boolean;
      invitedProfile?: string;
    },
  ) {
    const { id } = profile;
    const mode = input.mode;
    if (!isRatedMode(mode) && !['casual', 'custom', 'roulette'].includes(mode))
      throw new GameError('Unknown mode.');
    const trade = mode === 'custom' && input.tradeRule === 'one' ? 'one' : 'none';
    if ((isRatedMode(mode) || trade === 'one') && !profile.registered)
      throw new GameError('Register an account for ranked, rated Draft, or Trade One.', 403);
    const rules =
      mode === 'ranked-random'
        ? RANKED_RANDOM_RULES
        : mode === 'ranked'
          ? RANKED
          : mode === 'shared-draft'
            ? { ...UNRANKED, allOpen: true, threeOpen: false }
            : mode === 'custom'
              ? cleanRules(input.rules)
              : UNRANKED;
    if (trade === 'one' && !supportsTradeOne(rules))
      throw new GameError(
        'Trade One requires Closed visibility with Same, Plus and Combo enabled.',
      );
    return this.db.tx(async (sql) => {
      await this.busy(sql, id);
      const [actor] = await sql<{ is_bot: boolean }>('SELECT is_bot FROM profiles WHERE id=$1', [
        id,
      ]);
      if (isRankedMode(mode)) await this.rankedEligible(sql, id);
      const allowBots =
        input.invitedProfile || isRatedMode(mode) ? false : (input.allowBots ?? actor.is_bot);
      if (!isDraftMode(mode)) await this.deck(sql, id, !!rules.random, mode);
      if (mode !== 'custom') {
        const ratingField = modeRatingField(mode);
        const candidates = await sql<LobbyRow>(
          `SELECT l.* FROM lobbies l JOIN profiles p ON p.id=l.host_id WHERE l.mode=$1 AND l.status='waiting' AND l.host_id<>$2 AND l.invited_profile IS NULL AND (l.allow_bots OR NOT $4) AND ($5 OR NOT p.is_bot) ORDER BY abs(p.${ratingField}-$3),l.created_at LIMIT 20`,
          [
            mode,
            id,
            {
              ranked: profile.rating,
              'ranked-random': profile.rankedRandomRating,
              draft: profile.draftRating,
              'shared-draft': profile.sharedDraftRating,
            }[isRatedMode(mode) ? mode : 'ranked'],
            actor.is_bot,
            allowBots,
          ],
        );
        for (const row of candidates) {
          if (await this.related(sql, row.host_id, id)) continue;
          if (isRatedMode(mode) && (await this.sharedNetwork(sql, row.host_id, id))) continue;
          return this.joinRow(sql, profile, row);
        }
      }
      const lobbyId = randomUUID();
      await sql(
        "INSERT INTO lobbies(id,host_id,name,mode,rules,trade_rule,status,allow_bots,invited_profile,spectatable) VALUES($1,$2,$3,$4,$5::jsonb,$6,'waiting',$7,$8,$9)",
        [
          lobbyId,
          id,
          (input.name || `${profile.name}'s table`).trim().slice(0, 60),
          mode,
          JSON.stringify(rules),
          trade,
          allowBots,
          input.invitedProfile ?? null,
          !input.invitedProfile,
        ],
      );
      return { lobbyId, matchId: null };
    });
  }
  private async joinRow(sql: Sql, p: ProfileIdentity, lobby: LobbyRow) {
    if (isRankedMode(lobby.mode)) {
      await this.rankedEligible(sql, p.id);
      await this.rankedEligible(sql, lobby.host_id);
    }
    if (lobby.invited_profile && lobby.invited_profile !== p.id)
      throw new GameError('This table is reserved for an invited friend.', 403);
    if (
      lobby.invited_profile &&
      !(
        await sql(
          "SELECT 1 FROM duel_invitations WHERE lobby_id=$1 AND status='pending' AND expires_at>now()",
          [lobby.id],
        )
      ).length
    )
      throw new GameError('This invitation has ended.', 409);
    if (
      !lobby.allow_bots &&
      (await sql<{ is_bot: boolean }>('SELECT is_bot FROM profiles WHERE id=$1', [p.id]))[0]?.is_bot
    )
      throw new GameError('Bots are not allowed at this table.', 403);
    if (!isRankedMode(lobby.mode) && lobby.trade_rule === 'one' && !supportsTradeOne(lobby.rules))
      throw new GameError(
        'This table’s Trade One rules are no longer valid. Its host must create a Closed / Same / Plus / Combo table.',
      );
    if (lobby.status !== 'waiting' || lobby.guest_id)
      throw new GameError('That lobby is no longer waiting.', 409);
    if (lobby.host_id === p.id || (await this.related(sql, lobby.host_id, p.id)))
      throw new GameError('You cannot play against your own account profiles.');
    if ((isRatedMode(lobby.mode) || lobby.trade_rule === 'one') && !p.registered)
      throw new GameError('A registered account is required for this table.', 403);
    let rules = lobby.mode === 'roulette' ? roulette() : lobby.rules;
    if (lobby.mode === 'ranked-random') rules = RANKED_RANDOM_RULES;
    if (lobby.mode === 'ranked') rules = RANKED;
    if (rules.combo && !rules.same && !rules.plus) rules = { ...rules, combo: false };
    const decks: [Card[], Card[]] = isDraftMode(lobby.mode)
      ? [[], []]
      : [
          await this.deck(sql, lobby.host_id, !!rules.random, lobby.mode),
          await this.deck(sql, p.id, !!rules.random, lobby.mode),
        ];
    const mid = await this.newMatch(
      sql,
      lobby.mode,
      lobby.host_id,
      p.id,
      rules,
      isRankedMode(lobby.mode) ? 'none' : lobby.trade_rule,
      decks,
    );
    await sql(
      "UPDATE lobbies SET guest_id=$1,status='playing',match_id=$2,rules=$3::jsonb WHERE id=$4",
      [p.id, mid, JSON.stringify(rules), lobby.id],
    );
    return { lobbyId: lobby.id, matchId: mid };
  }
  async joinLobby(p: ProfileIdentity, id: string) {
    return this.db.tx(async (sql) => {
      await this.busy(sql, p.id);
      const [lobby] = await sql<LobbyRow>('SELECT * FROM lobbies WHERE id=$1', [id]);
      if (!lobby) throw new GameError('Lobby not found.', 404);
      return this.joinRow(sql, p, lobby);
    });
  }
  async cancelLobby(profileId: string, id: string) {
    return this.db.tx(async (sql) => {
      const [lobby] = await sql<LobbyRow>('SELECT * FROM lobbies WHERE id=$1', [id]);
      if (!lobby) throw new GameError('Lobby not found.', 404);
      if (lobby.host_id !== profileId)
        throw new GameError('Only the host can close this lobby.', 403);
      if (lobby.status === 'playing')
        throw new GameError('The duel has already started. Return to the match to leave it.', 409);
      await sql("UPDATE lobbies SET status='closed' WHERE id=$1", [id]);
      const expired = await sql<{ recipient_id: string }>(
        "UPDATE duel_invitations SET status='expired' WHERE lobby_id=$1 AND status='pending' RETURNING recipient_id",
        [id],
      );
      return expired.map((invite) => invite.recipient_id);
    });
  }
  async enablePractice(profileId: string, lobbyId: string) {
    const rows = await this.db.read((sql) =>
      sql(
        "UPDATE lobbies SET allow_bots=true WHERE id=$1 AND host_id=$2 AND status='waiting' AND mode=ANY($3::text[]) AND invited_profile IS NULL RETURNING id",
        [lobbyId, profileId, RATED_MODES],
      ),
    );
    if (!rows.length) throw new GameError('Your queue has ended. Refresh to see your match.', 409);
    return { ok: true };
  }
  private async load(sql: Sql, id: string, profileId?: string) {
    const [row] = await sql<MatchRow>('SELECT * FROM matches WHERE id=$1', [id]);
    if (!row) throw new GameError('Match not found.', 404);
    if (profileId && row.player0 !== profileId && row.player1 !== profileId)
      throw new GameError('This match is private.', 403);
    return row;
  }
  async view(profileId: string, id: string, spectator = false, host = false): Promise<MatchView> {
    return this.db.read(async (sql) => {
      const m = await this.load(sql, id, spectator ? undefined : profileId);
      if (
        spectator &&
        (m.mode === 'correspondence' ||
          (!host &&
            !(
              await sql(
                'SELECT 1 FROM lobbies WHERE match_id=$1 AND spectatable AND invited_profile IS NULL',
                [id],
              )
            ).length))
      )
        throw new GameError('This battle is not available to spectators.', 403);
      const seat: Player = spectator || m.player0 === profileId ? 0 : 1;
      const rematchUnavailable =
        !spectator && m.status === 'complete' && m.player1
          ? await this.rematchUnavailable(sql, m, profileId)
          : null;
      const users = await sql<{
        id: string;
        name: string;
        avatar_card: string | null;
        selected_title: string | null;
        is_bot: boolean;
        bot_style: CpuStyle;
        portrait_frame: PortraitFrame;
      }>(
        'SELECT id,name,avatar_card,selected_title,is_bot,bot_style,portrait_frame FROM profiles WHERE id=$1 OR id=$2',
        [m.player0, m.player1],
      );
      const game = m.state
        ? {
            ...m.state,
            hands: m.state.hands.map((hand, player) =>
              hand.map((card) => ({
                slotId: createHmac('sha256', this.redactionSecret)
                  .update(`${m.id}|${player}|${card.id}`)
                  .digest('hex')
                  .slice(0, 24),
                card:
                  (!spectator && player === seat) || isRevealed(m.state!, player as Player, card.id)
                    ? card
                    : null,
              })),
            ) as MatchView['game'] extends infer _T
              ? [
                  import('@gacha-triad/shared/platform').HandCard[],
                  import('@gacha-triad/shared/platform').HandCard[],
                ]
              : never,
          }
        : null;
      if (game) delete (game as unknown as Record<string, unknown>).revealed;
      const identity = (id: string | null) => {
        const p = users.find((p) => p.id === id);
        return {
          id,
          name: p?.name ?? (m.difficulty === 'normal' ? 'The Strategist' : 'The Wanderer'),
          botStyle: p?.is_bot ? p.bot_style : !id && m.mode === 'solo' ? m.cpu_style : null,
          title: titleName(p?.selected_title),
          frameId: p?.portrait_frame ?? 'classic',
          avatar: p?.avatar_card ? (byId.get(p.avatar_card) ?? null) : null,
        };
      };
      let ratedResult: MatchView['ratedResult'] = null;
      if (!spectator && m.status === 'complete' && isRatedMode(m.mode)) {
        const field = modeRatingField(m.mode);
        const [person] = await sql<{ rating: number }>(
          `SELECT ${field} AS rating FROM profiles WHERE id=$1`,
          [profileId],
        );
        const [audit] = await sql<{ before_rating: number; after_rating: number }>(
          'SELECT before_rating,after_rating FROM match_ratings WHERE match_id=$1 AND profile_id=$2',
          [m.id, profileId],
        );
        const [record] = await sql<{ wins: number; losses: number; draws: number }>(
          `SELECT
          count(*) FILTER(WHERE NOT m.is_draw AND m.winner=CASE WHEN m.player0=$1 THEN 0 ELSE 1 END)::int AS wins,
          count(*) FILTER(WHERE NOT m.is_draw AND m.winner<>CASE WHEN m.player0=$1 THEN 0 ELSE 1 END)::int AS losses,
          count(*) FILTER(WHERE m.is_draw)::int AS draws
          FROM matches m WHERE (m.player0=$1 OR m.player1=$1) AND m.status='complete' AND m.mode=$2 AND m.season=$3
          AND m.player1 IS NOT NULL AND NOT m.unrated_rematch AND coalesce(m.end_reason,'')<>'admin test result'
          AND NOT EXISTS(SELECT 1 FROM profiles bot WHERE bot.is_bot AND bot.id IN(m.player0,m.player1))`,
          [profileId, m.mode, m.season],
        );
        ratedResult = {
          season: m.season,
          rating: audit?.after_rating ?? person.rating,
          delta: audit ? audit.after_rating - audit.before_rating : null,
          ...record,
        };
      }
      let spectatorResult: MatchView['spectatorResult'] = null;
      if (spectator && m.status === 'complete') {
        const audits = await sql<{
          profile_id: string;
          before_rating: number;
          after_rating: number;
        }>('SELECT profile_id,before_rating,after_rating FROM match_ratings WHERE match_id=$1', [
          m.id,
        ]);
        const rating = (id: string | null) => {
          const audit = audits.find((row) => row.profile_id === id);
          return audit
            ? {
                before: audit.before_rating,
                after: audit.after_rating,
                delta: audit.after_rating - audit.before_rating,
              }
            : null;
        };
        spectatorResult = {
          season: m.season,
          decks: [cards(m.decks[0]), cards(m.decks[1])],
          ratings: [rating(m.player0), rating(m.player1)],
        };
      }
      return {
        cpuStyle: m.cpu_style,
        spectatorResult,
        sharedDraft:
          !spectator && m.shared_draft && m.status === 'drafting' && m.pools
            ? {
                first: m.shared_draft.first,
                turn: m.draft_revealed.every((n) => n >= 20)
                  ? draftTurn(m.shared_draft.first, m.decks)
                  : null,
                picks: [cards(m.decks[0]), cards(m.decks[1])],
                available: m.pools[0].filter((id) => !m.decks.flat().includes(id)),
                legal: legalDraftCards(cards(m.pools[0]), m.decks, seat).map((c) => c.id),
                ready: m.draft_revealed.map((n) => n >= 20) as [boolean, boolean],
              }
            : undefined,
        ratedResult,
        id: m.id,
        spectator,
        missedTurns: m.auto_turns,
        chatAvailable: !spectator && !!m.player1 && !users.some((p) => p.is_bot),
        ratingApplies:
          !!m.player1 &&
          !m.unrated_rematch &&
          isRatedMode(m.mode) &&
          !users.some((p) => p.is_bot) &&
          m.end_reason !== 'admin test result' &&
          !(await this.sharedNetwork(sql, m.player0, m.player1)),
        players: [identity(m.player0), identity(m.player1)],
        prismReward:
          (
            await sql<{ delta: number }>(
              "SELECT delta FROM prism_ledger WHERE profile_id=$1 AND kind='match' AND reference=$2",
              [profileId, `match:${m.id}`],
            )
          )[0]?.delta ?? 0,
        mode: m.mode,
        version: m.version,
        status: m.status,
        seat,
        names: [
          users.find((p) => p.id === m.player0)?.name ?? 'Player 1',
          m.player1
            ? (users.find((p) => p.id === m.player1)?.name ?? 'Player 2')
            : m.difficulty === 'normal'
              ? 'The Strategist'
              : 'The Wanderer',
        ],
        game,
        score: m.state ? scores(m.state) : [5, 5],
        winner: m.status === 'complete' ? (m.is_draw ? 'draw' : m.winner) : null,
        rules: m.rules,
        deadline: m.deadline ? Number(m.deadline) : null,
        turnHours: m.turn_hours ?? undefined,
        endReason: m.end_reason,
        draftPool: !spectator && m.status === 'drafting' && m.pools ? cards(m.pools[seat]) : [],
        draftLocked: m.decks[seat].length === 5,
        draftRevealed: m.draft_revealed?.[seat] ?? 0,
        rematch: {
          unavailableReason: rematchUnavailable,
          requestedBy:
            !spectator &&
            m.rematch_requested_at &&
            Date.now() - new Date(m.rematch_requested_at).getTime() < 300000
              ? m.rematch_requested_by
              : null,
          matchId: spectator ? null : m.rematch_match_id,
          expiresAt: m.rematch_requested_at
            ? new Date(m.rematch_requested_at).getTime() + 300000
            : null,
        },
        trade: {
          rule: m.trade_rule,
          pending: !spectator && !m.settlement_done && m.status === 'complete',
          canClaim:
            !spectator && !m.settlement_done && m.status === 'complete' && m.winner === seat,
          choices:
            !spectator && m.status === 'complete' && !m.is_draw
              ? cards(m.decks[m.winner === 0 ? 1 : 0])
              : [],
          claimedCard: m.claimed_card ? (byId.get(m.claimed_card) ?? null) : null,
          expiresAt: m.claim_deadline ? Number(m.claim_deadline) : null,
        },
      };
    });
  }
  async lockDraft(profileId: string, id: string, ids: string[]) {
    await this.db.tx(async (sql) => {
      const m = await this.load(sql, id, profileId);
      if (await this.expireInactivity(sql, m)) return;
      if (m.status !== 'drafting' || !m.pools) throw new GameError('This match is not drafting.');
      if (m.shared_draft) throw new GameError('Pick cards in turn from the shared pool.', 409);
      const seat = m.player0 === profileId ? 0 : 1;
      if (m.decks[seat].length) throw new GameError('Your draft is already locked.');
      if ((m.draft_revealed?.[seat] ?? 0) < m.pools[seat].length)
        throw new GameError('Finish opening your three temporary Draft boosters first.', 409);
      if (!Array.isArray(ids) || ids.some((c) => !m.pools![seat].includes(c)))
        throw new GameError('Choose only cards in your draft pool.');
      const selected = cards(ids);
      const errors = validateDeck(selected);
      if (errors.length) throw new GameError(errors.join(' '));
      m.decks[seat] = ids;
      await this.recordAction(sql, m, seat);
      if (m.decks.every((d) => d.length === 5)) {
        const state = createGame([cards(m.decks[0]), cards(m.decks[1])], m.rules, rng());
        await sql(
          "UPDATE matches SET decks=$1::jsonb,state=$2::jsonb,status='playing',version=version+1,deadline=$3 WHERE id=$4",
          [JSON.stringify(m.decks), JSON.stringify(state), Date.now() + 60000, id],
        );
      } else
        await sql('UPDATE matches SET decks=$1::jsonb,version=version+1 WHERE id=$2', [
          JSON.stringify(m.decks),
          id,
        ]);
    });
  }
  async pickDraft(profileId: string, id: string, cardId: unknown, version: unknown) {
    await this.db.tx(async (sql) => {
      const m = await this.load(sql, id, profileId);
      if (await this.expireInactivity(sql, m)) return;
      if (m.status !== 'drafting' || !m.shared_draft || !m.pools)
        throw new GameError('This match is not a shared Draft.', 409);
      const seat = m.player0 === profileId ? 0 : 1;
      if (!m.draft_revealed.every((n) => n >= 20))
        throw new GameError('Both players must finish opening the four boosters.', 409);
      if (m.deadline && Number(m.deadline) <= Date.now()) {
        await this.timeoutSharedDraft(sql, m);
        return;
      }
      if (draftTurn(m.shared_draft.first, m.decks) !== seat)
        throw new GameError('Wait for your drafting turn.', 409);
      if (!Number.isInteger(version) || version !== m.version)
        throw new GameError('The draft has changed. Refresh before picking.', 409);
      if (
        typeof cardId !== 'string' ||
        !legalDraftCards(cards(m.pools[0]), m.decks, seat).some((c) => c.id === cardId)
      )
        throw new GameError('Choose an available card within your deck rarity limit.');
      await this.recordAction(sql, m, seat);
      m.auto_turns[seat] = 0;
      await this.applyDraftPick(sql, m, seat, cardId);
    });
  }
  private async applyDraftPick(sql: Sql, m: MatchRow, seat: Player, cardId: string) {
    m.decks[seat].push(cardId);
    const complete = m.decks.every((deck) => deck.length === 5);
    let state: GameState | null = null;
    if (complete) {
      const first = (1 - m.shared_draft!.first) as Player;
      state = {
        ...createGame([cards(m.decks[0]), cards(m.decks[1])], m.rules, rng()),
        turn: first,
        firstPlayer: first,
      };
    }
    await sql(
      'UPDATE matches SET decks=$1::jsonb,state=$2::jsonb,status=$3,auto_turns=$4::jsonb,version=version+1,deadline=$5 WHERE id=$6',
      [
        JSON.stringify(m.decks),
        JSON.stringify(state),
        complete ? 'playing' : 'drafting',
        JSON.stringify(complete ? [0, 0] : m.auto_turns),
        Date.now() + (complete ? 60000 : 45000),
        m.id,
      ],
    );
  }
  private async timeoutSharedDraft(sql: Sql, m: MatchRow) {
    if (!m.draft_revealed.every((n) => n >= 20)) {
      await sql(
        "UPDATE matches SET draft_revealed='[20,20]',version=version+1,deadline=$1 WHERE id=$2",
        [Date.now() + 45000, m.id],
      );
      return;
    }
    const seat = draftTurn(m.shared_draft!.first, m.decks)!;
    m.auto_turns[seat]++;
    if (m.auto_turns[seat] >= 2)
      await this.finish(sql, m, (1 - seat) as Player, 'two consecutive missed draft picks');
    else {
      const choice = legalDraftCards(cards(m.pools![0]), m.decks, seat).sort(
        (a, b) =>
          b.rarity - a.rarity ||
          b.stats.reduce((s, n) => s + n, 0) - a.stats.reduce((s, n) => s + n, 0),
      )[0];
      await this.applyDraftPick(sql, m, seat, choice.id);
    }
  }
  async revealDraft(profileId: string, id: string, step: unknown) {
    await this.db.tx(async (sql) => {
      const m = await this.load(sql, id, profileId),
        seat = m.player0 === profileId ? 0 : 1;
      if (await this.expireInactivity(sql, m)) return;
      if (m.status !== 'drafting' || !m.pools)
        throw new GameError('This match is not drafting.', 409);
      const revealed = m.draft_revealed ?? [0, 0];
      if (typeof step !== 'number' || !Number.isInteger(step) || step < 0 || step > revealed[seat])
        throw new GameError('Reveal Draft cards in order.', 409);
      if (step < revealed[seat] || revealed[seat] >= m.pools[seat].length) return;
      revealed[seat]++;
      await this.recordAction(sql, m, seat);
      await sql('UPDATE matches SET draft_revealed=$1::jsonb,version=version+1 WHERE id=$2', [
        JSON.stringify(revealed),
        id,
      ]);
      if (m.shared_draft && revealed.every((n) => n >= 20))
        await sql('UPDATE matches SET deadline=$1 WHERE id=$2', [Date.now() + 45000, id]);
    });
  }
  async rematch(profileId: string, id: string, cancel = false) {
    await this.db.tx(async (sql) => {
      const m = await this.load(sql, id, profileId);
      if (m.status !== 'complete')
        throw new GameError('Finish this duel before requesting a rematch.', 409);
      if (m.rematch_match_id) return;
      if (cancel) {
        if (m.rematch_requested_by !== profileId)
          throw new GameError('Only the requester can cancel this rematch.', 403);
        await sql(
          'UPDATE matches SET rematch_requested_by=NULL,rematch_requested_at=NULL,version=version+1 WHERE id=$1',
          [id],
        );
        return;
      }
      const unavailable = await this.rematchUnavailable(sql, m, profileId);
      if (unavailable) throw new GameError(unavailable, 409);
      await this.busy(sql, profileId);
      const opponent = m.player0 === profileId ? m.player1 : m.player0;
      if (!opponent) throw new GameError('Use Play again for solo practice.');
      const [other] = await sql<{ is_bot: boolean }>(
        `SELECT p.is_bot FROM profiles p WHERE p.id=$1 AND (p.is_bot OR EXISTS(SELECT 1 FROM profile_accounts a JOIN "user" u ON u.id=a.auth_user_id LEFT JOIN server_suspensions s ON s.auth_user_id=u.id WHERE a.profile_id=p.id AND s.auth_user_id IS NULL))`,
        [opponent],
      );
      if (!other) throw new GameError('This opponent is no longer available.', 409);
      if (other.is_bot)
        await sql("UPDATE lobbies SET status='closed' WHERE host_id=$1 AND status='waiting'", [
          opponent,
        ]);
      try {
        await this.busy(sql, opponent);
      } catch {
        throw new GameError('Your opponent is busy with another game or lobby.', 409);
      }
      const active =
        m.rematch_requested_at && Date.now() - new Date(m.rematch_requested_at).getTime() < 300000;
      if (
        !other.is_bot &&
        (!active || !m.rematch_requested_by || m.rematch_requested_by === profileId)
      ) {
        if (!active || !m.rematch_requested_by)
          await sql(
            'UPDATE matches SET rematch_requested_by=$1,rematch_requested_at=now(),version=version+1 WHERE id=$2',
            [profileId, id],
          );
        return;
      }
      if (isRankedMode(m.mode)) {
        await this.rankedEligible(sql, m.player0);
        await this.rankedEligible(sql, m.player1!);
      }
      if (other.is_bot && !isDraftMode(m.mode) && m.mode !== 'ranked-random') {
        const deck = buildBestDeck(await this.available(sql, opponent), rng());
        await sql('UPDATE profiles SET default_deck=$1::jsonb WHERE id=$2', [
          JSON.stringify(deck.map((c) => c.id)),
          opponent,
        ]);
      }
      const decks: [Card[], Card[]] = isDraftMode(m.mode)
        ? [[], []]
        : [
            await this.deck(sql, m.player0, !!m.rules.random, m.mode),
            await this.deck(sql, m.player1!, !!m.rules.random, m.mode),
          ];
      const next = await this.newMatch(
        sql,
        m.mode,
        m.player0,
        m.player1,
        m.rules,
        m.trade_rule,
        decks,
        m.difficulty,
        m.mode === 'ranked-random',
      );
      const [host] = await sql<{ name: string }>('SELECT name FROM profiles WHERE id=$1', [
        m.player0,
      ]);
      await sql(
        "INSERT INTO lobbies(id,host_id,guest_id,name,mode,rules,trade_rule,status,match_id,allow_bots,spectatable) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,'playing',$8,$9,COALESCE((SELECT spectatable AND invited_profile IS NULL FROM lobbies WHERE match_id=$10 LIMIT 1),false))",
        [
          randomUUID(),
          m.player0,
          m.player1,
          `${host.name}'s rematch`.slice(0, 60),
          m.mode,
          JSON.stringify(m.rules),
          m.trade_rule,
          next,
          other.is_bot,
          id,
        ],
      );
      await sql('UPDATE matches SET rematch_match_id=$1,version=version+1 WHERE id=$2', [next, id]);
    });
  }
  private async rematchUnavailable(
    sql: Sql,
    match: MatchRow,
    viewer: string,
  ): Promise<string | null> {
    if (match.mode === 'correspondence')
      return 'Send a new correspondence invitation to play again.';
    if (isRatedMode(match.mode) && match.mode !== 'ranked-random')
      return 'Rated matches use matchmaking. Join the queue for your next game.';
    if (match.departed?.length)
      return 'A player has left this match. Start a new game to play again.';
    const opponent = match.player0 === viewer ? match.player1 : match.player0;
    if (!opponent) return null;
    const [other] = await sql<{ is_bot: boolean }>('SELECT is_bot FROM profiles WHERE id=$1', [
      opponent,
    ]);
    if (!other) return 'This opponent is no longer available.';
    if (!other.is_bot && this.isOnline && !this.isOnline(opponent))
      return 'Your opponent is offline.';
    if (
      (
        await sql(
          "SELECT 1 FROM matches WHERE id<>$2 AND (player0=$1 OR player1=$1) AND mode<>'correspondence' AND status IN('playing','drafting') UNION ALL SELECT 1 FROM lobbies WHERE host_id=$1 AND status='waiting' AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=$1 AND is_bot) LIMIT 1",
          [opponent, match.id],
        )
      ).length
    )
      return 'Your opponent is already in another game or lobby.';
    return null;
  }
  private async sharedNetwork(sql: Sql, a: string, b: string) {
    return (
      (
        await sql(
          `SELECT 1 FROM profile_accounts a JOIN account_ips ia ON ia.user_id=a.auth_user_id
      JOIN account_ips ib ON ib.network=ia.network JOIN profile_accounts b ON b.auth_user_id=ib.user_id
      WHERE a.profile_id=$1 AND b.profile_id=$2
      AND NOT ($3 AND ia.network IN('127.0.0.1','::1'))
      AND NOT EXISTS(SELECT 1 FROM account_networks n WHERE n.network=ia.network AND n.allow_shared) LIMIT 1`,
          [
            a,
            b,
            process.env.NODE_ENV !== 'production' &&
              process.env.ALLOW_SHARED_TEST_NETWORK === 'true',
          ],
        )
      ).length > 0
    );
  }
  async leaveResult(profileId: string, id: string) {
    await this.db.tx(async (sql) => {
      const match = await this.load(sql, id, profileId);
      if (
        match.status !== 'complete' ||
        !match.settlement_done ||
        match.rematch_match_id ||
        match.departed?.includes(profileId)
      )
        return;
      await sql(
        'UPDATE matches SET departed=departed || $1::jsonb,rematch_requested_by=NULL,rematch_requested_at=NULL,version=version+1 WHERE id=$2',
        [JSON.stringify([profileId]), id],
      );
    });
  }
  async move(profileId: string, id: string, cardId: string, cell: number, version: number) {
    return this.db.tx(async (sql) => {
      const m = await this.load(sql, id, profileId);
      if (await this.expireInactivity(sql, m)) return;
      if (m.status !== 'playing' || !m.state)
        throw new GameError('The match is not accepting moves.');
      const seat: Player = m.player0 === profileId ? 0 : 1;
      if (m.deadline && Number(m.deadline) <= Date.now()) {
        await this.timeoutTurn(sql, m);
        return;
      }
      if (m.version !== version)
        throw new GameError('The board changed. Your view has been refreshed.', 409);
      const move = { player: seat, cardId, cell };
      const error = validateMove(m.state, move);
      if (error) throw new GameError(error);
      m.auto_turns[seat] = 0;
      await sql('UPDATE matches SET auto_turns=$1::jsonb WHERE id=$2', [
        JSON.stringify(m.auto_turns),
        id,
      ]);
      await this.recordAction(sql, m, seat);
      const next = applyMove(m.state, move);
      await this.advance(sql, m, next);
      if (next.status === 'playing' && m.mode !== 'correspondence')
        return { update: { matchId: id, version: m.version + 1 }, players: [m.player0, m.player1] };
    });
  }
  private async recordAction(sql: Sql, m: MatchRow, seat: Player) {
    if (m.mode === 'correspondence') return;
    const now = Date.now(),
      id = seat === 0 ? m.player0 : m.player1!;
    m.activity_at[seat] = now;
    // A valid HTTP move/reveal proves presence even if this browser's socket has dropped.
    m.disconnected_at[seat] = !this.isOnline || this.isOnline(id) ? null : now;
    await sql('UPDATE matches SET activity_at=$1::jsonb,disconnected_at=$2::jsonb WHERE id=$3', [
      JSON.stringify(m.activity_at),
      JSON.stringify(m.disconnected_at),
      m.id,
    ]);
  }
  private async advance(sql: Sql, m: MatchRow, next: GameState) {
    m.state = next;
    await sql('UPDATE matches SET state=$1::jsonb,version=version+1,deadline=$2 WHERE id=$3', [
      JSON.stringify(next),
      Date.now() +
        (m.turn_hours
          ? m.turn_hours * 3_600_000
          : m.mode === 'solo' && next.turn === 1
            ? 900 + (next.history.at(-1)?.captures.length ?? 0) * 160
            : 60_000),
      m.id,
    ]);
    if (next.status === 'complete') await this.finish(sql, m, winner(next)!, null);
  }
  private async unlock(sql: Sql, id: string) {
    const [p] = await sql<ProfileRow>('SELECT * FROM profiles WHERE id=$1', [id]);
    const [count] = await sql<{ n: number }>(
      "SELECT count(DISTINCT coalesce(d.definition->>'baseCardId',i.card_id))::int n FROM inventory i JOIN card_definitions d ON d.id=i.card_id WHERE i.profile_id=$1 AND i.quantity>0",
      [id],
    );
    for (const a of ACHIEVEMENTS) {
      const progress = a.stat === 'collection' ? count.n : Number(p[a.stat] ?? 0);
      if (progress >= a.target)
        await sql(
          'INSERT INTO achievement_unlocks(profile_id,achievement_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [id, a.id],
        );
    }
  }
  private async finish(sql: Sql, m: MatchRow, result: Player | 'draw', reason: string | null) {
    const draw = result === 'draw';
    const stake = m.trade_rule === 'one' && !draw && !!m.player1;
    await sql(
      "UPDATE matches SET status='complete',winner=$1,is_draw=$2,completed_at=now(),deadline=NULL,end_reason=$3,settlement_done=$4,claim_deadline=$5 WHERE id=$6",
      [draw ? null : result, draw, reason, !stake, stake ? Date.now() + 120000 : null, m.id],
    );
    if (m.player1 && !isDraftMode(m.mode) && m.mode !== 'correspondence') {
      if (!stake || result === 0) await this.reserve(sql, m.player0, cards(m.decks[0]), -1);
      if (!stake || result === 1) await this.reserve(sql, m.player1, cards(m.decks[1]), -1);
    }
    const participants = [m.player0, m.player1];
    const profileRows = await sql<ProfileRow>('SELECT * FROM profiles WHERE id=$1 OR id=$2', [
      m.player0,
      m.player1,
    ]);
    for (let seat = 0; seat < 2; seat++) {
      const id = participants[seat];
      if (!id) continue;
      if (reason === 'admin test result') continue;
      const turns = m.state?.history.filter((t) => t.move.player === seat) ?? [];
      const captures = turns.flatMap((t) => t.captures);
      const total = m.state ? scores(m.state)[seat] : 0;
      // Only full duels pay out. Forfeits/abandoned drafts cannot farm instant rewards.
      if (!reason && m.state?.history.length === 9 && !profileRows.find((p) => p.id === id)?.is_bot)
        await this.economy.reward(
          sql,
          id,
          m.id,
          draw ? ECONOMY.drawReward : result === seat ? ECONOMY.winReward : ECONOMY.lossReward,
        );
      await sql(
        'UPDATE profiles SET played=played+1,wins=wins+$1,losses=losses+$2,draws=draws+$3,captures=captures+$4,same_captures=same_captures+$5,plus_captures=plus_captures+$6,combo_captures=combo_captures+$7,best_combo=greatest(best_combo,$8),perfect_wins=perfect_wins+$9 WHERE id=$10',
        [
          !draw && result === seat ? 1 : 0,
          !draw && result !== seat ? 1 : 0,
          draw ? 1 : 0,
          captures.length,
          captures.filter((c) => c.reason === 'same').length,
          captures.filter((c) => c.reason === 'plus').length,
          captures.filter((c) => c.reason === 'combo').length,
          Math.max(0, ...turns.map((t) => t.captures.filter((c) => c.reason === 'combo').length)),
          total === 10 && !reason ? 1 : 0,
          id,
        ],
      );
      if (
        m.player1 &&
        isRatedMode(m.mode) &&
        !m.unrated_rematch &&
        !profileRows.some((p) => p.is_bot) &&
        !(await this.sharedNetwork(sql, m.player0, m.player1))
      ) {
        const field = modeRatingField(m.mode);
        const self = Number(profileRows.find((p) => p.id === id)![field]);
        const opp = Number(profileRows.find((p) => p.id === participants[1 - seat])![field]);
        const expected = 1 / (1 + 10 ** ((opp - self) / 400));
        const actual = draw ? 0.5 : result === seat ? 1 : 0;
        await sql(`UPDATE profiles SET ${field}=greatest(0,${field}+$1) WHERE id=$2`, [
          Math.round(32 * (actual - expected)),
          id,
        ]);
        const recorded = await sql(
          `INSERT INTO match_ratings(match_id,profile_id,before_rating,after_rating) SELECT $1,id,$2,${field} FROM profiles WHERE id=$3 ON CONFLICT DO NOTHING RETURNING profile_id`,
          [m.id, self, id],
        );
        if (!reason && recorded.length)
          await sql(
            `UPDATE profiles SET rated_cosmetic_games=rated_cosmetic_games+1 WHERE id=$1
             AND NOT EXISTS(SELECT 1 FROM matches WHERE rematch_match_id=$2)`,
            [id, m.id],
          );
      }
      await this.unlock(sql, id);
      await sql('UPDATE profiles SET peak_rating=greatest(peak_rating,rating) WHERE id=$1', [id]);
    }
    if (reason !== 'admin test result' && m.mode === 'ranked' && !profileRows.some((p) => p.is_bot))
      await awardRankTitles(sql);
    await archiveReplay(sql, m.id);
    await sql("UPDATE lobbies SET status='closed' WHERE match_id=$1", [m.id]);
  }
  async resign(profileId: string, id: string) {
    await this.db.tx(async (sql) => {
      const m = await this.load(sql, id, profileId);
      if (m.status === 'complete') return;
      const loser = m.player0 === profileId ? 0 : 1;
      await this.finish(
        sql,
        m,
        (1 - loser) as Player,
        m.status === 'drafting' ? 'draft abandoned' : 'forfeit',
      );
    });
  }
  async adminWin(profileId: string, id: string) {
    await this.db.tx(async (sql) => {
      const allowed = await sql(
        'SELECT 1 FROM server_admins ad JOIN profile_accounts a ON a.auth_user_id=ad.auth_user_id WHERE a.profile_id=$1',
        [profileId],
      );
      if (!allowed.length) throw new GameError('Administrator access required.', 403);
      const m = await this.load(sql, id, profileId);
      if (m.status === 'complete') return;
      await this.finish(sql, m, m.player0 === profileId ? 0 : 1, 'admin test result');
    });
  }
  private async claim(sql: Sql, m: MatchRow, cardId: string) {
    if (m.settlement_done) throw new GameError('This result has already been settled.', 409);
    if (
      !m.player1 ||
      m.winner === null ||
      m.is_draw ||
      m.status !== 'complete' ||
      m.trade_rule !== 'one'
    )
      throw new GameError('No card can be claimed.');
    const loser = m.winner === 0 ? m.player1 : m.player0;
    const recipient = m.winner === 0 ? m.player0 : m.player1;
    if (!m.decks[1 - m.winner].includes(cardId))
      throw new GameError('Choose a card from the losing deck.');
    const rows = await sql(
      'UPDATE inventory SET quantity=quantity-1,reserved=reserved-1 WHERE profile_id=$1 AND card_id=$2 AND quantity>0 AND reserved>0 RETURNING card_id',
      [loser, cardId],
    );
    if (rows.length !== 1) throw new GameError('The staked copy is unavailable.', 409);
    for (const id of m.decks[1 - m.winner].filter((id) => id !== cardId))
      await this.reserve(sql, loser, cards([id]), -1);
    await sql(
      'INSERT INTO inventory(profile_id,card_id,quantity) VALUES($1,$2,1) ON CONFLICT(profile_id,card_id) DO UPDATE SET quantity=inventory.quantity+1',
      [recipient, cardId],
    );
    for (const [profile, delta] of [
      [loser, -1],
      [recipient, 1],
    ] as const)
      await sql(
        "INSERT INTO inventory_ledger(id,profile_id,card_id,delta,kind,match_id) VALUES($1,$2,$3,$4,'trade-one',$5)",
        [randomUUID(), profile, cardId, delta, m.id],
      );
    await sql(
      'UPDATE matches SET settlement_done=true,claimed_card=$1,claim_deadline=NULL,version=version+1 WHERE id=$2',
      [cardId, m.id],
    );
    await sql('UPDATE profiles SET trade_wins=trade_wins+1 WHERE id=$1', [recipient]);
    await sql(
      "UPDATE match_replays SET payload=jsonb_set(jsonb_set(payload,'{tradePending}','false'::jsonb),'{claimedCardId}',to_jsonb($1::text)) WHERE match_id=$2",
      [cardId, m.id],
    );
    await pruneDeck(sql, loser);
    await this.unlock(sql, recipient);
  }
  async claimCard(profileId: string, id: string, cardId: string) {
    await this.db.tx(async (sql) => {
      const m = await this.load(sql, id, profileId);
      if ((m.winner === 0 ? m.player0 : m.player1) !== profileId)
        throw new GameError('Only the winner may choose a card.', 403);
      await this.claim(sql, m, cardId);
    });
  }
  async achievements(id: string): Promise<AchievementView[]> {
    return this.db.read(async (sql) => {
      const [p] = await sql<ProfileRow>('SELECT * FROM profiles WHERE id=$1', [id]);
      const [n] = await sql<{ n: number }>(
        "SELECT count(DISTINCT coalesce(d.definition->>'baseCardId',i.card_id))::int n FROM inventory i JOIN card_definitions d ON d.id=i.card_id WHERE i.profile_id=$1 AND i.quantity>0",
        [id],
      );
      const unlocked = await sql<{ achievement_id: string; unlocked_at: Date }>(
        'SELECT * FROM achievement_unlocks WHERE profile_id=$1',
        [id],
      );
      return ACHIEVEMENTS.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        target: a.target,
        progress: unlocked.some((u) => u.achievement_id === a.id)
          ? a.target
          : Math.min(a.target, a.stat === 'collection' ? n.n : Number(p[a.stat] ?? 0)),
        unlockedAt:
          unlocked.find((u) => u.achievement_id === a.id)?.unlocked_at.toISOString() ?? null,
      }));
    });
  }
  async playerProfile(id: string): Promise<PlayerProfileView> {
    return this.db.read(async (sql) => {
      const [p] = await sql<ProfileRow>('SELECT * FROM profiles WHERE id=$1', [id]);
      if (!p) throw new GameError('Player not found.', 404);
      const [collection] = await sql<{ unique: number; copies: number; holo: number }>(
        `SELECT count(DISTINCT coalesce(d.definition->>'baseCardId',i.card_id))::int AS unique,coalesce(sum(i.quantity),0)::int copies,coalesce(sum(CASE WHEN d.definition->>'finish'='holo' THEN i.quantity ELSE 0 END),0)::int holo FROM inventory i JOIN card_definitions d ON d.id=i.card_id WHERE i.profile_id=$1 AND i.quantity>0`,
        [id],
      );
      const earned = await sql<{ achievement_id: string; unlocked_at: Date }>(
        'SELECT * FROM achievement_unlocks WHERE profile_id=$1 ORDER BY unlocked_at DESC',
        [id],
      );
      const showcase = (p.showcase_cards ?? []) as string[];
      const ownedShowcase = showcase.length
        ? await sql<{ card_id: string }>(
            'SELECT card_id FROM inventory WHERE profile_id=$1 AND quantity>0 AND card_id=ANY($2::text[])',
            [id, showcase],
          )
        : [];
      const owned = new Set(ownedShowcase.map((c) => c.card_id));
      const achievementViews = earned.map((a) => ({
        id: a.achievement_id,
        name: ACHIEVEMENTS.find((x) => x.id === a.achievement_id)?.name ?? a.achievement_id,
        unlockedAt: a.unlocked_at.toISOString(),
      }));
      return {
        id: p.id,
        bio: String(p.profile_bio ?? ''),
        frameId: (p.portrait_frame as PortraitFrame) ?? 'classic',
        bannerId: (p.profile_banner as ProfileBanner) ?? 'classic',
        featuredMode: (p.featured_mode as FeaturedMode) ?? 'ranked',
        featuredCards: showcase.flatMap((id) => (owned.has(id) ? (byId.get(id) ?? []) : [])),
        featuredAchievements: ((p.showcase_achievements ?? []) as string[]).flatMap(
          (id) => achievementViews.find((a) => a.id === id) ?? [],
        ),
        titleId: typeof p.selected_title === 'string' ? p.selected_title : null,
        title: titleName(p.selected_title),
        titles: await titlesFor(sql, p.id),
        name: p.name,
        isBot: p.is_bot === true,
        botStyle: p.is_bot === true ? (p.bot_style as CpuStyle) : null,
        joinedAt: (p.created_at as Date).toISOString(),
        rating: p.rating,
        rankedRandomRating: p.ranked_random_rating,
        draftRating: p.draft_rating,
        sharedDraftRating: p.shared_draft_rating,
        played: p.played,
        wins: p.wins,
        losses: p.losses,
        draws: p.draws,
        avatar: typeof p.avatar_card === 'string' ? (byId.get(p.avatar_card) ?? null) : null,
        collection,
        achievements: achievementViews,
      };
    });
  }
  async setAvatar(id: string, cardId: string | null) {
    await this.db.tx(async (sql) => {
      if (cardId !== null) {
        if (
          !byId.has(cardId) ||
          !(
            await sql('SELECT 1 FROM inventory WHERE profile_id=$1 AND card_id=$2 AND quantity>0', [
              id,
              cardId,
            ])
          ).length
        )
          throw new GameError('Choose an owned card for your profile.');
      }
      await sql(
        'UPDATE profiles SET avatar_card=$1,profile_revision=profile_revision+1 WHERE id=$2',
        [cardId, id],
      );
    });
  }
  async setTitle(id: string, titleId: unknown) {
    await this.db.tx(async (sql) => {
      if (
        titleId !== null &&
        !(await titlesFor(sql, id)).some((t) => t.id === titleId && t.unlocked)
      )
        throw new GameError('Earn this title before equipping it.');
      await sql(
        'UPDATE profiles SET selected_title=$1,profile_revision=profile_revision+1 WHERE id=$2',
        [titleId, id],
      );
    });
  }
  private async rankedEligible(sql: Sql, id: string) {
    const [p] = await sql<{
      is_bot: boolean;
      ranked_acknowledged: boolean;
      bot_difficulty: string;
    }>('SELECT is_bot,ranked_acknowledged,bot_difficulty FROM profiles WHERE id=$1', [id]);
    if (p.is_bot) {
      if (p.bot_difficulty === 'easy')
        throw new GameError('Ranked allows Medium and Hard bots only.', 403);
    }
  }
  async acknowledgeRanked(id: string) {
    await this.db.read((sql) =>
      sql('UPDATE profiles SET ranked_acknowledged=true WHERE id=$1', [id]),
    );
  }
  async completeTutorial(id: string) {
    await this.db.read((sql) =>
      sql('UPDATE profiles SET tutorial_completed=true WHERE id=$1', [id]),
    );
  }
  /** Socket presence never counts as a move: a connected AFK player still times out. */
  async presence(profileId: string, online: boolean) {
    return this.db.tx(async (sql) => {
      const matches = await sql<MatchRow>(
        "SELECT * FROM matches WHERE status IN('playing','drafting') AND mode<>'correspondence' AND (player0=$1 OR player1=$1)",
        [profileId],
      );
      for (const m of matches) {
        if (await this.expireInactivity(sql, m)) continue;
        const seat = m.player0 === profileId ? 0 : 1;
        // Repeated disconnects/restarts cannot extend the grace period.
        m.disconnected_at[seat] = online ? null : (m.disconnected_at[seat] ?? Date.now());
        await sql('UPDATE matches SET disconnected_at=$1::jsonb WHERE id=$2', [
          JSON.stringify(m.disconnected_at),
          m.id,
        ]);
      }
      return matches.length > 0;
    });
  }
  async recoverPresence() {
    const players = await this.db.read((sql) =>
      sql<{ id: string }>(
        "SELECT DISTINCT p.id FROM profiles p JOIN matches m ON (m.player0=p.id OR m.player1=p.id) WHERE NOT p.is_bot AND m.mode<>'correspondence' AND m.status IN('playing','drafting')",
      ),
    );
    for (const p of players) await this.presence(p.id, false);
  }
  private async expireInactivity(sql: Sql, m: MatchRow, now = Date.now()) {
    if (m.status === 'complete' || m.mode === 'correspondence') return false;
    const people = await sql<{ id: string; is_bot: boolean }>(
      'SELECT id,is_bot FROM profiles WHERE id=$1 OR id=$2',
      [m.player0, m.player1],
    );
    const expired: { seat: Player; at: number; reason: string }[] = [];
    for (const seat of [0, 1] as const) {
      const id = seat === 0 ? m.player0 : m.player1;
      if (!id || people.find((p) => p.id === id)?.is_bot) continue;
      const disconnected = m.disconnected_at[seat];
      if (disconnected !== null && now >= disconnected + 120000)
        expired.push({ seat, at: disconnected + 120000, reason: 'disconnected for 120 seconds' });
      if (m.status === 'drafting' && !m.decks[seat].length && now >= m.activity_at[seat] + 120000)
        expired.push({
          seat,
          at: m.activity_at[seat] + 120000,
          reason: 'inactive for 120 seconds',
        });
    }
    if (!expired.length) return false;
    // If both have gone away, settle once against the player whose grace expired first.
    const first = expired.sort((a, b) => a.at - b.at || a.seat - b.seat)[0];
    await this.finish(sql, m, (1 - first.seat) as Player, first.reason);
    return true;
  }
  async tick() {
    return this.db.tx(async (sql) => {
      const active = await sql<MatchRow>(
        `SELECT * FROM matches WHERE status IN('playing','drafting') AND mode<>'correspondence' AND
        (deadline<=$1 OR (disconnected_at->>0)::bigint<=$2 OR (disconnected_at->>1)::bigint<=$2 OR
        (status='drafting' AND ((jsonb_array_length(decks->0)=0 AND (activity_at->>0)::bigint<=$2) OR
        (jsonb_array_length(decks->1)=0 AND (activity_at->>1)::bigint<=$2))))`,
        [Date.now(), Date.now() - 120000],
      );
      const changed: string[] = [];
      for (const m of active) if (await this.expireInactivity(sql, m)) changed.push(m.id);
      const due = await sql<MatchRow>(
        "SELECT * FROM matches WHERE (status IN('playing','drafting') AND deadline<=$1) OR (status='complete' AND settlement_done=false AND claim_deadline<=$1) ORDER BY (mode='correspondence'),deadline LIMIT 20",
        [Date.now()],
      );
      for (const m of due) {
        if (m.status === 'complete') {
          if (m.winner !== null) {
            const pool = m.decks[1 - m.winner];
            await this.claim(sql, m, pool[randomInt(pool.length)]);
          }
          changed.push(m.id);
          continue;
        }
        if (m.status === 'drafting') {
          if (m.shared_draft) {
            await this.timeoutSharedDraft(sql, m);
            changed.push(m.id);
            continue;
          }
          for (let seat = 0; seat < 2; seat++)
            if (!m.decks[seat].length)
              m.decks[seat] = randomDeck(cards(m.pools![seat]), rng()).map((c) => c.id);
          const state = createGame([cards(m.decks[0]), cards(m.decks[1])], m.rules, rng());
          await sql(
            "UPDATE matches SET decks=$1::jsonb,state=$2::jsonb,status='playing',version=version+1,deadline=$3 WHERE id=$4",
            [JSON.stringify(m.decks), JSON.stringify(state), Date.now() + 60000, m.id],
          );
          changed.push(m.id);
          continue;
        }
        if (await this.timeoutTurn(sql, m)) changed.push(m.id);
      }
      await sql(
        "UPDATE lobbies SET status='closed' WHERE status='waiting' AND created_at<now()-interval '15 minutes'",
      );
      return changed;
    });
  }
  private async timeoutTurn(sql: Sql, m: MatchRow) {
    if (!m.state) return false;
    const seat = m.state.turn;
    if (m.mode === 'correspondence') {
      await this.finish(sql, m, (1 - seat) as Player, 'turn deadline expired');
      return true;
    }
    let move;
    if (m.mode === 'solo' && seat === 1)
      move = chooseCpuMove(cpuView(m.state), m.difficulty || 'easy', rng(), m.cpu_style);
    else {
      m.auto_turns[seat]++;
      if (m.auto_turns[seat] >= 2) {
        await this.finish(sql, m, (1 - seat) as Player, 'two consecutive missed turns');
        return true;
      }
      await sql('UPDATE matches SET auto_turns=$1::jsonb WHERE id=$2', [
        JSON.stringify(m.auto_turns),
        m.id,
      ]);
      const moves = legalMoves(m.state);
      move = moves[randomInt(moves.length)];
    }
    if (move) await this.advance(sql, m, applyMove(m.state, move));
    return !!move;
  }
}
