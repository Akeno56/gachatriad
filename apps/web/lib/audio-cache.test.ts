import { afterEach, expect, it, vi } from 'vitest';
import { AudioTrackCache } from './audio-cache';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('downloads a track once and shares the local URL across both decks and later loops', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(new Blob(['music'], { type: 'audio/mpeg' })));
  vi.stubGlobal('fetch', fetch);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-track');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const cache = new AudioTrackCache();
  expect(await Promise.all([cache.get('/audio/test.mp3'), cache.get('/audio/test.mp3')])).toEqual([
    'blob:local-track',
    'blob:local-track',
  ]);
  for (let i = 0; i < 50; i++) expect(await cache.get('/audio/test.mp3')).toBe('blob:local-track');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1]).toMatchObject({ priority: 'low', cache: 'force-cache' });
  cache.dispose();
  expect(revoke).toHaveBeenCalledWith('blob:local-track');
});
it('cancels hidden/obsolete loading without deleting a newer replacement', async () => {
  let finish!: (value: Response) => void;
  const fetch = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          finish = r;
        }),
    )
    .mockResolvedValueOnce(new Response(new Blob(['new'])));
  vi.stubGlobal('fetch', fetch);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:new');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const cache = new AudioTrackCache(),
    old = cache.get('/audio/test.mp3');
  const rejected = expect(old).rejects.toThrow(/cancelled/);
  cache.cancelPending();
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  const replacement = cache.get('/audio/test.mp3');
  finish(new Response(new Blob(['old'])));
  await rejected;
  expect(await replacement).toBe('blob:new');
  expect(await cache.get('/audio/test.mp3')).toBe('blob:new');
  expect(fetch).toHaveBeenCalledTimes(2);
  cache.dispose();
});
