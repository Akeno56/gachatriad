# Booster packs — next feature

The user requested boosters soon, followed by rare cosmetic Holo cards. Packs are the next acquisition feature; the current build does not pretend to charge currency, grant currency rewards or open packs.

The foundation is ready: `CARDS` holds 400 base cards; `HOLO_CARDS` provides one separate owned/tradable finish per base card; `ALL_CARDS` has 800 definition identities. A Holo copy has the same values, rarity and element as its base card. It uses the same imported illustration with a restrained animated foil. Five-star prestige frames are independent of Holo. Reduced-motion settings keep a static foil treatment.

Owned quantities and reservations refer to exact definition IDs, including finish. Deck legality treats standard and Holo copies as the same character, so a finish cannot add a duplicate-character slot. Match snapshots, hidden-hand redaction, card exchange and Trade One preserve the finish. Collection achievements count unique base cards, preventing cosmetic duplicates from accelerating progress.

Before introducing packs, specify the currency name, earn rate, pack size/cost, rarity guarantees, duplicate policy and published Holo probability. The intended finish chance is very rare and independent of gameplay stats. Implement pack purchase and opening on the server with transaction/ledger idempotency and a persisted receipt; never roll or charge in the browser. Keep first-time grants, bots and practice clearly distinguished from pack acquisition.

Future currency gains belong in the existing match-settlement overlay. Currency listing price-range controls belong alongside the existing rarity/universe/finish/ownership exchange filters once real prices and balances exist. No prices or payouts are fabricated in the current UI.
