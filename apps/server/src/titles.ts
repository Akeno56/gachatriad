import { TITLES, type TitleView } from '@gacha-triad/shared/social';
import type { Sql } from './database';
export function titleName(id: unknown) {
  if (typeof id === 'string' && id.startsWith('event-title:'))
    return /^event-title:[^:]+:\d+:(.+)$/.exec(id)?.[1] ?? null;
  return TITLES.find((t) => t.id === id)?.name ?? null;
}
export async function awardRankTitles(sql: Sql) {
  await sql(`WITH standings AS (
    SELECT p.id,count(m.id) AS games,row_number() OVER(ORDER BY p.rating DESC,count(m.id) DESC,p.name,p.id)::int AS place
    FROM profiles p JOIN profile_accounts a ON a.profile_id=p.id AND a.is_primary JOIN "user" u ON u.id=a.auth_user_id
    LEFT JOIN server_suspensions s ON s.auth_user_id=u.id
    JOIN matches m ON (m.player0=p.id OR m.player1=p.id) AND m.mode='ranked' AND m.status='complete'
    AND coalesce(m.end_reason,'')<>'admin test result'
    AND NOT EXISTS(SELECT 1 FROM profiles bot WHERE bot.is_bot AND bot.id IN(m.player0,m.player1))
    WHERE NOT p.is_bot AND NOT coalesce(u."isAnonymous",false) AND s.auth_user_id IS NULL GROUP BY p.id
  ) UPDATE profiles p SET best_ranked_position=least(coalesce(p.best_ranked_position,standings.place),standings.place)
    FROM standings WHERE p.id=standings.id AND standings.place<=10 AND standings.games>=5`);
}
export async function titlesFor(sql: Sql, id: string): Promise<TitleView[]> {
  const [p] = await sql<{
    rating: number;
    best_ranked_position: number | null;
    achievements: string[];
    event_titles: string[];
    enough_ranked_games: boolean;
  }>(
    `SELECT peak_rating AS rating,best_ranked_position,
       ARRAY(SELECT achievement_id FROM achievement_unlocks WHERE profile_id=$1) AS achievements,
       ARRAY(SELECT title_id FROM lobby_event_awards WHERE profile_id=$1 AND title_id IS NOT NULL ORDER BY title_id) AS event_titles,
       EXISTS(SELECT 1 FROM matches m WHERE mode='ranked' AND status='complete'
         AND coalesce(m.end_reason,'')<>'admin test result' AND (player0=$1 OR player1=$1)
         AND NOT EXISTS(SELECT 1 FROM profiles bot WHERE bot.is_bot AND bot.id IN(m.player0,m.player1))
         OFFSET 4) AS enough_ranked_games
     FROM profiles WHERE id=$1`,
    [id],
  );
  const earned = new Set(p.achievements);
  const titles = TITLES.map((t) => ({
    id: t.id,
    name: t.name,
    requirement: t.requirement,
    unlocked:
      'achievement' in t
        ? earned.has(t.achievement)
        : 'rank' in t
          ? p.best_ranked_position !== null && p.best_ranked_position <= t.rank
          : p.rating >= t.rating && p.enough_ranked_games,
  }));
  return [
    ...titles,
    ...p.event_titles.map((id) => ({
      id,
      name: titleName(id)!,
      requirement: 'Earned in a lobby event.',
      unlocked: true,
    })),
  ];
}
