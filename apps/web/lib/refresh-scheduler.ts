/** Coalesce socket notifications; never run overlapping automatic refreshes. */
export function refreshScheduler(
  refresh: () => Promise<void>,
  options: { interval: () => number; visible: () => boolean; now?: () => number },
) {
  const now = options.now ?? Date.now;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false,
    dirty = false,
    closed = false;
  let nextAt = 0;
  async function run() {
    timer = undefined;
    if (closed || !options.visible()) return;
    dirty = false;
    running = true;
    try {
      await refresh();
    } finally {
      running = false;
      nextAt = now() + options.interval();
      if (dirty) request();
    }
  }
  function request() {
    if (closed || !options.visible()) return;
    dirty = true;
    if (!running && timer === undefined)
      timer = setTimeout(() => void run(), Math.max(0, nextAt - now()));
  }
  return {
    request,
    close() {
      closed = true;
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
