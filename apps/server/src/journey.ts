import { randomUUID } from 'node:crypto';
import {
  CURRENT_SEASON,
  JOURNEY_CHAPTERS,
  WEEKLY_OBJECTIVES,
  WEEKLY_REQUIRED,
  WEEKLY_REWARD,
  type JourneyView,
  type SeasonRecord,
  type WeeklyView,
} from '@gacha-triad/shared/journey';
import { RATED_MODES, modeRatingField } from '@gacha-triad/shared/platform';
import type { Database, Sql } from './database';
import { GameError } from './errors';

export function weekWindow(now = Date.now()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return {
    week: start.toISOString().slice(0, 10),
    start: start.toISOString(),
    resetAt: new Date(start.getTime() + 7 * 86400000).toISOString(),
  };
}
// Only natural nine-turn finishes count. Forfeits, timeouts and admin results cannot farm objectives.
const fullDuel =
  "status='complete' AND end_reason IS NULL AND jsonb_array_length(state->'history')=9";
export class PlayerJourney {
  constructor(
    readonly db: Database,
    private clock = () => Date.now(),
  ) {}
  private async weekly(
    sql: Sql,
    profileId: string,
    accountId: string,
    registered: boolean,
  ): Promise<WeeklyView> {
    const window = weekWindow(this.clock());
    const [counts] = await sql<Record<string, number>>(
      `
      WITH duels AS (SELECT mode FROM matches WHERE (player0=$1 OR player1=$1) AND ${fullDuel} AND completed_at >= $2::timestamptz AND completed_at < $3::timestamptz)
      SELECT (SELECT count(*)::int FROM duels) AS duels,
      (SELECT count(DISTINCT mode)::int FROM duels) AS modes,
      (SELECT count(*)::int FROM duels WHERE mode IN('custom','roulette')) AS variant,
      (SELECT count(*)::int FROM daily_puzzle_runs WHERE profile_id=$1 AND solved_at >= $2::timestamptz AND solved_at < $3::timestamptz) AS puzzle,
      (SELECT count(*)::int FROM booster_packs WHERE profile_id=$1 AND source<>'starter' AND opened_at >= $2::timestamptz AND opened_at < $3::timestamptz) AS boosters,
      (SELECT count(*)::int FROM journey_deck_weeks WHERE profile_id=$1 AND week_start=$4::date) AS deck`,
      [profileId, window.start, window.resetAt, window.week],
    );
    const claimed =
      (
        await sql('SELECT 1 FROM weekly_claims WHERE account_id=$1 AND week_start=$2::date', [
          accountId,
          window.week,
        ])
      ).length > 0;
    const objectives = WEEKLY_OBJECTIVES.map((objective) => ({
      id: objective.id,
      progress: Math.min(objective.target, counts[objective.id] ?? 0),
    }));
    return {
      week: window.week,
      resetAt: window.resetAt,
      required: WEEKLY_REQUIRED,
      reward: WEEKLY_REWARD,
      claimed,
      registered,
      completed: objectives.filter((row, index) => row.progress >= WEEKLY_OBJECTIVES[index].target)
        .length,
      objectives,
    };
  }
  async view(profileId: string, accountId: string, registered: boolean): Promise<JourneyView> {
    return this.db.tx(async (sql) => {
      const [facts] = await sql<Record<string, boolean>>(
        `SELECT
        (SELECT tutorial_completed FROM profiles WHERE id=$1) AS learn,
        EXISTS(SELECT 1 FROM booster_packs WHERE profile_id=$1 AND opened_at IS NOT NULL) AS booster,
        EXISTS(SELECT 1 FROM matches WHERE (player0=$1 OR player1=$1) AND ${fullDuel}) AS duel,
        EXISTS(SELECT 1 FROM daily_puzzle_runs WHERE profile_id=$1 AND solved_at IS NOT NULL) AS puzzle,
        EXISTS(SELECT 1 FROM matches WHERE (player0=$1 OR player1=$1) AND ${fullDuel} AND mode IN('draft','shared-draft')) AS draft,
        EXISTS(SELECT 1 FROM duplicate_actions WHERE profile_id=$1) AS duplicates,
        EXISTS(SELECT 1 FROM trade_offers WHERE (owner_id=$1 OR taker_id=$1) AND status='accepted' AND wanted_card IS NOT NULL) AS market`,
        [profileId],
      );
      const completed = JOURNEY_CHAPTERS.filter((chapter) => facts[chapter.id]).map(
        (chapter) => chapter.id,
      );
      if (completed.length)
        await sql(
          'INSERT INTO journey_stamps(profile_id,chapter) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING',
          [profileId, completed],
        );
      const stamps = await sql<{ chapter: string }>(
        'SELECT chapter FROM journey_stamps WHERE profile_id=$1',
        [profileId],
      );
      const records = await sql<SeasonRecord>(
        `SELECT mode,
        count(*)::int AS games,
        count(*) FILTER(WHERE (m.winner=0 AND m.player0=$1) OR (m.winner=1 AND m.player1=$1))::int AS wins,
        count(*) FILTER(WHERE m.is_draw)::int AS draws,
        count(*) FILTER(WHERE NOT m.is_draw AND NOT ((m.winner=0 AND m.player0=$1) OR (m.winner=1 AND m.player1=$1)))::int AS losses
        FROM match_ratings r JOIN matches m ON m.id=r.match_id WHERE r.profile_id=$1 AND m.season=$2 GROUP BY mode`,
        [profileId, CURRENT_SEASON.id],
      );
      const [p] = await sql<Record<ReturnType<typeof modeRatingField>, number>>(
        'SELECT rating,ranked_random_rating,draft_rating,shared_draft_rating FROM profiles WHERE id=$1',
        [profileId],
      );
      return {
        weekly: await this.weekly(sql, profileId, accountId, registered),
        chapters: JOURNEY_CHAPTERS.map((chapter) => ({
          id: chapter.id,
          completed: stamps.some((s) => s.chapter === chapter.id),
        })),
        season: CURRENT_SEASON,
        records: RATED_MODES.map((mode) => ({
          mode,
          games: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          ...records.find((r) => r.mode === mode),
          rating: p[modeRatingField(mode)],
        })),
      };
    });
  }
  async claim(profileId: string, accountId: string, registered: boolean, week: unknown) {
    if (!registered) throw new GameError('Register an account to claim weekly rewards.', 403);
    return this.db.tx(async (sql) => {
      const current = await this.weekly(sql, profileId, accountId, registered);
      if (week !== current.week)
        throw new GameError('A new week has started. Refresh your objectives.', 409);
      if (current.claimed) return { ok: true, awarded: 0 };
      if (current.completed < current.required)
        throw new GameError(`Complete ${WEEKLY_REQUIRED} weekly objectives before claiming.`, 409);
      const inserted = await sql(
        'INSERT INTO weekly_claims(account_id,week_start) VALUES($1,$2::date) ON CONFLICT DO NOTHING RETURNING account_id',
        [accountId, current.week],
      );
      if (!inserted.length) return { ok: true, awarded: 0 };
      const credited = await sql(
        'UPDATE profiles SET prisms=prisms+$1 WHERE id=$2 AND prisms<=2147483647-$1 RETURNING id',
        [WEEKLY_REWARD, profileId],
      );
      if (!credited.length) throw new GameError('Currency balance limit reached.', 409);
      await sql(
        "INSERT INTO prism_ledger(id,profile_id,delta,kind,reference) VALUES($1,$2,$3,'weekly-journey',$4)",
        [randomUUID(), profileId, WEEKLY_REWARD, `weekly-journey:${current.week}:${accountId}`],
      );
      return { ok: true, awarded: WEEKLY_REWARD };
    });
  }
}
