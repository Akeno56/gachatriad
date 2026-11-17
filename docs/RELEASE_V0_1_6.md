# 0.1.6 — Build your decks

## Named loadouts

Players can save up to twelve private, named loadouts per profile. Loadouts support incomplete preparations, renaming, copying and deletion. Saving a loadout does not change the active hand; Use this deck (or Save & use) explicitly activates a legal five-card hand. Deleting a loadout preserves inventory and the active cards.

Loadouts live on the server and follow the player's profile across devices. Updates, activation and deletion carry a revision, so an older browser tab cannot overwrite a newer saved version. Duplicate names are rejected without regard to case. Names and cards are validated on the server; all operations derive ownership from the authenticated profile.

Saved alternatives remain present if a card is traded away or locked. They can be repaired in the workshop. Activation checks current availability and blocks switching while the player is waiting in matchmaking. Existing matches retain their original deck snapshots. Existing active decks are preserved by migration.

## Deck workshop

The Decks page is now a dedicated workspace, available from navigation, the tavern's Edit deck link and Collection. Desktop keeps the five-card hand beside the collection. Phones use a horizontal hand strip and a scrolling layout. The library and analysis share a tabbed pane, so the deck remains available while studying either.

Search, universe, rarity, finish, availability and directional-value sorting help find the next card. Selecting a replacement prompts for a hand slot; Undo reverses card edits. Auto build prepares an unsaved hand without changing the active deck. Card inspection is separate from removal. Extra filters are tucked into a keyboard-accessible menu to preserve library space.

Unsaved work is retained in the current browser tab, scoped by server and profile. Switching loadouts and following navigation links warns before discarding edits. Concurrent-edit errors preserve the local draft and offer an explicit Load latest saved version action. Success feedback appears in the workshop toolbar rather than covering cards.

Collection retains quick active-deck editing for compatibility. Those direct edits leave named presets intact and clear the active preset association.

## Deck outlook

The analysis uses actual card definitions, including their stored Holographic bonuses, to show average top/right/bottom/left values and counts of high (7–A) and low (1–3) sides. Editing shows changes from the loaded hand. Corner suggestions favor exposed sides with a stronger minimum value, then their combined value. Opponent cards, rules and Elemental cells still determine real captures; the view does not predict win rates.

## Deployment

Deploy frontend and backend together. Migration 020 adds the private loadout table and an optional active-loadout association without changing existing inventories, hands, match results or ratings. It is idempotent and requires no new environment variables. GitHub Pages testing continues to use the isolated PC backend; production deployment is separate.
