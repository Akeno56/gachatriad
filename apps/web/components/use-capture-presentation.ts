'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchView } from '@gacha-triad/shared/platform';
import type { Sound } from '../lib/audio';
import { capturePhases } from '../lib/capture-presentation';
export function useCapturePresentation(incoming: MatchView | null, sound: (sound: Sound) => void) {
  const [match, setMatch] = useState<MatchView | null>(incoming),
    [resolving, setResolving] = useState(false),
    [callout, setCallout] = useState(''),
    [revealed, setRevealed] = useState<Set<number> | null>(null),
    [flipping, setFlipping] = useState<number[]>([]);
  const latest = useRef(incoming),
    shown = useRef(incoming),
    running = useRef(false),
    token = useRef(0);
  const accept: (next: MatchView | null) => void = useCallback(
    (next: MatchView | null) => {
      latest.current = next;
      const changedId = next?.id !== shown.current?.id;
      if (running.current && !changedId) return;
      if (changedId) {
        token.current++;
        running.current = false;
      }
      const previous = shown.current;
      shown.current = next;
      setMatch(next);
      if (
        !next?.game ||
        changedId ||
        !previous?.game ||
        next.game.history.length <= previous.game.history.length
      ) {
        setRevealed(null);
        setFlipping([]);
        setCallout('');
        setResolving(false);
        return;
      }
      const turn = next.game.history.at(-1)!;
      running.current = true;
      const stamp = ++token.current;
      setResolving(true);
      setRevealed(new Set());
      setFlipping([]);
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      void (async () => {
        const visible = new Set<number>();
        const phases = capturePhases(turn.captures);
        if (!phases.length) {
          sound('place');
          await wait(220);
        }
        for (const phase of phases) {
          if (token.current !== stamp) return;
          if (phase.label) {
            setCallout(phase.label);
            sound(phase.reason === 'combo' ? 'combo' : 'capture');
            await wait(750);
          }
          if (token.current !== stamp) return;
          setCallout('');
          for (const capture of phase.captures) visible.add(capture.cell);
          setRevealed(new Set(visible));
          setFlipping(phase.captures.map((c) => c.cell));
          sound(phase.reason === 'combo' ? 'combo' : 'capture');
          await wait(700 + Math.max(0, phase.captures.length - 1) * 160);
        }
        if (token.current !== stamp) return;
        running.current = false;
        setResolving(false);
        setCallout('');
        setRevealed(null);
        setFlipping([]);
        if (latest.current !== next) accept(latest.current);
      })();
    },
    [sound],
  );
  useEffect(() => {
    accept(incoming);
  }, [incoming, accept]);
  useEffect(
    () => () => {
      token.current++;
    },
    [],
  );
  return { match, resolving, callout, revealed, flipping };
}
