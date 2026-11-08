import type { Sql } from './database';
import type { GameStore } from './store';
import { GameError } from './errors';

/** Delete private guest data; retain anonymized duel/trade history for the other player. */
async function purge(sql: Sql, ids: string[]) {
  if (!ids.length) return;
  await sql(
    "INSERT INTO profiles(id,name,default_deck) VALUES('former-guest','Deleted player','[]') ON CONFLICT DO NOTHING",
  );
  await sql(
    'DELETE FROM friendships WHERE profile_a=ANY($1::text[]) OR profile_b=ANY($1::text[])',
    [ids],
  );
  await sql(
    'DELETE FROM duel_invitations WHERE sender_id=ANY($1::text[]) OR recipient_id=ANY($1::text[])',
    [ids],
  );
  await sql('DELETE FROM chat_messages WHERE profile_id=ANY($1::text[])', [ids]);
  await sql('DELETE FROM card_purchases WHERE profile_id=ANY($1::text[])', [ids]);
  await sql(
    'UPDATE matches SET rematch_requested_by=NULL,rematch_requested_at=NULL WHERE rematch_requested_by=ANY($1::text[])',
    [ids],
  );
  await sql(
    "UPDATE lobbies SET host_id=CASE WHEN host_id=ANY($1::text[]) THEN 'former-guest' ELSE host_id END,guest_id=CASE WHEN guest_id=ANY($1::text[]) THEN 'former-guest' ELSE guest_id END,invited_profile=CASE WHEN invited_profile=ANY($1::text[]) THEN NULL ELSE invited_profile END,status='closed' WHERE host_id=ANY($1::text[]) OR guest_id=ANY($1::text[]) OR invited_profile=ANY($1::text[])",
    [ids],
  );
  await sql(
    "UPDATE matches SET player0=CASE WHEN player0=ANY($1::text[]) THEN 'former-guest' ELSE player0 END,player1=CASE WHEN player1=ANY($1::text[]) THEN 'former-guest' ELSE player1 END WHERE player0=ANY($1::text[]) OR player1=ANY($1::text[])",
    [ids],
  );
  await sql(
    "UPDATE trade_offers SET owner_id=CASE WHEN owner_id=ANY($1::text[]) THEN 'former-guest' ELSE owner_id END,taker_id=CASE WHEN taker_id=ANY($1::text[]) THEN 'former-guest' ELSE taker_id END,status=CASE WHEN status='open' THEN 'cancelled' ELSE status END WHERE owner_id=ANY($1::text[]) OR taker_id=ANY($1::text[])",
    [ids],
  );
  for (const table of [
    'inventory_ledger',
    'prism_ledger',
    'admin_grants',
    'booster_packs',
    'achievement_unlocks',
    'inventory',
    'profile_accounts',
  ])
    await sql(`DELETE FROM ${table} WHERE profile_id=ANY($1::text[])`, [ids]);
  await sql('DELETE FROM profiles WHERE id=ANY($1::text[])', [ids]);
}
export class GuestLifecycle {
  constructor(readonly store: GameStore) {}
  async discard(ids: string[]) {
    if (!ids.length) return;
    // Finish unsettled games using the normal transfer/reservation rules before deleting data.
    for (const profileId of ids) {
      const matches = await this.store.db.read((sql) =>
        sql<{
          id: string;
          status: string;
          winner: number | null;
          player0: string;
          player1: string;
          decks: [string[], string[]];
        }>(
          "SELECT * FROM matches WHERE (player0=$1 OR player1=$1) AND (status<>'complete' OR NOT settlement_done)",
          [profileId],
        ),
      );
      for (const m of matches) {
        if (m.status !== 'complete') await this.store.resign(profileId, m.id);
        const winner = await this.store.db.read((sql) =>
          sql<{
            player0: string;
            player1: string;
            winner: number | null;
            decks: [string[], string[]];
            settlement_done: boolean;
          }>('SELECT * FROM matches WHERE id=$1', [m.id]),
        );
        const row = winner[0];
        if (!row.settlement_done && row.winner !== null)
          await this.store.claimCard(
            row.winner === 0 ? row.player0 : row.player1,
            m.id,
            row.decks[1 - row.winner][0],
          );
      }
    }
    await this.store.db.tx((sql) => purge(sql, ids));
  }
  async cleanup() {
    const legacy = await this.store.db.read((sql) =>
      sql<{
        id: string;
      }>(`SELECT DISTINCT p.id FROM profiles p JOIN profile_accounts a ON a.profile_id=p.id
      JOIN "user" u ON u.id=a.auth_user_id WHERE NOT p.is_bot AND NOT a.is_primary AND NOT coalesce(u."isAnonymous",false)
      AND EXISTS(SELECT 1 FROM profile_accounts b WHERE b.auth_user_id=a.auth_user_id AND b.is_primary)
      AND NOT EXISTS(SELECT 1 FROM profile_accounts b WHERE b.profile_id=p.id AND b.is_primary)`),
    );
    await this.discard(legacy.map((p) => p.id));
    const expired = await this.store.db.read((sql) =>
      sql<{ id: string; auth_id: string }>(`SELECT p.id,u.id AS auth_id FROM profiles p
      JOIN profile_accounts a ON a.profile_id=p.id JOIN "user" u ON u.id=a.auth_user_id
      WHERE coalesce(u."isAnonymous",false) AND NOT p.is_bot AND p.last_seen_at<now()-interval '7 days' LIMIT 100`),
    );
    await this.discard(expired.map((p) => p.id));
    const orphaned = await this.store.db.read((sql) =>
      sql<{ auth_id: string }>(`SELECT u.id AS auth_id FROM "user" u
      WHERE coalesce(u."isAnonymous",false) AND NOT EXISTS(SELECT 1 FROM profile_accounts a WHERE a.auth_user_id=u.id)
      AND greatest(u."updatedAt",coalesce((SELECT max(s."updatedAt") FROM session s WHERE s."userId"=u.id),u."createdAt"))<now()-interval '7 days' LIMIT 100`),
    );
    await this.store.db.tx(async (sql) => {
      for (const user of [...expired, ...orphaned]) {
        await sql('DELETE FROM session WHERE "userId"=$1', [user.auth_id]);
        await sql('DELETE FROM account WHERE "userId"=$1', [user.auth_id]);
        await sql('DELETE FROM "user" WHERE id=$1 AND coalesce("isAnonymous",false)', [
          user.auth_id,
        ]);
      }
    });
    return legacy.length + expired.length;
  }
  async deleteAccount(profileId: unknown, confirmation: unknown) {
    if (typeof profileId !== 'string' || typeof confirmation !== 'string')
      throw new GameError('Select an account and confirm its name.');
    const target = await this.store.db.tx(async (sql) => {
      const [target] = await sql<{ auth_id: string; name: string }>(
        `SELECT u.id AS auth_id,p.name FROM profiles p JOIN profile_accounts a ON a.profile_id=p.id
        JOIN "user" u ON u.id=a.auth_user_id WHERE p.id=$1 AND NOT p.is_bot ORDER BY a.is_primary DESC LIMIT 1`,
        [profileId],
      );
      if (!target || target.name !== confirmation) return null;
      await sql(
        "INSERT INTO server_suspensions(auth_user_id,reason) VALUES($1,'Account deletion') ON CONFLICT DO NOTHING",
        [target.auth_id],
      );
      return {
        ...target,
        profiles: (
          await sql<{ profile_id: string }>(
            'SELECT profile_id FROM profile_accounts WHERE auth_user_id=$1',
            [target.auth_id],
          )
        ).map((p) => p.profile_id),
      };
    });
    if (!target) return null;
    await this.discard(target.profiles);
    await this.store.db.tx(async (sql) => {
      await sql('DELETE FROM session WHERE "userId"=$1', [target.auth_id]);
      await sql('DELETE FROM account WHERE "userId"=$1', [target.auth_id]);
      await sql('DELETE FROM "user" WHERE id=$1', [target.auth_id]);
      await sql(
        "INSERT INTO moderation_log(id,auth_user_id,action,reason) VALUES(gen_random_uuid()::text,$1,'delete-account',$2)",
        [target.auth_id, target.name],
      );
    });
    return target.profiles;
  }
}
