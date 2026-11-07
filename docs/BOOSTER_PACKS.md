# Boosters and Stellar Prisms

New guest and registered profiles receive **three unopened starter boosters** instead of the old random starter collection. Each contains five cards, including one guaranteed 3★ or higher. Existing collections, decks, saves and accounts are preserved. Registering a guest preserves inventory, currency and unopened packs without granting another welcome bundle.

The first starter booster automatically builds a legal five-card deck. Its first four slots roll 1–3★ cards with weights 55:25:15, favoring unowned characters. Its fifth slot rolls 3★ 85%, 4★ 13%, 5★ 2%. Every pack has five distinct characters, ensuring that the first starter pack can form a legal deck. Duplicates between packs add inventory copies.

Standard boosters cost **150 Stellar Prisms**. The first four slots independently roll 1★ 55%, 2★ 25%, 3★ 15%, 4★ 4%, 5★ 1%; the fifth uses the guaranteed-slot odds above. Characters at the selected rarity are equally likely. Each card independently has a **0.1% Holo chance**; Holo is cosmetic and keeps identical stats. The Boosters screen publishes these odds and saved opening receipts.

A completed nine-placement duel awards **50 Prisms for a win, 25 for a draw, 10 for a loss**. Solo, multiplayer and guests participate. Forfeits, missed-turn forfeits and abandoned drafts pay nothing; bots receive no currency. The result overlay displays the persisted payout. Values and odds live in `ECONOMY` in `packages/shared/src/platform.ts`.

All rolling, charging, grants, inventory changes and rewards happen on the server. A purchase requires a client request ID unique to the profile; retries return the original pack without another charge. Opening is idempotent by pack ID. One database transaction saves the exact five card IDs, inventory ledger entries and opening receipt. Unopened packs expose no card contents. An account cannot open another profile's packs. Match payouts use unique ledger references so refreshes/retries do not pay twice. Currency cannot go negative.

Migration `005_economy_admin.sql` adds receipts, Prism balances/ledger and administration tables without resetting existing data. Older profiles keep their starter collection and begin at zero Prisms; the three-pack grant applies only to new profiles. Real-money purchases and currency-priced market listings are not implemented.
