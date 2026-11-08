import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Database } from '../apps/server/src/database';
import { GameStore } from '../apps/server/src/store';
import { resetGameplay } from '../apps/server/src/reset-gameplay';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv.includes('--confirm-v012'))
  throw Error('Explicitly pass --confirm-v012 to reset game progress while retaining logins.');
let state;
try {
  state = await (
    await fetch('http://127.0.0.1:3030/state', { signal: AbortSignal.timeout(1500) })
  ).json();
} catch {}
if (
  state &&
  (state.running || state.external || state.busy || state.publicURL || state.tunnelRunning)
)
  throw Error('Stop the game server and close its public link before resetting.');
let health = false;
try {
  health = (await fetch('http://127.0.0.1:3001/api/health', { signal: AbortSignal.timeout(1000) }))
    .ok;
} catch {}
if (health) throw Error('A game server is still listening on 3001. Stop it first.');
const data = resolve(root, '.data'),
  backup = resolve(root, '.cache', `before-v12-reset-${Date.now()}`);
await mkdir(backup, { recursive: true });
for (const file of ['postgres', 'auth-secret', 'server-control.json'])
  await cp(resolve(data, file), resolve(backup, file), { recursive: true });
const db = new Database(resolve(data, 'postgres'));
try {
  const credentials = async () =>
    db.read(async (sql) => {
      const users = await sql('SELECT * FROM "user" ORDER BY id');
      const accounts = await sql('SELECT * FROM account ORDER BY id');
      const admins = await sql('SELECT * FROM server_admins ORDER BY auth_user_id');
      const [registered] = await sql<{ n: number }>(`SELECT count(*)::int n FROM "user" u
        WHERE NOT coalesce(u."isAnonymous",false) AND EXISTS (
        SELECT 1 FROM profile_accounts a JOIN profiles p ON p.id=a.profile_id
        WHERE a.auth_user_id=u.id AND a.is_primary AND NOT p.is_bot)`);
      return {
        users: users.length,
        loginAccounts: registered.n,
        admins: admins.length,
        hash: createHash('sha256')
          .update(JSON.stringify({ users, accounts, admins }))
          .digest('hex'),
      };
    });
  const before = await credentials();
  const store = new GameStore(db, 'offline-maintenance');
  await store.migrate(root);
  const result = await resetGameplay(store);
  const after = await credentials();
  if (before.hash !== after.hash)
    throw Error('Account preservation check failed; backup retained.');
  if (result.applied) {
    const configPath = resolve(data, 'server-control.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    await writeFile(configPath, JSON.stringify({ ...config, allowBots: false }, null, 2) + '\n');
  }
  const totals = await db.read(
    async (sql) =>
      (
        await sql(`SELECT
    (SELECT count(*)::int FROM matches) matches,
    (SELECT count(*)::int FROM inventory) inventory,
    (SELECT count(*)::int FROM chat_messages) public_messages,
    (SELECT count(*)::int FROM friend_messages) private_messages,
    (SELECT coalesce(sum(prisms),0)::int FROM profiles) prisms,
    (SELECT count(*)::int FROM profiles WHERE rating<>1000 OR draft_rating<>1000 OR played<>0 OR wins<>0 OR losses<>0 OR draws<>0) nonreset_profiles`)
      )[0],
  );
  const report = {
    ...result,
    authUsersRetained: after.users,
    loginAccountsRetained: after.loginAccounts,
    adminAssignmentsRetained: after.admins,
    credentialsAndAdminsPreserved: true,
    totals,
    backup,
  };
  await writeFile(resolve(backup, 'reset-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await db.close();
}
