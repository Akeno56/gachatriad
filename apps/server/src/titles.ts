import { TITLES, type TitleView } from '@gacha-triad/shared/social';
import type { Sql } from './database';
export function titleName(id: unknown) {
  return TITLES.find((t) => t.id === id)?.name ?? null;
}
export async function titlesFor(sql: Sql, id: string): Promise<TitleView[]> {
  const [p] = await sql<{ rating: number }>(
    'SELECT peak_rating AS rating FROM profiles WHERE id=$1',
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
      'achievement' in t ? earned.has(t.achievement) : p.rating >= t.rating && ranked.n >= 5,
  }));
}
