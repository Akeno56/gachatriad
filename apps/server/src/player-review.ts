import type { Database } from './database';
import { GameError } from './errors';
export class PlayerReview {
  constructor(readonly db: Database) {}
  async history(profileId: string, offset = 0) {
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000)
      throw new GameError('Invalid history page.');
    return this.db.read(async (sql) => {
      const [person] = await sql<{ id: string; name: string }>(
        'SELECT id,name FROM profiles WHERE id=$1',
        [profileId],
      );
      if (!person) throw new GameError('Player not found.', 404);
      const rows = await sql(
        `SELECT m.id,m.mode,m.created_at,m.completed_at,m.end_reason,
        CASE WHEN m.player0=$1 THEN m.player1 ELSE m.player0 END AS opponent_id,
        coalesce(o.name,'CPU') AS opponent,
        CASE WHEN m.is_draw THEN 'draw' WHEN m.winner=CASE WHEN m.player0=$1 THEN 0 ELSE 1 END THEN 'win' ELSE 'loss' END AS result,
        m.trade_rule,m.claimed_card,m.settlement_done,r.before_rating,r.after_rating,
        jsonb_array_length(coalesce(m.state->'history','[]'::jsonb)) AS turns
        FROM matches m LEFT JOIN profiles o ON o.id=CASE WHEN m.player0=$1 THEN m.player1 ELSE m.player0 END
        LEFT JOIN match_ratings r ON r.match_id=m.id AND r.profile_id=$1
        WHERE (m.player0=$1 OR m.player1=$1) AND m.status='complete'
        ORDER BY m.completed_at DESC,m.id DESC LIMIT 100 OFFSET $2`,
        [profileId, offset],
      );
      const [total] = await sql<{ count: number }>(
        "SELECT count(*)::int AS count FROM matches WHERE (player0=$1 OR player1=$1) AND status='complete'",
        [profileId],
      );
      const pairs = await sql<{
        opponent_id: string;
        opponent: string;
        mode: string;
        games: number;
        wins: number;
        losses: number;
        draws: number;
        longest_win_streak: number;
      }>(
        `WITH results AS (
        SELECT CASE WHEN m.player0=$1 THEN m.player1 ELSE m.player0 END AS opponent_id,m.mode,m.completed_at,m.id,
        CASE WHEN m.is_draw THEN 'draw' WHEN m.winner=CASE WHEN m.player0=$1 THEN 0 ELSE 1 END THEN 'win' ELSE 'loss' END AS result
        FROM matches m WHERE (m.player0=$1 OR m.player1=$1) AND m.status='complete' AND m.mode IN('ranked','draft') AND coalesce(m.end_reason,'')<>'admin test result'
      ), runs AS (
        SELECT *,sum(CASE WHEN result='win' THEN 0 ELSE 1 END) OVER(PARTITION BY opponent_id,mode ORDER BY completed_at,id) AS run FROM results
      ), streaks AS (
        SELECT opponent_id,mode,max(n)::int AS longest FROM (SELECT opponent_id,mode,run,count(*) FILTER(WHERE result='win') AS n FROM runs GROUP BY opponent_id,mode,run) s GROUP BY opponent_id,mode
      ) SELECT r.opponent_id,coalesce(p.name,'CPU') AS opponent,r.mode,count(*)::int AS games,
        count(*) FILTER(WHERE result='win')::int AS wins,count(*) FILTER(WHERE result='loss')::int AS losses,count(*) FILTER(WHERE result='draw')::int AS draws,
        coalesce(max(s.longest),0)::int AS longest_win_streak
        FROM results r LEFT JOIN profiles p ON p.id=r.opponent_id LEFT JOIN streaks s ON s.opponent_id=r.opponent_id AND s.mode=r.mode
        GROUP BY r.opponent_id,p.name,r.mode ORDER BY games DESC,opponent LIMIT 100`,
        [profileId],
      );
      return { person, rows, total: total.count, offset, pairs };
    });
  }
  async collection(profileId: string) {
    return this.db.read((sql) =>
      sql(
        `SELECT i.card_id AS id,i.quantity,i.reserved,d.definition AS card FROM inventory i JOIN card_definitions d ON d.id=i.card_id WHERE i.profile_id=$1 AND i.quantity>0 ORDER BY (d.definition->>'rarity')::int DESC,d.definition->>'name',i.card_id`,
        [profileId],
      ),
    );
  }
}
