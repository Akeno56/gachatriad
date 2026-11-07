import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { anonymous, bearer } from 'better-auth/plugins';
import { getMigrations } from 'better-auth/db/migration';
import { PostgresDialect } from 'kysely';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Database } from './database';
import { allowedOrigins } from './config';
export async function createAuth(db: Database, root: string, baseURL: string) {
  let secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    const directory = process.env.DATA_DIR || resolve(root, '.data');
    const path = resolve(directory, 'auth-secret');
    await mkdir(directory, { recursive: true });
    try {
      secret = await readFile(path, 'utf8');
    } catch {
      secret = randomBytes(48).toString('hex');
      await writeFile(path, secret, { mode: 0o600 });
    }
  }
  const links: { from: string; to: string; name: string }[] = [];
  let discardGuests: (ids: string[]) => Promise<void> = async () => {};
  const options = {
    baseURL,
    basePath: '/api/auth',
    secret,
    trustedOrigins: [...allowedOrigins(), new URL(baseURL).origin],
    database: { dialect: new PostgresDialect({ pool: db.pool }), type: 'postgres' },
    emailAndPassword: { enabled: true, minPasswordLength: 10, requireEmailVerification: false },
    account: { accountLinking: { enabled: true, trustedProviders: [] } },
    advanced: { ipAddress: { ipAddressHeaders: ['x-gacha-client-ip'] } },
    plugins: [
      bearer({ requireSignature: true }),
      anonymous({
        generateName: () => `Guest ${randomBytes(2).toString('hex')}`,
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          links.push({ from: anonymousUser.user.id, to: newUser.user.id, name: newUser.user.name });
        },
      }),
    ],
  } satisfies BetterAuthOptions;
  await (await getMigrations(options)).runMigrations();
  const auth = betterAuth(options);
  async function flushLinks() {
    while (links.length) {
      const link = links.shift()!;
      const targetExists = await db.read((sql) =>
        sql('SELECT 1 FROM profile_accounts WHERE auth_user_id=$1 AND is_primary', [link.to]),
      );
      if (targetExists.length) {
        const temporary = await db.read((sql) =>
          sql<{ profile_id: string }>('SELECT profile_id FROM profile_accounts WHERE user_key=$1', [
            link.from,
          ]),
        );
        await discardGuests(temporary.map((p) => p.profile_id));
        continue;
      }
      await db.tx(async (sql) => {
        const old = await sql<{ profile_id: string }>(
          'SELECT profile_id FROM profile_accounts WHERE user_key=$1',
          [link.from],
        );
        const target = await sql('SELECT 1 FROM profile_accounts WHERE auth_user_id=$1', [link.to]);
        for (const row of old)
          await sql(
            'INSERT INTO profile_accounts(user_key,profile_id,auth_user_id,is_primary) VALUES($1,$2,$1,$3) ON CONFLICT DO NOTHING',
            [link.to, row.profile_id, target.length === 0],
          );
        if (!target.length && old[0])
          await sql('UPDATE profiles SET name=$1 WHERE id=$2', [link.name, old[0].profile_id]);
        await sql('DELETE FROM profile_accounts WHERE user_key=$1', [link.from]);
      });
    }
  }
  return {
    auth,
    flushLinks,
    setGuestCleanup(fn: typeof discardGuests) {
      discardGuests = fn;
    },
  };
}
