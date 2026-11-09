import { afterEach, it, expect, vi } from 'vitest';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});
it('pins local test requests to the test server despite a saved production connection', async () => {
  vi.stubEnv('NEXT_PUBLIC_LOCAL_TEST', 'true');
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://127.0.0.1:3101');
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', { getItem: () => 'https://gachatriad.com' });
  const { serverURL, normalizeServerURL } = await import('./connection');
  expect(serverURL()).toBe('http://127.0.0.1:3101');
  expect(() => normalizeServerURL('https://gachatriad.com')).toThrow(/local test/);
  expect(normalizeServerURL('http://127.0.0.1:3101')).toBe('http://127.0.0.1:3101');
});
it('keeps normal hosted and GitHub Pages connection selection available', async () => {
  vi.stubEnv('NEXT_PUBLIC_LOCAL_TEST', 'false');
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://gachatriad.com');
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', { getItem: () => 'https://test.trycloudflare.com' });
  const { serverURL, normalizeServerURL } = await import('./connection');
  expect(serverURL()).toBe('https://test.trycloudflare.com');
  expect(normalizeServerURL('https://test.trycloudflare.com')).toBe(
    'https://test.trycloudflare.com',
  );
});
