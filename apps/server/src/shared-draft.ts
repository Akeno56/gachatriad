import { validateDeck, type Card, type Player } from '@gacha-triad/engine';
export interface SharedDraft {
  first: Player;
}
export function draftTurn(first: Player, decks: readonly string[][]): Player | null {
  if (decks[0].length === 5 && decks[1].length === 5) return null;
  const next = ((decks[0].length + decks[1].length + first) % 2) as Player;
  return decks[next].length < 5 ? next : ((1 - next) as Player);
}
export function legalDraftCards(pool: readonly Card[], decks: readonly string[][], seat: Player) {
  const taken = new Set(decks.flat());
  const own = pool.filter((card) => decks[seat].includes(card.id));
  return pool.filter(
    (card) =>
      !taken.has(card.id) &&
      validateDeck([...own, card]).every((error) => error === 'Select exactly five cards.'),
  );
}
