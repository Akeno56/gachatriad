import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { normalizeStaticExport } from './normalize-static-export.mjs';
if (!process.env.npm_execpath) throw Error('Run this with pnpm build:hosted.');
let site;
try {
  site = new URL(process.env.PUBLIC_SITE_URL || '');
} catch {
  throw Error(
    'Set PUBLIC_SITE_URL to your HTTPS site origin, for example https://game.example.com.',
  );
}
if (
  site.protocol !== 'https:' ||
  site.username ||
  site.password ||
  site.pathname !== '/' ||
  site.search ||
  site.hash
)
  throw Error('Set PUBLIC_SITE_URL to the HTTPS origin of your own site, without a path or query.');
const child = spawn(
  process.execPath,
  [process.env.npm_execpath, '--filter', '@gacha-triad/web', 'build'],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      STATIC_EXPORT: 'true',
      NEXT_PUBLIC_LOCAL_TEST: 'false',
      NEXT_PUBLIC_BASE_PATH: '',
      NEXT_PUBLIC_API_URL: site.origin,
      NEXT_PUBLIC_SERVER_URL: site.origin,
    },
  },
);
child.on('exit', async (code) => {
  if (code === 0) {
    console.log(
      `Normalized ${await normalizeStaticExport('apps/web/out')} static navigation payloads.`,
    );
    await writeFile(
      'apps/web/out/build-info.json',
      JSON.stringify({ basePath: '', apiOrigin: site.origin, hosting: 'standalone' }),
    );
    console.log('Standalone site: apps/web/out. Serve its contents at ' + site.origin + '/');
  }
  process.exitCode = code ?? 1;
});
