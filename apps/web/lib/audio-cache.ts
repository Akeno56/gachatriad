/** Download once, then let media elements read local bytes instead of streaming over the API connection. */
export class AudioTrackCache {
  private entries = new Map<
    string,
    { url?: string; pending?: Promise<string>; controller: AbortController }
  >();
  private disposed = false;
  get(path: string): Promise<string> {
    if (this.disposed) return Promise.reject(new Error('Audio cache closed.'));
    const existing = this.entries.get(path);
    if (existing?.url) return Promise.resolve(existing.url);
    if (existing?.pending) return existing.pending;
    const entry = { controller: new AbortController() } as {
      url?: string;
      pending?: Promise<string>;
      controller: AbortController;
    };
    this.entries.set(path, entry);
    entry.pending = (async () => {
      const timeout = setTimeout(() => entry.controller.abort(), 45000);
      try {
        const response = await fetch(path, {
          signal: entry.controller.signal,
          cache: 'force-cache',
          priority: 'low',
        });
        if (!response.ok) throw new Error('Music unavailable.');
        const blob = await response.blob();
        if (this.disposed || entry.controller.signal.aborted)
          throw new Error('Audio loading cancelled.');
        entry.url = URL.createObjectURL(blob);
        return entry.url;
      } catch (error) {
        if (this.entries.get(path) === entry) this.entries.delete(path);
        throw error;
      } finally {
        clearTimeout(timeout);
        entry.pending = undefined;
      }
    })();
    return entry.pending;
  }
  cancelPending() {
    for (const [path, entry] of this.entries)
      if (entry.pending) {
        entry.controller.abort();
        this.entries.delete(path);
      }
  }
  dispose() {
    this.disposed = true;
    this.cancelPending();
    for (const entry of this.entries.values()) if (entry.url) URL.revokeObjectURL(entry.url);
    this.entries.clear();
  }
}
