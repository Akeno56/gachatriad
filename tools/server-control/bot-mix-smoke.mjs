import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { createController } from './index.mjs';
import { createPlatform } from '../../apps/server/src/app.ts';

// Run with: node --import ./apps/server/node_modules/tsx/dist/loader.mjs tools/server-control/bot-mix-smoke.mjs
const dataDir = await mkdtemp(resolve('.cache/v14-bot-panel-'));
process.env.DATA_DIR = dataDir;
process.env.LOCAL_CONTROL_SECRET = randomBytes(32).toString('hex');
process.env.LOCAL_BOTS = 'true';
const platform = await createPlatform(resolve('.'), { memory: true, timers: false });
let controller, browser;
try {
  await platform.app.listen({ host: '127.0.0.1', port: 0 });
  const gamePort = platform.app.server.address().port;
  controller = await createController({
    dataDir,
    port: 3165,
    previewPort: 3166,
    gamePort,
    managedExternal: true,
  });
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  await page.goto(controller.url);
  const easy = page.getByLabel('Easy bots percentage', { exact: true }),
    medium = page.getByLabel('Medium bots percentage', { exact: true });
  await expect(easy).toBeEnabled();
  await easy.focus();
  await easy.press('Home');
  for (let i = 0; i < 45; i++) await easy.press('ArrowRight');
  await medium.focus();
  await medium.press('Home');
  for (let i = 0; i < 25; i++) await medium.press('ArrowRight');
  await expect(easy).toHaveValue('45');
  await expect(medium).toHaveValue('25');
  await expect(page.getByLabel('Hard bots percentage', { exact: true })).toHaveValue('30');
  await page.getByRole('button', { name: 'Populate bots', exact: true }).click();
  await expect
    .poll(async () => (await controller.state()).online.population.counts)
    .toEqual({ easy: 14, medium: 7, hard: 9 });
  await page.reload();
  await expect(easy).toHaveValue('45');
  await expect(medium).toHaveValue('25');
  await page.screenshot({ path: resolve('.cache/v14-bot-mix-panel.png'), fullPage: true });
  await page.getByLabel('Hard bots percentage', { exact: true }).press('End');
  await page.getByRole('button', { name: 'Apply difficulty', exact: true }).click();
  await expect
    .poll(async () => (await controller.state()).online.population.counts)
    .toEqual({ easy: 0, medium: 0, hard: 30 });
  await page.getByRole('button', { name: 'Pause bots', exact: true }).click();
  await expect.poll(async () => (await controller.state()).online.population.enabled).toBe(false);
  console.log(
    'Private bot panel passed: linked 45/25/30 sliders, 30 bots, exact rounded counts, persisted reload, rebalance and pause.',
  );
} finally {
  await browser?.close();
  await controller?.close();
  await platform.app.close();
}

// A local controller restart must also preserve the database mix, rather than replacing
// it with its older single-difficulty preference.
if (process.argv.includes('--restart')) {
  const directory = await mkdtemp(resolve('.cache/v14-bot-restart-'));
  const local = await createController({
    dataDir: directory,
    port: 3165,
    previewPort: 3166,
    gamePort: 3167,
    managedExternal: false,
  });
  try {
    const html = await (await fetch(local.url)).text(),
      token = html.match(/const token = '([^']+)'/)?.[1];
    const post = async (path, body = {}) => {
      const response = await fetch(local.url + path, {
        method: 'POST',
        headers: {
          origin: local.url,
          'x-control-token': token,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw Error(await response.text());
    };
    await post('/start');
    await post('/population', { enabled: true, mix: { easy: 45, medium: 25, hard: 30 } });
    await post('/restart');
    await expect
      .poll(async () => (await local.state()).online?.population.mix, { timeout: 30000 })
      .toEqual({ easy: 45, medium: 25, hard: 30 });
    await expect
      .poll(async () => (await local.state()).online?.population.counts)
      .toEqual({ easy: 14, medium: 7, hard: 9 });
    console.log('Local server restart passed: the persisted mixed difficulties remain 45/25/30.');
  } finally {
    await local.close();
  }
}
