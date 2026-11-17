import type { MatchView } from '@gacha-triad/shared/platform';

/** Count the player's capture events, including recaptures, from the actual move history. */
export function matchHighlights(match: Pick<MatchView, 'game' | 'seat'>) {
  const turns = match.game?.history.filter((turn) => turn.move.player === match.seat) ?? [];
  return {
    captures: turns.reduce(
      (total, turn) => total + turn.captures.filter((capture) => capture.to === match.seat).length,
      0,
    ),
    specialTurns: turns.filter((turn) =>
      turn.captures.some((capture) => capture.reason === 'same' || capture.reason === 'plus'),
    ).length,
    bestCombo: Math.max(
      0,
      ...turns.map((turn) => turn.captures.filter((capture) => capture.reason === 'combo').length),
    ),
  };
}
