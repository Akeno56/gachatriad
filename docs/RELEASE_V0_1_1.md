# 0.1.1 Alpha

No accounts, history, cards, ratings or currency are wiped. Migration **017** adds currency listings and assigns existing matches to **Season 0**. Season 0 continues through Alpha; a future Beta/full-release update can define the next season without inventing a reset now.

## Rated results

Ranked and Draft results show the stored rating after that match, its exact signed Elo change, and the current Season 0 W/L record for that mode. For example: **Rating: 1403 (+13) 21W 12L**. French uses V/D. Draws are listed separately when present. Records include completed human rated games, including forfeits, and exclude bots and admin test wins. Ranked and Draft records remain separate. Older games without a rating-audit row show no invented delta.

## Market

The Trades navigation tab is now **Market**, at the same `/market` address. Post either a card-for-card exchange or a sale for Stellar Prisms. Standard and owned Holo copies can be sold; Holo identity/bonus direction is preserved through the transfer.

Prices are whole numbers from **1 to 1,000,000**. The existing limit of five open offers per owner remains. A listed copy is reserved until acceptance or cancellation. The buyer pays the exact listing price and the seller receives that full amount; there is no fee. Only registered accounts can post or accept offers.

Currency and cards settle in one transaction with both currency and inventory ledgers. Insufficient funds, an unavailable card or an overflowing seller balance roll back the entire purchase. Replays and competing buyers cannot charge twice. Selling the last copy removes it from the seller's active deck. Bots continue to post/fulfil card exchanges and do not spend or distribute currency through sales.

Filters cover sale/exchange type, affordable/acceptable offers, price range, rarity, universe, finish and ownership. Prices can be sorted ascending/descending. Buyers review and confirm purchases before paying.

Older open 0.1.0 clients receive exchange-only listings so that currency offers cannot break their card-only renderer. The updated Market explicitly requests both listing types.

## Rules, moderation and menus

- Lobbies has **Standard**, **Trade One**, **All Open** and **Random deck** custom-rule presets. They fill the setup form; they do not enter matchmaking. Ranked/Draft shortcuts and mode filters are removed from Lobbies. Both rated modes remain in Play and cannot be joined directly through public lobby IDs.
- Ordered spreads now have equal selection weight: **4/4/5/4** and **4/5/4/4** are distinct and can coexist. The digit-combination preference is removed. All **814** base spreads remain distinct; **658** change from 0.1.0, preserving each total, rarity, element and ID. Caps remain **8 for 1★–3★**, **A for 4★–5★**, including Holo bonuses. Aha remains **A/8/A/2**. Existing Holo IDs remain valid. Active matches finish with their starting snapshot; owned definitions and new matches use the update. See the [full spread audit](STAT_SPREADS_ALPHA_011.md).
- Shared General/Trade/Lobbies, friend and battle moderation blocks additional English/French insults, including the reported phrase and common spelling substitutions. Ordinary French lateness such as “en retard”, “du retard” and “mon retard” stays allowed. Existing strike, mute and audit rules remain; messages are not sent to an external moderation service.
- Content pages have tighter spacing, headings and controls. Cards/Collection show 270px cards on desktop and 230px on mobile, with six columns at 1440px and two on phones. The saved deck uses smaller previews. Profiles, boosters, achievements, presets and ladder rows are compacted too. Battle layout and touch text-input sizing are preserved.
- The private host monitor uses a three-by-three grid for top/right/bottom/left values, replacing space-aligned text. Public hand redaction and admin access rules are unchanged.

## Local test and publication

Double-click **Start Local Test.cmd**, then **Start server → Open local game preview** on the separate **3040** PC panel. It builds the current frontend for **3100/3101** and uses `.data-local/`. The VPS panel remains on **3030** through SSH.

Once tested, in your PC's PowerShell:

```powershell
cd E:\DEVPRG\Codex\GachaTriad
git add .
git commit -m "Release 0.1.1 Alpha"
git push origin main
ssh -t gachatriad "bash /opt/gachatriad/source/tools/deploy/update.sh https://gachatriad.com"
```

Wait for the deployment success message; the updater backs up, builds and restarts the game and private host panel. Refresh the game with Ctrl+F5 and reload the host panel. No live deployment is performed by local testing.

## Validation and previews

- 152 unit tests passed, including sale settlement, competing buyers, insufficient funds, overflow rollback, Holo transfers, separate Season 0 records and directional spread rules. The five release-specific backend tests were rerun after the compatibility adjustment and passed.
- 16 desktop/mobile browser checks passed across the current patch and previous gameplay regressions. Targeted checks also cover French labels, sale/exchange filters, result deltas, custom presets and compact Cards/Collection/Profile/Boosters layouts.
- Production hosted build, workspace typecheck, asset validation and formatting checks passed. The private host-monitor probe verifies directional stat alignment.
- The refreshed isolated PC preview passed its smoke test on 3040/3100/3101, including admin promotion, another player's collection/history and admin instant win. No production requests were made, even with a saved production URL. The local panel is available on 3040; start its test server before opening the preview.

Screenshots: [Cards](screenshots/alpha011-cards.png), [Collection](screenshots/alpha011-collection.png), [Market](screenshots/alpha011-market.png), [mobile Market](screenshots/alpha011-market-mobile.png), [Season 0 result](screenshots/alpha011-season-result.png), [Lobbies](screenshots/alpha011-lobbies.png), [host monitor](screenshots/alpha011-host-monitor.png).
