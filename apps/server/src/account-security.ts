import { isIP } from 'node:net';
import type { Database } from './database';
import { GameError } from './errors';

/** IPs come only from Fastify's trusted edge, never from auth payloads. */
export class AccountSecurity {
  private signupTail = Promise.resolve();
  constructor(readonly db: Database) {}
  async address(input: string) {
    const raw = input.startsWith('::ffff:') ? input.slice(7) : input;
    if (!isIP(raw)) throw new GameError('Your network address could not be verified.', 400);
    return this.db.read(
      async (sql) =>
        (
          await sql<{ ip: string; network: string }>(
            'SELECT host($1::inet) AS ip, CASE WHEN family($1::inet)=6 THEN network(set_masklen($1::inet,64))::text ELSE host($1::inet) END AS network',
            [raw],
          )
        )[0],
    );
  }
  async assertAllowed(ip: string) {
    const address = await this.address(ip);
    const rows = await this.db.read((sql) =>
      sql('SELECT 1 FROM account_networks WHERE network=$1 AND blocked', [address.network]),
    );
    if (rows.length)
      throw new GameError(
        'Access from this network has been blocked. Contact the administrator.',
        403,
      );
    return address;
  }
  async remember(userId: string, ip: string) {
    const address = await this.assertAllowed(ip);
    await this.db.read((sql) =>
      sql(
        `INSERT INTO account_ips(user_id,ip,network)
      SELECT id,$2,$3 FROM "user" WHERE id=$1 AND NOT coalesce("isAnonymous",false)
      ON CONFLICT(user_id,ip) DO UPDATE SET last_seen=now() WHERE account_ips.last_seen < now()-interval '5 minutes'`,
        [userId, address.ip, address.network],
      ),
    );
    return address.ip;
  }
  async signup<T>(ip: string, work: () => Promise<T>): Promise<T> {
    // Serialize the complete auth operation so simultaneous signups cannot both pass.
    const previous = this.signupTail;
    let unlock!: () => void;
    this.signupTail = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    await previous;
    try {
      const address = await this.assertAllowed(ip);
      if (
        process.env.NODE_ENV !== 'production' &&
        process.env.ALLOW_SHARED_TEST_NETWORK === 'true' &&
        (address.ip === '127.0.0.1' || address.ip === '::1')
      )
        return await work();
      const occupied = await this.db.read((sql) =>
        sql(
          `SELECT 1 FROM account_ips i JOIN "user" u ON u.id=i.user_id
        WHERE i.network=$1 AND NOT coalesce(u."isAnonymous",false)
        AND NOT EXISTS(SELECT 1 FROM account_networks n WHERE n.network=$1 AND n.allow_shared) LIMIT 1`,
          [address.network],
        ),
      );
      if (occupied.length)
        throw new GameError(
          'Only one registered account is allowed per IP. Sign in to your existing account or contact the administrator for a shared-network exception.',
          403,
        );
      return await work();
    } finally {
      unlock();
    }
  }
  async action(network: unknown, action: unknown, note: unknown) {
    if (
      typeof network !== 'string' ||
      !['block', 'unblock', 'allow-shared', 'restrict-shared'].includes(String(action))
    )
      throw new GameError('Choose a network and a valid restriction.');
    const address = await this.address(network.split('/')[0]);
    await this.db.tx(async (sql) => {
      await sql('INSERT INTO account_networks(network) VALUES($1) ON CONFLICT DO NOTHING', [
        address.network,
      ]);
      if (action === 'block' || action === 'unblock')
        await sql('UPDATE account_networks SET blocked=$2 WHERE network=$1', [
          address.network,
          action === 'block',
        ]);
      else
        await sql('UPDATE account_networks SET allow_shared=$2 WHERE network=$1', [
          address.network,
          action === 'allow-shared',
        ]);
      await sql('INSERT INTO security_log(action,network,note) VALUES($1,$2,$3)', [
        action,
        address.network,
        typeof note === 'string' ? note.slice(0, 200) : '',
      ]);
    });
    return address.network;
  }
}
