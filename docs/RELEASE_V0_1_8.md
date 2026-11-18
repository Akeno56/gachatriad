# 0.1.8 — Replays and bot styles

## Changes

- A private replay library in Profile, with mode filters, favourites and pages of 20 matches. Results link directly to their replay.
- Stored turns, captures, starting decks, rules, Elemental cells, score, ending reason and awarded Elo. First/previous/next/last controls, a timeline, playback at 1× or 2× and card inspection.
- Balanced, Attack, Defence and Combos bot styles. The home page's Practice button opens difficulty, style and rule settings. Population bots retain a consistent style.
- English/French text and responsive layouts. Season 0 remains Astral; weekly objectives remain five of six. Achievements visuals are scheduled for 0.1.9.

## Storage and access

Migration `022_replays_bot_styles.sql` adds bot style columns, `match_replays` and `replay_owners`. It does not reset progress, inventory, currencies or ratings. Completed matches are archived in the same transaction as their results. Older completed matches are archived when first requested.

Only participants can read their completed matches. Spectating an active game grants no replay access. Favourites belong to each participant independently. Playback never submits moves or grants rewards. Deleting an account removes its replay ownership and anonymises its identity in the other participant's saved replay; archives without owners are removed. The offline gameplay reset includes the new tables.

Saved turns reconstruct the recorded capture history, preserving ownership without rerunning the current engine. Card definitions are taken from the saved match state, including original Holographic stats. Trade One settlement updates the claimed-card record while preserving the starting decks.

## Public testing

Test the GitHub Pages build against the isolated testing backend, using the complete preview URL with its `server` parameter. This release's GitHub push publishes Pages only; the production server requires a separate manual update.

1. Open Profile → Replays. Try mode filters and an empty favourites list.
2. Start Practice from Play. Choose a style, difficulty and rules, then complete the game. Open Replay from the results.
3. Step through all nine turns and compare captures and scores. Inspect a card, scrub the timeline, try playback and switch speed. Confirm pause and end-of-replay behaviour.
4. Add a favourite, reload, and check Favourites only. The other participant's favourites must stay unchanged.
5. Check an older duel, a forfeit, each Draft format, a rated human duel and custom Trade One after settlement.
6. Check English/French on desktop and phone, including a 320 px viewport. Verify Back to play works under the GitHub Pages base path.

## Production

Deploy only after public testing is approved, using the existing backup/update procedure and a reviewed commit. No reboot is required by this migration. Do not run the offline gameplay reset for this release.

## Verification

- 222 automated tests across 41 files, including recorded-frame fidelity, participant access, legacy pagination, favourite isolation, deletion, Trade One settlement and bot hidden-hand privacy.
- Desktop/mobile browser checks for replay transport and autoplay, card inspection, favourites, practice settings, result links, French at 320 px, the 720p replay board and the home chat composer. Existing Journal and weekly reward browser checks also pass.
- Workspace type checks and the production-mode GitHub Pages export.
