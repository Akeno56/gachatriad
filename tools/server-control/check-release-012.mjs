import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createPlatform } from '../../apps/server/src/app.ts';
import { createController } from './index.mjs';
const directory = await mkdtemp(resolve('.cache/panel-012-'));
process.env.DATA_DIR = directory;
process.env.LOCAL_CONTROL_SECRET = 'isolated-control-test-secret-twelve';
const platform = await createPlatform(resolve('.'), { memory: true, timers: false });
let controller, browser;
try {
  await platform.app.listen({ host: '127.0.0.1', port: 3231 });
  controller = await createController({
    managedExternal: true,
    dataDir: directory,
    port: 3230,
    gamePort: 3231,
    previewPort: 3232,
  });
  const r = await platform.app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/anonymous',
    payload: {},
  });
  assert.equal(r.statusCode, 200);
  const token = String(r.headers['set-auth-token']);
  const report = await platform.app.inject({
    method: 'POST',
    url: '/api/feedback',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      kind: 'bug',
      subject: '<img src=x onerror=alert(1)>',
      details: 'Literal markup for an isolated controller test.',
      requestId: 'panel-feedback-twelve',
    },
  });
  assert.equal(report.statusCode, 200, report.body);
  assert.equal(
    (
      await fetch(controller.url + '/feedback', {
        headers: { origin: 'https://malicious.invalid' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(controller.url + '/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: report.json().id, status: 'resolved', note: '' }),
      })
    ).status,
    403,
  );
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  let active = 0,
    max = 0,
    count = 0;
  await page.route('**/state?*', async (route) => {
    active++;
    count++;
    max = Math.max(max, active);
    await new Promise((r) => setTimeout(r, 1000));
    await route.continue();
    active--;
  });
  await page.goto(controller.url);
  await expect(page.locator('#runtimeStats')).toContainText('Database queue');
  await page.locator('#feedbackPanel summary').click();
  await expect(page.locator('#feedbackReports')).toContainText('<img src=x onerror=alert(1)>');
  assert.equal(await page.locator('#feedbackReports img').count(), 0);
  await page.locator('#feedbackReports select').selectOption('resolved');
  await page.locator('#feedbackReports button').click();
  await expect(page.locator('#feedbackReports')).not.toContainText('Literal markup');
  await page.waitForTimeout(6000);
  assert.equal(max, 1);
  await page.evaluate(() =>
    Object.defineProperty(document, 'hidden', { value: true, configurable: true }),
  );
  await page.waitForTimeout(1500);
  const before = count;
  await page.waitForTimeout(5500);
  assert.equal(count, before);
  await page.screenshot({ path: resolve('.cache/panel-012.png'), fullPage: true });
  console.log(
    JSON.stringify({
      controllerFeedback: 'passed',
      originAndCsrf: 'passed',
      safeMarkup: 'passed',
      overlappingRefreshes: max,
      hiddenPolling: 'paused',
    }),
  );
  await controller.close();
  controller = null;
  assert.equal((await fetch('http://127.0.0.1:3231/api/health')).status, 200);
} finally {
  await browser?.close();
  await controller?.close();
  await platform.app.close();
}
