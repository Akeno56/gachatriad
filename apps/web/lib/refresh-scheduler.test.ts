import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { refreshScheduler } from './refresh-scheduler';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('coalesces a notification burst and keeps at most one trailing refresh', async () => {
  let finish!: () => void;
  const refresh = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          finish = r;
        }),
    )
    .mockResolvedValue(undefined);
  const s = refreshScheduler(refresh, { interval: () => 2000, visible: () => true });
  for (let i = 0; i < 100; i++) s.request();
  await vi.advanceTimersByTimeAsync(0);
  expect(refresh).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 100; i++) s.request();
  await vi.advanceTimersByTimeAsync(1000);
  expect(refresh).toHaveBeenCalledTimes(1);
  finish();
  await vi.advanceTimersByTimeAsync(1999);
  expect(refresh).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(refresh).toHaveBeenCalledTimes(2);
  s.close();
});

it('bounds sustained world notifications while preserving faster battle updates', async () => {
  let battle = false;
  const refresh = vi.fn().mockResolvedValue(undefined);
  const s = refreshScheduler(refresh, {
    interval: () => (battle ? 250 : 2000),
    visible: () => true,
  });
  for (let i = 0; i < 60; i++) {
    s.request();
    await vi.advanceTimersByTimeAsync(1000);
  }
  expect(refresh.mock.calls.length).toBeLessThanOrEqual(31);
  battle = true;
  await vi.advanceTimersByTimeAsync(2000);
  s.request();
  await vi.advanceTimersByTimeAsync(0);
  const before = refresh.mock.calls.length;
  s.request();
  await vi.advanceTimersByTimeAsync(250);
  expect(refresh.mock.calls.length).toBe(before + 1);
  s.close();
});

it('does not poll hidden tabs and cancels pending work when unmounted', async () => {
  let visible = false;
  const refresh = vi.fn().mockResolvedValue(undefined);
  const s = refreshScheduler(refresh, { interval: () => 2000, visible: () => visible });
  s.request();
  await vi.advanceTimersByTimeAsync(15000);
  expect(refresh).not.toHaveBeenCalled();
  visible = true;
  s.request();
  await vi.advanceTimersByTimeAsync(0);
  expect(refresh).toHaveBeenCalledTimes(1);
  s.request();
  s.close();
  await vi.advanceTimersByTimeAsync(15000);
  expect(refresh).toHaveBeenCalledTimes(1);
});
