interface Sample {
  path: string;
  status: number;
  totalMs: number;
  serverMs: number | null;
}
const recent: Sample[] = [];
export function recordRequest(
  path: string,
  status: number,
  start: number,
  serverTiming: string | null = null,
) {
  const duration = performance.now() - start;
  if (duration < 1000 && status >= 200 && status < 400) return;
  const server = serverTiming?.match(/app;dur=([\d.]+)/)?.[1];
  recent.push({
    path: path.split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id'),
    status,
    totalMs: Math.round(duration),
    serverMs: server ? Number(server) : null,
  });
  if (recent.length > 12) recent.shift();
}
export function connectionDiagnostics() {
  return JSON.stringify({
    requests: recent,
    audio: Array.from(document.querySelectorAll<HTMLAudioElement>('audio[data-bgm-track]')).map(
      (a) => ({
        scene: a.dataset.bgmScene,
        local: a.src.startsWith('blob:'),
        paused: a.paused,
        ready: a.readyState,
      }),
    ),
  });
}
