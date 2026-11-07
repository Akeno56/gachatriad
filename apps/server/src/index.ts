import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPlatform } from './app';
const root = fileURLToPath(new URL('../../../', import.meta.url));
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
const { app } = await createPlatform(root, { logger: true });
await app.listen({
  host: process.env.SERVER_HOST || '127.0.0.1',
  port: Number(process.env.SERVER_PORT || 3001),
});
process.on('message', async (message) => {
  if (message === 'shutdown') {
    await app.close();
    process.exit(0);
  }
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
