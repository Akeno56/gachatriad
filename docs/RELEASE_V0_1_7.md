# 0.1.7 · Your player journey

Public GitHub Pages testing comes first. This release keeps achievements presentation unchanged; its UI/visual rework is scheduled for 0.1.9.

## Player features

- **Flexible weeklies:** finish any five of six objectives for 150 Stellar Prisms. Options cover full duels, different modes, a daily puzzle, non-starter boosters, a saved full deck, or a custom/Roulette duel. No wins, consecutive logins or Trade One stakes are required. Practice and bots count for duel objectives; starter packs do not count for the booster objective. Free daily boosters do.
- **Journey journal:** eight optional chapters guide players through the tutorial, boosters, named decks, complete duels, puzzles, both drafting formats, duplicates and card exchanges. A suggested next chapter never blocks other activities. Existing qualifying history is recognised, and completed chapters remain recorded.
- **Season identity:** Season 0 is “Astral”. The journal and Ladder show the season name and explain the three separate Elo ladders. Season records count the actual rating ledger. There is no scheduled season end or rating reset in this patch.

The Journal is available from the main navigation and the home-page welcome line. Existing card sizes and the home chat’s viewport fit are preserved. All new player text supports English and French.

## Persistence and safeguards

Migration 021 adds private chapter stamps, weekly saved-deck records, account-level weekly claims and match-history indexes. It preserves active hands, inventory, rating and existing achievements. Complete legal loadouts are stamped when saved, so deleting one does not remove progress.

Weekly windows run Monday 00:00 UTC through the following Monday. Activity timestamps come from the server. Claim requests supply the displayed week only; the server recomputes progress, rejects a stale week and credits Prisms in the same transaction as the unique account/week claim. A duplicate request succeeds without paying again. Currency-limit failures roll back the claim. Guests can explore and progress, but must register before claiming; registration retains the guest profile.

Only natural nine-turn finishes count for duel objectives. Forfeits, timeout results and admin test results are excluded. Weekly progress is private and cannot be selected through a foreign profile ID. The journal refreshes on entry, manual refresh, visibility changes and a one-minute timer; it does not query on every world/profile notification.

## Public test checklist

1. Open the Pages preview with the isolated testing server selected. From Play, follow the season/journey link. Check all six weekly options and all eight journal chapters in English and French.
2. Save a complete named deck, then delete the loadout. Refresh the journal: its deck chapter and this week’s deck objective should stay complete. An incomplete loadout must not earn them.
3. Combine duels in different modes with the puzzle, booster or deck objectives. Finish any five options, claim the reward and reload. The balance should increase by exactly 150 once; inventory, active hand and Elo must remain unchanged by the claim.
4. Try the flow as a guest, register from the journal and confirm that progress remains. Simulate a failed progress request or claim and retry without losing the reward.
5. Check Play and the journal at 1280×720 and on a 320-pixel-wide French phone layout. Check keyboard tabs, the mobile navigation, the tutorial action and Back to play on the `/gachatriad` Pages base path.
6. Review season records for Ranked, Draft and Shared Draft. Bot/practice and other non-rated results must not appear as rated games. Verify that ordinary Ranked still has no card loss.

Production deployment uses the normal update script after public testing. No production deployment is performed as part of preparing this preview.
