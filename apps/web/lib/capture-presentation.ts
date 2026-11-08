import type { Capture, CaptureReason } from '@gacha-triad/engine';
export function capturePhases(captures: readonly Capture[]) {
  return (['same', 'plus', 'standard', 'combo'] as CaptureReason[]).flatMap((reason) => {
    const group = captures.filter((c) => c.reason === reason);
    return group.length
      ? [{ reason, label: reason === 'standard' ? '' : reason.toUpperCase(), captures: group }]
      : [];
  });
}
