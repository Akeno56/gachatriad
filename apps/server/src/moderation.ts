import { randomUUID } from 'node:crypto';
import type { Database } from './database';
import { GameError } from './errors';

export class Moderation {
  constructor(readonly db: Database) {}
  async users(search = '') {
    return this.db.read((sql) =>
      sql<{
        id: string;
        name: string;
        registered: boolean;
        isAdmin: boolean;
        suspended: boolean;
        reason: string;
      }>(
        `SELECT DISTINCT p.id,p.name,NOT coalesce(u."isAnonymous",false) AS registered,
      (ad.auth_user_id IS NOT NULL AND NOT coalesce(u."isAnonymous",false)) AS "isAdmin",
      (s.auth_user_id IS NOT NULL) AS suspended,coalesce(s.reason,'') AS reason
      FROM profiles p JOIN profile_accounts a ON a.profile_id=p.id JOIN "user" u ON u.id=a.auth_user_id
      LEFT JOIN server_admins ad ON ad.auth_user_id=u.id LEFT JOIN server_suspensions s ON s.auth_user_id=u.id
      WHERE NOT p.is_bot AND (p.name ILIKE $1 OR p.id ILIKE $1) ORDER BY p.name,p.id LIMIT 200`,
        [`%${search.slice(0, 100)}%`],
      ),
    );
  }
  async action(profileId: unknown, action: unknown, reason: unknown) {
    if (
      typeof profileId !== 'string' ||
      !['promote', 'demote', 'suspend', 'restore', 'disconnect'].includes(String(action))
    )
      throw new GameError('Choose a player and a valid moderation action.');
    const note = typeof reason === 'string' ? reason.slice(0, 200) : '';
    return this.db.tx(async (sql) => {
      const [target] = await sql<{ id: string; guest: boolean }>(
        `SELECT u.id,coalesce(u."isAnonymous",false) AS guest
        FROM "user" u JOIN profile_accounts a ON a.auth_user_id=u.id JOIN profiles p ON p.id=a.profile_id
        WHERE p.id=$1 AND NOT p.is_bot ORDER BY a.is_primary DESC LIMIT 1`,
        [profileId],
      );
      if (!target) throw new GameError('Player not found.', 404);
      if (action === 'promote' && target.guest)
        throw new GameError('Only registered accounts can become administrators.');
      if (action === 'promote')
        await sql('INSERT INTO server_admins(auth_user_id) VALUES($1) ON CONFLICT DO NOTHING', [
          target.id,
        ]);
      if (action === 'demote')
        await sql('DELETE FROM server_admins WHERE auth_user_id=$1', [target.id]);
      if (action === 'suspend')
        await sql(
          'INSERT INTO server_suspensions(auth_user_id,reason) VALUES($1,$2) ON CONFLICT(auth_user_id) DO UPDATE SET reason=excluded.reason',
          [target.id, note],
        );
      if (action === 'restore')
        await sql('DELETE FROM server_suspensions WHERE auth_user_id=$1', [target.id]);
      await sql('INSERT INTO moderation_log(id,auth_user_id,action,reason) VALUES($1,$2,$3,$4)', [
        randomUUID(),
        target.id,
        action,
        note,
      ]);
      return (
        await sql<{ profile_id: string }>(
          'SELECT profile_id FROM profile_accounts WHERE auth_user_id=$1',
          [target.id],
        )
      ).map((p) => p.profile_id);
    });
  }
  async log() {
    return this.db.read((sql) =>
      sql(
        'SELECT l.action,l.reason,l.created_at,coalesce(u.name,l.auth_user_id) AS name FROM moderation_log l LEFT JOIN "user" u ON u.id=l.auth_user_id ORDER BY l.created_at DESC LIMIT 30',
      ),
    );
  }
}
