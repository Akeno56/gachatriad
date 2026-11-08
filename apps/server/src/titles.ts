import { TITLES, type TitleView } from '@gacha-triad/shared/social';
import type { Sql } from './database';
export function titleName(id: unknown) {
  return TITLES.find((t) => t.id === id)?.name ?? null;
}
export async function awardRankTitles(sql: Sql) {
  await sql(`WITH standings AS (
    SELECT p.id,count(m.id) AS games,row_number() OVER(ORDER BY p.rating DESC,count(m.id) DESC,p.name,p.id)::int AS place
    FROM profiles p JOIN profile_accounts a ON a.profile_id=p.id AND a.is_primary JOIN "user" u ON u.id=a.auth_user_id
    LEFT JOIN server_suspensions s ON s.auth_user_id=u.id
    JOIN matches m ON (m.player0=p.id OR m.player1=p.id) AND m.mode='ranked' AND m.status='complete'
    WHERE NOT p.is_bot AND NOT coalesce(u."isAnonymous",false) AND s.auth_user_id IS NULL GROUP BY p.id
  ) UPDATE profiles p SET best_ranked_position=least(coalesce(p.best_ranked_position,standings.place),standings.place)
    FROM standings WHERE p.id=standings.id AND standings.place<=10 AND standings.games>=5`);
}
export async function titlesFor(sql: Sql, id: string): Promise<TitleView[]> {
  const [p] = await sql<{ rating: number; best_ranked_position: number | null }>(
    'SELECT peak_rating AS rating,best_ranked_position FROM profiles WHERE id=$1',
    [id],
  );
  const earned = new Set(
    (
      await sql<{ achievement_id: string }>(
        'SELECT achievement_id FROM achievement_unlocks WHERE profile_id=$1',
        [id],
      )
    ).map((a) => a.achievement_id),
  );
  const [ranked] = await sql<{ n: number }>(
    "SELECT count(*)::int n FROM matches WHERE mode='ranked' AND status='complete' AND (player0=$1 OR player1=$1)",
    [id],
  );
  return TITLES.map((t) => ({
    id: t.id,
    name: t.name,
    requirement: t.requirement,
    unlocked:
      'achievement' in t
        ? earned.has(t.achievement)
        : 'rank' in t
          ? p.best_ranked_position !== null && p.best_ranked_position <= t.rank
          : p.rating >= t.rating && ranked.n >= 5,
  }));
}
