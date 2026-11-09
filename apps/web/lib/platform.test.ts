import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://game.test');
  vi.stubEnv('NEXT_PUBLIC_LOCAL_TEST', 'false');
  vi.stubGlobal('window', {});
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('handles empty and HTML gateway responses without discarding the signed session', async () => {
  storage.set('triad-session:https://game.test', 'existing-session');
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 502 }))
    .mockResolvedValueOnce(new Response('<html>Unavailable</html>', { status: 503 }));
  vi.stubGlobal('fetch', fetch);
  const { api } = await import('./platform');
  for (const status of [502, 503]) {
    await expect(api('/profile')).rejects.toMatchObject({
      status,
      message: 'The game server is temporarily unavailable. Reconnecting…',
    });
    expect(storage.get('triad-session:https://game.test')).toBe('existing-session');
  }
});

it('retries session bootstrap after an outage without mistaking it for a new guest', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 502 }))
    .mockResolvedValueOnce(Response.json({ user: { id: 'existing-account' } }));
  vi.stubGlobal('fetch', fetch);
  const { session } = await import('./platform');
  await expect(session()).rejects.toMatchObject({ status: 502 });
  await expect(session()).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(
    fetch.mock.calls.every(
      ([url, options]) =>
        url === 'https://game.test/api/auth/get-session' && options.method === 'GET',
    ),
  ).toBe(true);
});

it('preserves a valid API validation error', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(Response.json({ error: 'Not enough Stellar Prisms.' }, { status: 409 })),
  );
  const { api } = await import('./platform');
  await expect(api('/boosters/buy', { quantity: 1 })).rejects.toMatchObject({
    status: 409,
    message: 'Not enough Stellar Prisms.',
  });
});

it('respects a server cooldown across reads without signing out or replaying writes', async () => {
  vi.useFakeTimers();
  try {
    storage.set('triad-session:https://game.test', 'keep-session');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '30' } }))
      .mockResolvedValueOnce(Response.json({ id: 'same-account' }));
    vi.stubGlobal('fetch', fetch);
    const { api } = await import('./platform');
    await expect(api('/profile')).rejects.toMatchObject({ status: 429, retryAfterMs: 30000 });
    for (let i = 0; i < 30; i++)
      await expect(api('/social')).rejects.toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(storage.get('triad-session:https://game.test')).toBe('keep-session');
    await vi.advanceTimersByTimeAsync(30000);
    await expect(api('/profile')).resolves.toEqual({ id: 'same-account' });
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it('does not pause battle reads after a chat moderation rejection', async () => {
  const message =
    'Message blocked by automatic moderation. Keep chat respectful and avoid spam or unsafe links.';
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ error: message }, { status: 429 }))
    .mockResolvedValueOnce(Response.json({ id: 'battle' }));
  vi.stubGlobal('fetch', fetch);
  const { api } = await import('./platform');
  await expect(api('/chat', { message: 'blocked' })).rejects.toMatchObject({
    status: 429,
    message,
  });
  await expect(api('/matches/battle')).resolves.toEqual({ id: 'battle' });
  expect(fetch).toHaveBeenCalledTimes(2);
});
