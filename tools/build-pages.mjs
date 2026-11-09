import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { normalizeStaticExport } from './normalize-static-export.mjs';
const repo = (process.env.GITHUB_REPOSITORY || 'Akeno56/gachatriad').split('/');
const inferred =
  repo[1].toLowerCase() === `${repo[0].toLowerCase()}.github.io` ? '' : `/${repo[1]}`;
if (!process.env.npm_execpath) throw Error('Run this with pnpm build:pages.');
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
      NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? inferred,
    },
  },
);
child.on('exit', async (code) => {
  if (code === 0) {
    console.log(
      `Normalized ${await normalizeStaticExport('apps/web/out')} static navigation payloads.`,
    );
    await writeFile('apps/web/out/.nojekyll', '');
    await writeFile(
      'apps/web/out/build-info.json',
      JSON.stringify({ basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? inferred }),
    );
    console.log('GitHub Pages files: apps/web/out. Server address is selected at runtime.');
  }
  process.exitCode = code ?? 1;
});
