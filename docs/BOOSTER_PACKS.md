# Boosters and Stellar Prisms — v0.12

**v0.13 shop presentation:** only Gacha Universe I and II are shown as shop tiles. Starter boosters remain exclusive grants and appear in the unopened inventory/count; use the shared Open packs control to open them. Removing their shop tile does not remove a player's starter packs.

## Pack types and odds

| Type              | Pool                                         | First four slots, 1★ / 2★ / 3★ / 4★ / 5★ | Guaranteed fifth slot | Holo per card |
| ----------------- | -------------------------------------------- | ---------------------------------------- | --------------------- | ------------- |
| Starter           | All released cards, rarities 1–4             | 50% / 35% / 10% / 5% / 0%                | 3★ ⅔, 4★ ⅓            | 1%            |
| Gacha Universe I  | Genshin, Star Rail, Zenless, Wuthering Waves | 50% / 27% / 17% / 5% / 1%                | 3★ 80%, 4★ 17%, 5★ 3% | 0.5%          |
| Gacha Universe II | Epic Seven, Star Savior, NTE, Endfield       | Same as Universe I                       | Same as Universe I    | 0.5%          |

The server rolls a rarity, then chooses uniformly among eligible characters at that rarity. Starter packs contain five distinct characters, favor unowned choices, and automatically build a legal first deck. Starter packs cannot be purchased, claimed daily or granted by admin tools: they are the initial three-pack welcome only. Registration preserves a guest's progress without granting another welcome bundle.

Holo is now a gameplay variant: acquisition randomly chooses a side below A and permanently adds **one** point to it. Existing A sides are excluded. Each possible orientation has a stable card ID. Decks, trades, Trade One, receipts and duplicate tools retain that exact variant. Aha's base A/8/A/2 can therefore receive +1 on Right or Left only. Rarity and deck limits do not change.

## Shop and automatic opening

Universe boosters cost **150 Stellar Prisms** each. Three compact shop tiles show counted stacks by pack type; Daily and Gift sources join their Universe I stack. The supplied Universe I/II images appear in the shop and opening sequence. Purchase 1–100 packs of a selected paid type, with 1/5/10/Max shortcuts and a cost/balance confirmation. The stable API type `standard` means Universe I; `universe-ii` means Universe II.

Open one, five, ten, or the current available amount up to ten. The combined Open N packs action can mix types while preserving each pack's own odds. A server transaction grants all cards and saves the complete receipt before the ceremony. Unknown or foreign pack IDs roll back the entire batch. Retrying the same pack IDs returns their original cards. Purchase retries also bind quantity and pack type, so changing either is rejected.

Opening automatically shows a sealed pack, then each card for about 1.45 seconds, then a short five-card spread before the next pack. Artwork is preloaded and decoded before revealing. There are no Next or Reveal all controls. Results mark new/extra copies and can be reviewed afterward. Closing preserves awarded cards; reloading recovers the saved opening receipt without rerolling. Starter opening leads into the tutorial and automatically prepared first deck.

Registered accounts can claim **one free Universe I booster per UTC calendar day**. Guests must register. Claims tolerate concurrent retries and do not auto-open the pack. The next midnight UTC reset is displayed in local time. Host and in-game admin gift tools grant Universe I packs using paid-pack odds.

## Currency and direct purchases

A completed nine-placement duel awards **50 Prisms for a win, 25 for a draw, 10 for a loss**. Guests participate. Forfeits, missed-turn forfeits and abandoned drafts pay nothing; bots receive no currency. Unique ledger references prevent repeat payouts. Real-money purchases and currency market listings are not implemented.

The Cards album sells **Standard copies only**, for **50 / 125 / 200 / 300 / 500 Prisms** at rarities 1★–5★. Holo cannot be bought directly. The compact Buy button stays beside metadata. Confirmation displays cost and remaining balance. Server validation, atomic charging, ownership grants and durable request IDs prevent duplicate charges. A purchase does not replace the active deck.

## Duplicate cards

Collection's Recycle & Trade Up tools keep at least one exact Standard/Holo variant and all reserved copies. Holo is excluded by default; opting in warns before consumption.

| Rarity | Recycling value |
| ------ | --------------: |
| 1★     |        5 Prisms |
| 2★     |       10 Prisms |
| 3★     |       20 Prisms |
| 4★     |       40 Prisms |
| 5★     |       75 Prisms |

Trade Up consumes exactly five spare copies of one rarity, mixed characters allowed, for a random enabled card one rarity higher. It supports 1★ through 4★ inputs. The result has **0.5% Holo chance**, with its side bonus rolled on acquisition. Both actions recheck ownership/reservations at confirmation, record ledgers and retain retry receipts. Guests can use them too.

## Temporary Draft boosters

Matched Draft players each automatically reveal three temporary five-card packs. Each pack uses **random / random / random / 3★+ / 4★+** slots. Random slots use paid-pack odds; 3★+ uses 80/17/3%; 4★+ uses 85% 4★ / 15% 5★. All released universes are eligible. Each slot has **5% Holo chance**, including the same fixed +1 side bonus. Fifteen distinct characters form a legal candidate pool.

Cards and reveal progress persist with the match. Reloading resumes without rerolling. Early deck locking is rejected. After all reveals, choose five cards under the usual one-5★/one-4★ or two-4★ limit; sorting by total stats or rarity and a compact desktop grid remain available. The three-minute draft deadline includes opening, with automatic picks on timeout. These packs cost nothing, consume no owned packs and never enter permanent inventory. Draft duels use Three Open + Same + Plus + Combo, without card trade.

## Release reset

v0.12 has an explicitly authorized, offline, one-time gameplay wipe; normal migrations do not repeat it. It preserves authentication users, password credentials, admin roles and account links, resets all gameplay progress, and grants three Starter packs to each retained linked profile. See [the maintenance procedure](RELEASE_V12.md). Accounts created later receive the same three starters automatically.
