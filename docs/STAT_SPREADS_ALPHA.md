# 0.1.0 Alpha stat spreads

814 cards; 660 duplicate spreads redistributed. Distinct spreads: **154 → 814**.

Every base card keeps its total, rarity, element and ID. Aha stays A / 8 / A / 2. **1★–3★ printed and Holo values range from 1 to 8. 4★–5★ range from 1 to A.** Each total reserves existing distinct, cap-compliant spreads first, then distributes duplicates to unused legal spreads, preferring new number combinations as well as orientations. If a total exhausts its legal possibilities, the least-used spreads are filled first. Selection is deterministic and does not change on restart.

| Rarity | Base cards | Side cap | Highest base side | Highest Holo side | Invalid cards |
| ------ | ---------: | -------: | ----------------: | ----------------: | ------------: |
| 1★     |        127 |        8 |                 8 |                 8 |             0 |
| 2★     |        242 |        8 |                 8 |                 8 |             0 |
| 3★     |        201 |        8 |                 8 |                 8 |             0 |
| 4★     |        159 |       10 |                10 |                10 |             0 |
| 5★     |         85 |       10 |                10 |                10 |             0 |

The shared catalogue applies this versioned rule to both browser and server. Startup updates card definitions, so owned cards, decks and trade offers pick up their current definition. Active games keep their starting snapshot until finished. No inventory is removed.

Existing Holo IDs remain valid. If their former +1 direction reaches the rarity's cap, the bonus moves to the next eligible direction; every Holo retains exactly +1 total and no side exceeds its rarity's cap. New drops choose equally between eligible sides. Elemental cell modifiers continue to apply during matches.

The authored Combo puzzle uses fixed teaching values so its demonstration remains reproducible. Its UI identifies those values as training values.

Full before/after data: [stat-spread-alpha010.json](../data/balance/stat-spread-alpha010.json). Regenerate with:

    node --import ./apps/server/node_modules/tsx/dist/loader.mjs tools/asset-importer/stat-spread-report.mjs
