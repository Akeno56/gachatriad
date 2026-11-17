# 0.1.6 validation

This release adds private named loadouts, the deck workshop and descriptive hand analysis. Existing active hands and inventories survive migration unchanged. Match snapshots, rewards, Elo and game rules are not modified.

## Server and analysis checks

- All 202 unit/server tests pass across 37 files. Seven new loadout tests exercise persistence, idempotent migration, ownership/forged-profile rejection, revision conflicts, concurrent updates, the twelve-loadout limit, incomplete drafts, missing/locked cards, repair and queued activation. Three analysis tests verify orientation, Holographic values, balanced coverage and empty/incomplete hands.
- Save and delete do not mutate inventory. Saving an alternative does not activate it. Deleting an active preset clears its association while preserving the actual five-card hand.
- Private endpoints resolve the current authenticated profile. Another player cannot list, update, delete or activate the owner's loadouts. Unknown, duplicate, disabled and unowned new card definitions are rejected through the shared deck validation and ownership checks.
- Card loss prunes the active hand and clears its preset association without deleting saved alternatives. Legacy Collection edits also leave presets intact. Guest deletion cascades to private loadouts; the offline gameplay reset includes the new table.
- The existing economy, authentication, game and privacy regression suite still passes. This is scoped test coverage, not a guarantee that every possible vulnerability has been excluded.

## Browser and visual checks

Isolated test accounts and static-export previews cover the following in desktop and mobile browser projects:

The final targeted run passes 13 scenarios, with one desktop-only viewport case intentionally skipped in the mobile project.

- Save without activation; explicit activation; replacement and Undo; reload persistence; copying, deletion and unchanged inventory.
- Unsaved work survives reload and prompts before switching. Save and switch chooses a new name correctly. Concurrent edits retain the local draft and require explicit loading of the latest version.
- The workshop fits at 1440×900 and 1280×720 without document scrolling. All five hand cards remain in the viewport and value spans retain at least 20px of rendered height. The catalog scrolls independently with pagination kept visible.
- Search/reset, Holographic filtering, directional sorting, analysis and corner guidance work. Extra filters close with Escape or an outside click.
- French layouts remain within the page width down to 320px. Shared tabs and help accessibility labels now translate their own generated text. The Finish action elsewhere keeps its existing translation; the card filter uses its own Card finish label.
- Existing tavern viewport/keyboard tests, Ranked result/requeue checks, release notes and French navigation remain included in the targeted browser pass. The navigation expectation now includes the new Decks destination.

Screenshots were reviewed for hand/library alignment, button wrapping, filter space, readable values, French labels and notifications covering cards. Success feedback was moved into the workshop toolbar. Private loadout reads run on workspace entry, returning to a visible tab and a 30-second visible-tab timer, independently of profile refreshes.

## Deployment scope

The hosted static export and workspace type checks pass. Frontend and backend must be deployed together for the new API; migration 020 needs no new environment variables. Public GitHub Pages testing uses the isolated PC save, with production requests blocked in verification. Production deployment remains a separate action.
