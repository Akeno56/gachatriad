import { it, expect, vi, afterEach } from 'vitest';
import { recordRequest, connectionDiagnostics } from './client-diagnostics';
afterEach(() => vi.unstubAllGlobals());
it('bounds slow request diagnostics and excludes query strings and raw player IDs', () => {
  vi.stubGlobal('document', { querySelectorAll: () => [] });
  for (let i = 0; i < 25; i++)
    recordRequest(
      '/players/12345678-1234-1234-1234-123456789012?token=do-not-save',
      200,
      performance.now() - 2000,
      'app;dur=12.4',
    );
  const snapshot = JSON.parse(connectionDiagnostics());
  expect(snapshot.requests).toHaveLength(12);
  expect(snapshot.requests[0]).toMatchObject({ path: '/players/:id', status: 200, serverMs: 12.4 });
  expect(connectionDiagnostics()).not.toContain('do-not-save');
  recordRequest('/fast', 200, performance.now(), 'app;dur=1');
  expect(JSON.parse(connectionDiagnostics()).requests.at(-1).path).not.toBe('/fast');
});
