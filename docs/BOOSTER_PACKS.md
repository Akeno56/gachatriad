# Boosters and Stellar Prisms

## Batch purchases, stacks and daily rewards

Unopened packs form counted stacks by source: Starter, Daily, Standard and Gift. The server returns every unopened pack plus the latest 20 opened receipts. Open one pack, a stack quantity up to ten, or **Open all (N)** for the current amount when you own 2–10 packs across sources. With more than ten, **Open next 10** opens the first ten and leaves the rest. Each pack keeps its own source's odds. Bulk opening is atomic: unknown/foreign IDs roll back the whole batch. Retrying the same IDs returns saved cards.

The purchase dialog accepts **1–100 boosters**, shows the total cost and remaining balance, and provides 1/5/10/Max shortcuts. Each pack costs 150 Prisms. A batch buys in full or charges nothing. Durable request receipts return the same pack IDs on retries; changing a receipt's quantity is rejected. Legacy single purchases keep their retry protection.

Registered accounts can claim **one free standard booster per UTC calendar day**. Guests must register. Claims are enforced on the server, tolerate concurrent retries and do not auto-open the pack. The next midnight UTC reset is displayed in the viewer's local time. Daily boosters use standard rarity/Holo odds.

## Duplicate cards

Collection has **Duplicate cards · Recycle & Trade Up** tools. Select spare copies of one rarity. Each action keeps at least one exact Standard/Holo copy of every selected card and preserves all reserved copies. Holo duplicates are excluded by default; enabling them and selecting them adds a warning before confirmation.

| Rarity | Recycling value per copy |
| ------ | ------------------------ |
| 1★     | 5 Stellar Prisms         |
| 2★     | 10 Stellar Prisms        |
| 3★     | 20 Stellar Prisms        |
| 4★     | 40 Stellar Prisms        |
| 5★     | 75 Stellar Prisms        |

**Trade Up** consumes exactly five spare copies of one rarity (mixed characters allowed), from 1★ through 4★, for one uniformly random enabled character of the next rarity. Each result has an independent **0.5% Holo chance**, matching normal boosters. 5★ cards cannot be traded up. Recycle and Trade Up recheck ownership/reservations on confirmation, write inventory/currency ledgers and preserve durable retry receipts. Guests can use these tools too. Confirmation is required before consuming copies.

## Individual boosters and duel rewards

New guest and registered profiles receive **three unopened starter boosters** instead of the old random starter collection. Each contains five cards, including one guaranteed 3★ or higher. Existing collections, decks, saves and accounts are preserved. Registering a guest preserves inventory, currency and unopened packs without granting another welcome bundle.

The first starter booster automatically builds a legal five-card deck. Its first four slots roll 1–3★ cards with weights 50:27:17, favoring unowned characters. Its fifth slot rolls 3★ 80%, 4★ 17%, 5★ 3%. Every pack has five distinct characters, ensuring that the first starter pack can form a legal deck. Duplicates between packs add inventory copies.

Standard boosters cost **150 Stellar Prisms**. The first four slots independently roll 1★ 50%, 2★ 27%, 3★ 17%, 4★ 5%, 5★ 1%; the fifth uses the guaranteed-slot odds above. Characters at the selected rarity are equally likely. Each card independently has a **0.5% Holo chance**; Holo is cosmetic and keeps identical stats. The Boosters screen publishes these odds and saved opening receipts. Updated odds apply to newly opened packs; saved opening receipts keep their existing results.

## Individual Standard cards

The Cards album has a compact Buy button beside each Standard card's name/ownership details. One copy costs **50 / 125 / 200 / 300 / 500 Stellar Prisms** for 1★–5★. Holo copies cannot be purchased directly. Guests can spend their earned Prisms too. A confirmation displays the cost and resulting balance. The server validates the definition and price, atomically charges currency and grants one copy, records both ledgers, and deduplicates a repeated request ID. A cancelled confirmation spends nothing. Purchases add collection copies without changing the active deck automatically.

## Temporary Draft boosters

Each matched Draft player receives three server-rolled five-card boosters, revealed automatically one by one before selecting a deck. Each pack has **random / random / random / 3★+ / 4★+** slots. Random and 3★+ slots use the normal revised odds above; the 4★+ slot uses **85% 4★ / 15% 5★**. Every slot has a **5% Holo chance**. The 15 characters are distinct, and an exceptional pool that cannot form a legal deck is resampled.

All 15 offers and the player's reveal count persist with the match. Reloading resumes opening without rerolling or granting extra cards. Reveal requests advance one position and are retry-safe; early deck locking is rejected. A player chooses five legal cards after revealing the packs, with the usual one-5★/one-4★ or two-4★ limit. The three-minute drafting deadline includes the opening ceremony; timed-out picks still complete automatically. Legacy unfinished eight-card drafts retain their original offers. These packs cost no Prisms, consume no permanent boosters, and never add cards to inventory. Draft duels keep Three Open, Same, Plus and Combo with no card trade.

A completed nine-placement duel awards **50 Prisms for a win, 25 for a draw, 10 for a loss**. Solo, multiplayer and guests participate. Forfeits, missed-turn forfeits and abandoned drafts pay nothing; bots receive no currency. The result overlay displays the persisted payout. Values and odds live in `ECONOMY` in `packages/shared/src/platform.ts`.

All rolling, charging, grants, inventory changes and rewards happen on the server. A purchase requires a client request ID unique to the profile; retries return the original pack without another charge. Opening is idempotent by pack ID. One database transaction saves the exact five card IDs, inventory ledger entries and opening receipt. Unopened packs expose no card contents. An account cannot open another profile's packs. Match payouts use unique ledger references so refreshes/retries do not pay twice. Currency cannot go negative.

Migration `005_economy_admin.sql` adds receipts, Prism balances/ledger and administration tables without resetting existing data. Older profiles keep their starter collection and begin at zero Prisms; the three-pack grant applies only to new profiles. Real-money purchases and currency-priced market listings are not implemented.

Migration 006 adds admin gift packs, grant receipts and saved new/duplicate indicators. Host operators can select any account in **Selected user tools** and grant Prisms or unopened standard boosters. In-game admins can use the testing grant form on player profiles. Both APIs validate roles/targets/counts, record an audit entry and deduplicate retries. Gift packs use standard odds, not the special starter collation. Opening remains persisted even if the available collection cannot yet form a legal deck.

The opening ceremony shows a sealed pack, one card at a time with rarity lighting and keyboard/touch controls, a five-card progress strip, and a final fan marking the best draw and saved new/extra copies. Individual reveals preload artwork before enabling the reveal, then wait 0.8 seconds before advancement; repeated Space/click events cannot skip the delay. Reveal all skips to the results. Closing an opening preserves its receipt; reduced-motion mode removes the non-essential pack animations. No pity system is implemented; duplicate recycling is a separate, confirmed action in Collection.
