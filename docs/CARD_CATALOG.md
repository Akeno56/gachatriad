# Published cards — approved v1

`data/cards/catalog.json` contains **400** cards promoted from `data/balance/proposals.json` after explicit user approval on 7 November 2026. It replaces the old twelve-card test catalog; there are no original placeholder characters in the playable catalog. IDs include universe prefixes, preserving alternate forms as distinct cards. Eleven unscored entries remain artwork-only.

`data/cards/release.json` records the balance configuration hash, source snapshot, approved count and excluded IDs. Each card preserves its balance version, directional stats, converted rarity and available element. Conditional-tier and element-review notes remain in the original proposals; promotion does not claim those assumptions vanished. Changing or importing source data alone does not alter published cards. Run `pnpm balance:draft` for proposals and deliberately run `pnpm cards:promote` for a new release.

The owned starter grant includes the ten named default/CPU cards, two random 5★ cards, four random 4★ cards and eighteen lower-rarity cards, deduplicated. This is a one-time local starter grant, not a fake currency or pack system. Saved decks require five owned available unique base characters and normal rarity restrictions. The Cards album displays the published catalog and finish previews with unowned copies greyed out; Collection displays owned inventory and the deck builder. Holo copies have distinct ownership IDs and identical gameplay values; their acquisition comes with boosters.

All 411 imported portraits are indexed separately by universe and character. Source URLs, hashes and provenance stay in the import metadata; the user-facing library has no per-character source links. Prydwen, game owners and music contributors are credited on `/credits`.
