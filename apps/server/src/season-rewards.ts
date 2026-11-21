import { ASTRAL_REWARDS } from '@gacha-triad/shared/customization';
import { RATED_MODES } from '@gacha-triad/shared/platform';
import type { Sql } from './database';

export async function astralRewardGames(sql: Sql, profileId: string) {
  // The rating ledger excludes bots, shared-network games and unrated practice.
  const [row] = await sql<{ games: number }>(
    `SELECT count(*)::int AS games FROM (
       SELECT 1 FROM match_ratings r JOIN matches m ON m.id=r.match_id
       WHERE r.profile_id=$1 AND m.season=$2 AND m.mode=ANY($3::text[])
       AND m.status='complete' AND m.end_reason IS NULL
       LIMIT $4
     ) AS eligible`,
    [profileId, ASTRAL_REWARDS.seasonId, RATED_MODES, ASTRAL_REWARDS.banner.games],
  );
  return row.games;
}
