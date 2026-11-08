# v0.12 — Gacha Universe II

## Published pools

| Booster           | Universes and playable cards                              | Total |
| ----------------- | --------------------------------------------------------- | ----: |
| Gacha Universe I  | Genshin 129, Star Rail 93, Zenless 61, Wuthering Waves 60 |   343 |
| Gacha Universe II | Epic Seven 362, Star Savior 51, NTE 24, Endfield 34       |   471 |

The catalogue has **814 base cards**. Starter packs use all released universes at rarities 1–4. Universe boosters cost 150 Prisms. Daily and admin gift packs use Universe I. The two paid-pack artworks and logo are user-provided files copied to `apps/web/public/assets/ui`; no generated illustrations were used. See [booster odds and opening behavior](BOOSTER_PACKS.md).

## Imports and score assumptions

The inert saved-page parser read 389 Epic Seven and 55 Star Savior records, including original rarity, element, role, tier and image references. It never executes page scripts. All 1,332 public expansion images validated: portrait, listing and icon for each of the 444 records. The combined manifest has 2,144 images: 855 portraits, 845 icons and 444 listings. Thirty-one new records without tiers remain artwork-only; the complete release excludes 41 unscored records.

```sh
node tools/asset-importer/import-hideout.mjs --inspect
node tools/asset-importer/import-hideout.mjs --promote
pnpm assets:validate
```

The adapter reads saved HTML under ignored `hideoutGachaData/`, caches validated files, and records original URLs, checksums, dimensions and source context. It is separate from the offline Prydwen importer. Reports, proposals and CSV are in `data/expansions/gacha-universe-ii/`.

Scoring retains **25% normalized rarity / 75% normalized tier** with fixed thresholds, so new games do not rebalance old games by percentile. E7 original 3/4/5 stars map to 0/0.5/1; Star Savior SR/SSR map to 0/1. E7 tiers SSS/SS/S/A/B/C map to T0/T0.5/T1/T2/T3/T4. Star Savior SS/S/A/B/C map to T0/T1/T2/T3/T4. Missing tiers stay missing.

Epic Seven's saved default PvP tiers describe **RTA pick frequency**, a contextual proxy rather than a direct strength measurement. This assumption remains in data and credits. Sources: [E7 tiers](https://www.hideoutgacha.com/games/epic-seven/tier-list), [E7 characters](https://www.hideoutgacha.com/games/epic-seven/characters), [Star Savior tiers](https://www.hideoutgacha.com/games/star-savior/character-tier-list), [Star Savior characters](https://www.hideoutgacha.com/games/star-savior/characters).

Approved elements: E7 Fire/Ice/Earth unchanged, Light → Holy, Dark → Poison; Star Savior Sun → Fire, Moon → Ice, Star/Order → Holy, Chaos → Poison.

Aha is an explicit user override: **5★, A / 8 / A / 2, total 30**, two above the next highest base total of 28. Its T0 label is a design decision, not a sourced tier placement. `data/balance/overrides.json` preserves the exception on regeneration. Existing neutral affinity remains. HSR Ellen/Astra Yao collaboration entries stay excluded; ZZZ originals remain playable.

## Holo and presentation

Acquisition chooses a side below A and adds +1 permanently. The legacy `::holo` ID is one deterministic orientation; other orientations use `::holo:<side>`. New drops uniformly choose eligible orientations, and every ownership transfer retains the exact side. Foil now takes 5.25 seconds per cycle. The saved Animate Holo & CRT switch controls continuous motion.

Capture presentation stages Same, Plus, ordinary and Combo groups over the authoritative server result. Named phases splash before flips/score resolve; incoming snapshots buffer until presentation completes. Other changes: centered starter welcome, automatic booster opening, compact shop, sticky logo header, chat titles under names, combined required/excluded lobby filters, ranked Draft entry, and saved rules prompts per profile/mode. First-time Ranked Trade One consent remains server-enforced. Rematch becomes unavailable when the opponent leaves, disconnects or becomes busy.

## Authorized one-time gameplay reset

This update's reset was explicitly requested. **Normal startup migrations do not repeat it.**

1. Stop Server Control's game server and public link. Maintenance refuses a live controller/server on the normal ports.
2. Run `pnpm --filter @gacha-triad/server exec tsx ../../tools/reset-gameplay.ts --confirm-v012` using the supported project Node on PATH.
3. A cold backup copies `.data/postgres`, the auth secret and controller config to ignored `.cache/before-v12-reset-<timestamp>/` before modifying data.
4. A transaction clears inventory, decks, currency, packs/receipts, games, achievements, titles, avatars, lobbies, offers, friends, invitations, chats and action history. Ratings return to 1000, tutorial/Ranked consent resets and bots turn off.
5. Login users, passwords, account links, sessions, admin roles and access restrictions remain. Every retained linked profile gets three Starter packs. Credential/admin fingerprints must match. A private `reset-report.json` records verification beside the backup.
6. The database records `v0.12-holo-starters`; running again does not erase new progress. Restart the updated backend after verification. Never commit the backup or secret.

Publish using [the Pages guide](ONLINE_DEMO.md#publish-later-changes). Both the Pages client and PC backend need the update.
