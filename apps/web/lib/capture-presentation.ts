import type { Capture, CaptureReason } from '@gacha-triad/engine';
import type { MatchView, HandCard } from '@gacha-triad/shared/platform';

type BattleGame = NonNullable<MatchView['game']>;

/** Recover the intermediate boards when a poll returns several moves at once. */
export function captureFrames(previous: BattleGame, next: BattleGame): BattleGame[] {
  const frames = [next];
  const board = [...next.board];
  const hands: [HandCard[], HandCard[]] = [[...next.hands[0]], [...next.hands[1]]];
  for (let index = next.history.length - 1; index > previous.history.length; index--) {
    const { move, captures } = next.history[index];
    board[move.cell] = null;
    for (const capture of [...captures].reverse()) {
      const placed = board[capture.cell];
      if (placed) board[capture.cell] = { ...placed, owner: capture.from };
    }
    // Only restore visible card faces that the preceding view already showed.
    hands[move.player].push(
      previous.hands[move.player].find(({ card }) => card?.id === move.cardId) ?? {
        slotId: `played-${index}`,
        card: null,
      },
    );
    frames.push({
      ...next,
      status: 'playing',
      turn: move.player,
      board: [...board],
      hands: [[...hands[0]], [...hands[1]]],
      history: next.history.slice(0, index),
    });
  }
  return frames.reverse();
}

export function capturePhases(captures: readonly Capture[]) {
  return (['same', 'plus', 'standard', 'combo'] as CaptureReason[]).flatMap((reason) => {
    const group = captures.filter((c) => c.reason === reason);
    return group.length
      ? [{ reason, label: reason === 'standard' ? '' : reason.toUpperCase(), captures: group }]
      : [];
  });
}
