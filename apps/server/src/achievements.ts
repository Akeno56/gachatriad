import { randomUUID } from 'node:crypto';
import {
  ACHIEVEMENTS,
  type AchievementStat,
  type AchievementView,
  type Mode,
} from '@gacha-triad/shared/platform';
import type { Sql } from './database';
import { GameError } from './errors';

const matchStats = [
  'played',
  'wins',
  'draws',
  'same_captures',
  'plus_captures',
  'best_combo',
  'combo_captures',
  'perfect_wins',
  'rated_cosmetic_games',
] as const;

const fullMatch =
  "m.status='complete' AND m.end_reason IS NULL AND jsonb_array_length(m.state->'history')=9";

const progressSources: Record<AchievementStat, string> = {
  played: 'p.played',
  wins: 'p.wins',
  draws: 'p.draws',
  same_captures: 'p.same_captures',
  plus_captures: 'p.plus_captures',
  best_combo: 'p.best_combo',
  combo_captures: 'p.combo_captures',
  perfect_wins: 'p.perfect_wins',
  rated_cosmetic_games: 'p.rated_cosmetic_games',
  trade_wins: 'p.trade_wins',
  collection: `(SELECT count(DISTINCT coalesce(d.definition->>'baseCardId',i.card_id))::int
    FROM inventory i JOIN card_definitions d ON d.id=i.card_id WHERE i.profile_id=p.id AND i.quantity>0)`,
  holos: `(SELECT count(*)::int FROM inventory i JOIN card_definitions d ON d.id=i.card_id
    WHERE i.profile_id=p.id AND i.quantity>0 AND d.definition->>'finish'='holo')`,
  boosters: `(SELECT count(*)::int FROM booster_packs b
    WHERE b.profile_id=p.id AND b.source<>'starter' AND b.opened_at IS NOT NULL)`,
  trade_ups: `(EXISTS(SELECT 1 FROM duplicate_actions d WHERE d.profile_id=p.id AND d.kind='trade-up'))::int`,
  card_swaps: `(EXISTS(SELECT 1 FROM trade_offers t WHERE (t.owner_id=p.id OR t.taker_id=p.id)
    AND t.status='accepted' AND t.wanted_card IS NOT NULL))::int`,
  puzzle_solves: `(SELECT count(*)::int FROM daily_puzzle_runs r WHERE r.profile_id=p.id AND r.solved_at IS NOT NULL)`,
  ranked_random_finishes: ratedFinish('ranked-random'),
  draft_finishes: ratedFinish('draft'),
  shared_draft_finishes: ratedFinish('shared-draft'),
  correspondence_finishes: `(EXISTS(SELECT 1 FROM matches m WHERE (m.player0=p.id OR m.player1=p.id)
    AND m.mode='correspondence' AND ${fullMatch}))::int`,
};

function ratedFinish(mode: 'ranked-random' | 'draft' | 'shared-draft') {
  return `(EXISTS(SELECT 1 FROM match_ratings r JOIN matches m ON m.id=r.match_id
    WHERE r.profile_id=p.id AND m.mode='${mode}' AND ${fullMatch}))::int`;
}

const formatStat: Partial<Record<Mode, AchievementStat>> = {
  'ranked-random': 'ranked_random_finishes',
  draft: 'draft_finishes',
  'shared-draft': 'shared_draft_finishes',
  correspondence: 'correspondence_finishes',
};

export function syncDuelAchievements(sql: Sql, profileId: string, mode: Mode, full: boolean) {
  const format = formatStat[mode];
  return syncAchievements(sql, profileId, full && format ? [...matchStats, format] : matchStats);
}

type Progress = Partial<Record<AchievementStat, number>>;

export async function syncAchievements(
  sql: Sql,
  profileId: string,
  stats = Object.keys(progressSources) as readonly AchievementStat[],
): Promise<Progress> {
  const columns = stats.map((stat) => `${progressSources[stat]} AS ${stat}`);
  const [current] = await sql<Progress & { earned: string[] }>(
    `SELECT ${columns.join(',')}, ARRAY(SELECT achievement_id FROM achievement_unlocks
      WHERE profile_id=p.id) AS earned FROM profiles p WHERE p.id=$1 AND NOT p.is_bot`,
    [profileId],
  );
  if (!current) return {};
  const earned = new Set(current.earned);
  const unlocked = ACHIEVEMENTS.filter(
    (a) => !earned.has(a.id) && (current[a.stat] ?? 0) >= a.target,
  );
  if (unlocked.length)
    await sql(
      'INSERT INTO achievement_unlocks(profile_id,achievement_id) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING',
      [profileId, unlocked.map(({ id }) => id)],
    );
  return current;
}

export async function achievementViews(sql: Sql, profileId: string): Promise<AchievementView[]> {
  const progress = await syncAchievements(sql, profileId);
  const rows = await sql<{
    achievement_id: string;
    unlocked_at: Date;
    reward_claimed_at: Date | null;
  }>(
    'SELECT achievement_id,unlocked_at,reward_claimed_at FROM achievement_unlocks WHERE profile_id=$1',
    [profileId],
  );
  const unlocked = new Map(rows.map((row) => [row.achievement_id, row]));
  return ACHIEVEMENTS.map((a) => {
    const row = unlocked.get(a.id);
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      target: a.target,
      reward: a.reward,
      progress: row ? a.target : Math.min(a.target, progress[a.stat] ?? 0),
      unlockedAt: row?.unlocked_at.toISOString() ?? null,
      rewardClaimed: !!row?.reward_claimed_at,
    };
  });
}

export async function claimAchievementReward(sql: Sql, profileId: string, id: string) {
  const achievement = ACHIEVEMENTS.find((a) => a.id === id);
  const reward = achievement?.reward;
  if (!achievement || (reward?.kind !== 'prisms' && reward?.kind !== 'booster'))
    throw new GameError('This achievement has no reward to claim.', 404);
  await syncAchievements(sql, profileId, [achievement.stat]);
  const [entry] = await sql<{ reward_claimed_at: Date | null }>(
    'SELECT reward_claimed_at FROM achievement_unlocks WHERE profile_id=$1 AND achievement_id=$2',
    [profileId, id],
  );
  if (!entry) throw new GameError('Unlock this achievement before claiming its reward.', 409);
  const claimed = await sql(
    `UPDATE achievement_unlocks SET reward_claimed_at=now()
     WHERE profile_id=$1 AND achievement_id=$2 AND reward_claimed_at IS NULL RETURNING achievement_id`,
    [profileId, id],
  );
  if (!claimed.length) return { claimed: false };
  const reference = `achievement:${id}`;
  if (reward.kind === 'prisms') {
    const credited = await sql(
      'UPDATE profiles SET prisms=prisms+$1 WHERE id=$2 AND prisms<=2147483647-$1 RETURNING id',
      [reward.amount, profileId],
    );
    if (!credited.length) throw new GameError('Currency balance limit reached.', 409);
    await sql(
      "INSERT INTO prism_ledger(id,profile_id,delta,kind,reference) VALUES($1,$2,$3,'achievement',$4)",
      [randomUUID(), profileId, reward.amount, reference],
    );
  } else {
    // Use the existing grant source so older releases can still open these packs.
    await sql(
      "INSERT INTO booster_packs(id,profile_id,source,request_id,pack_type) VALUES($1,$2,'admin',$3,'standard')",
      [randomUUID(), profileId, reference],
    );
  }
  return { claimed: true };
}
