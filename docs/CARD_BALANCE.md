# Card balance: normalized, versioned draft model

**Publication update:** the user approved the computed cards on 7 November 2026. The 400 scored rows are now the published playable catalog in `data/cards/catalog.json`, with a release receipt. Eleven unscored rows remain artwork-only. Conditional tier and element notes are retained; approval did not remove their assumptions. Future proposal regeneration remains separate from publication. The former twelve test cards have been removed.

This follows the user's updated design direction from 7 November 2026: original-game rarity and Prydwen tier placement **do influence** proposed Triad rarity and directional budget. That supersedes the earlier master-spec restriction against tier-derived stats. The original specification is retained as a historical reference; current decisions are recorded here.

Reference: [user's example Google Sheet](https://docs.google.com/spreadsheets/d/1mW3Vo1iwzAl633v_qWkNw0Z9glStxb62d7XJCexGCW4/edit?gid=0). Read through its public CSV export. Its example numbers are treated as placeholders, not balance targets. The live Google Sheet was not edited.

## Calculation

Keep three distinct concepts: **Power Index** (0–100 normalized input score), **Triad rarity** (1–5 stars), and **Adjusted Score / stat budget** (total directional points). Adding a source star count directly to a tier number mixes incompatible scales.

1. Normalize source rarity to 0–1 using an explicit fixed ladder for each game. Genshin/HSR/WuWa: 4★ → 0, 5★ → 1. ZZZ/NTE: A → 0, S → 1. Endfield: 4★ → 0, 5★ → 0.5, 6★ → 1. These are model priors, not claims that original-game rarity measures Triple Triad strength.
2. Normalize tiers with fixed anchors: `TierScore = 1 − TierNumber / 5`. T0 → 1; T0.5 → 0.9; T1 → 0.8; T2 → 0.6; T3 → 0.4; T4 → 0.2; T5 → 0. Unknown/missing labels stay missing. A T0 score of zero in the label is valid and never treated as absent.
3. Deduplicate identical placements by view, role, copy assumption, and tier. If there are several different placements, use their **median** rather than picking the best role or counting repeated appearances more heavily. Record the source context and assumptions. This uses only the views in the supplied saves; it does not pretend all game modes were observed.
4. `PowerIndex = 100 × (0.25 × OriginalRarityScore + 0.75 × MedianTierScore)`.
5. Look up the rarity band and interpolate the point budget within that band. Keep full precision for band selection and round only the final point count.

| Triad rarity | Minimum Power Index | Total point range | Highest permitted side |
| ------------ | ------------------: | ----------------: | ---------------------: |
| 1★           |                   0 |             12–15 |                      6 |
| 2★           |                  25 |             16–18 |                      7 |
| 3★           |                  50 |             19–21 |                      8 |
| 4★           |                  80 |             22–25 |                      9 |
| 5★           |                  98 |             26–28 |                 A (10) |

Within a band, let `f = clamp((PowerIndex − BandStart) / (NextBandStart − BandStart), 0, 1)`. For the top band the upper endpoint is 100. Then `Budget = ROUND(BandMinBudget + f × (BandMaxBudget − BandMinBudget))`.

This avoids distributing 30+ points to ordinary cards. 40 is the theoretical `A/A/A/A` ceiling; such a card has no weak side and cannot be captured ordinarily. The current authentic engine uses sides **1–A**, so its mathematical minimum is 4, not 0. The proposed normal-card range is deliberately narrower, 12–28. Actual zero-valued sides have not been enabled.

The weights, thresholds, and point ranges are a **configurable starting calibration**, not empirically proven balance constants. The first loose 5★ threshold of 90 put 131/400 scored characters at 5★; the stricter proposed threshold of 98 reduces that to 68/400. No forced per-game quota or live percentile is used: adding new roster entries must not silently change every existing card's score.

## Examples from the user's sheet

| Character      | Original rarity / tier | Power Index | Proposed Triad rarity | Total points | Proposed element |
| -------------- | ---------------------- | ----------: | --------------------: | -----------: | ---------------- |
| Sampo          | HSR 4★ / T5            |           0 |                    1★ |           12 | Wind             |
| Vodyanitsa     | Genshin 5★ / T0        |         100 |                    5★ |           28 | Water            |
| Lacrimosa      | NTE S / T0             |         100 |                    5★ |           28 | Poison           |
| Orphie & Magus | ZZZ S / T1             |          85 |                    4★ |           23 | Fire             |

Vodyanitsa and Lacrimosa get the same total budget because their normalized inputs are the same, rather than receiving different bonuses merely for belonging to different games. Their directional patterns differ. Sampo's saved tier placement assumes **E6**, which remains a review flag.

## Directional values

Total points do not uniquely determine card strength. An adjacent pair of A values behaves very differently from evenly distributed 7s, especially under Same, Plus, Reverse, and Fallen Ace.

The draft allocator uses four versioned shapes: balanced, corner, spear, and guard. A stable character-ID hash chooses a shape and orientation. It is reproducible and never draws unrestricted random values. Starting from four 1s, points are allocated proportionally while respecting the rarity's side cap. The result must contain exactly four integer values, sum to the budget, and stay within 1–10. Same character + same model + same source snapshot always produces the same proposal.

This allocation is a **candidate**, not a declaration that the card is balanced or lore-accurate. No main-game card has been overwritten. Further checks must include corner strength, defensive exposure, Same/Plus opportunities, first-player advantage, legal mixed-rarity decks, and win-rate comparisons under multiple presets. Equal point sums alone are insufficient.

## Elements

Element conversion is a separate semantic mapping; a character's tier or rarity never changes its element. Direct mappings include Pyro/Fusion/Heat → Fire; Hydro → Water; Cryo/Glacio → Ice; Electro/Electric → Lightning; Aero/Anemo → Wind; Geo → Earth. Chaos → Poison follows the user's explicit Lacrimosa example.

Physical currently means **no elemental affinity**, rather than being silently changed to Earth. Dendro/Nature → Poison, Imaginary/Spectro → Holy, and Havoc → Poison are only thematic proposals and are flagged for review. Quantum, Ether, Lumiflux, and NTE's abstract elements (Incantation, Lakshana, Psyche, Cosmos, Anima) are deliberately left unmapped instead of inventing a canonical equivalence. All mappings are visible in configuration.

## Data quality and versioning

The saved character directories supply original rarities/elements. Saved tier lists supply visible tiers, roles, and copy assumptions. No remote scraping or current live API is required. Missing rarity/tier prevents a numeric proposal; it is not interpreted as the weakest character. Uncertain element conversions and upgraded-copy tier assumptions get explicit review notes.

Current results for 411 entries: **164 draft-ready, 236 requiring review, 11 with insufficient scoring data**. Thus 400 have candidate rarity/budget/spread values. Review notes include upgraded-copy assumptions (including C6/E6), expert conditions, and uncertain element conversions. Draft-ready means the input/model validation passed, not that competitive playtesting or publication approval is complete.

Version `draft-v1`, a hash of the source metadata snapshot, and a hash of the model configuration are stamped on every proposal. Tier-list updates must create a reviewed future balance revision; they must not rewrite persistent inventories, historic matches, deck snapshots, or market state automatically.

## Reproduce and review

```sh
pnpm assets:import      # re-extract metadata from saved pages; no network requests
pnpm balance:draft      # calculate draft proposals; does not edit live cards
pnpm test               # includes normalized scoring, monotonicity, invariants, parser fixtures
```

Configuration: `data/balance/config.json`. Pure calculation package: `packages/balance`. Review outputs: `data/balance/proposals.json` and `data/balance/proposals.csv` (Google Sheets/Excel-importable). Source columns, tier assumptions, source URLs, model status, and notes are included alongside results. The worksheet can later implement these same helper lookups/formulas; the supplied Google Sheet was read only.
