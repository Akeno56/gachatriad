# Character artwork importer

The importer consumes user-saved Prydwen pages and their local `_files` folders. It does **not** make network requests, execute saved JavaScript, follow links, or use private APIs. An initial attempt to discover the full catalog directly returned HTTP 403 / an anti-bot page in ordinary HTTP and an unmodified browser. The user supplied complete browser saves instead; those restrictions were not bypassed.

## Commands

```sh
pnpm assets:inspect
pnpm assets:import
pnpm assets:import --input "E:/path/to/saved-pages"
pnpm assets:import --overwrite
pnpm assets:validate
```

Save both **Characters** and **Tier List** pages as **Webpage, Complete** for each supported game. Keep HTML files and their companion resource folders together. Default input: `prydwenData/`. Repeating the command imports new/changed files and leaves cached images alone. Raw exports are excluded from Git and formatting.

There is also a separate, narrower `pnpm assets:import:selected` utility for explicitly selected individual CDN URLs in `data/assets/selected.json`, with `--card`, `--dry-run`, and `--overwrite`. It does not crawl pages. The full roster was imported from local files, not this URL utility.

## Observed source adapters

The saved pages were inspected before implementation. HSR, ZZZ, WuWa, Endfield, and NTE use character links containing `.avatar` / `.disable-transition` character images. Genshin uses `.character-image` on character anchors. Portraits come from character directories; square icons come from tier lists. Element, weapon, specialty, and other interface icons are excluded. Repeated tier-list appearances are deduplicated.

HTML entities in saved folder names are decoded through Cheerio. Relative resource paths are resolved only inside the explicitly supplied input folder; traversal and remote URLs cannot masquerade as local files. Files are read directly, never executed. Character identity is keyed by universe and the full variant slug, preserving alternate forms such as March 7th variants and Anby variants.

## Outputs

- `data/characters/catalog.json`: independent character records, names, source pages, stable variant IDs, available asset paths, and an optional existing battle-card association.
- `data/assets/manifest.json`: optimized asset records with SHA-256, original/output dimensions, source page/URL where available, saved reference, import time, version, crop metadata, and public-distribution review status.
- `data/assets/import-report.json`: page counts, universe counts, imported/cached files, warnings, and failures from the most recent run.
- `apps/web/public/assets/characters/<universe>/<character>/portrait.webp` and `icon.webp`: Sharp-optimized images preserving aspect ratios, without enlarging source images.

Existing starter IDs are preserved through the selected-source associations. Asset import never assigns card stats, changes a deck, or creates inventory ownership. It also records observed original rarity, element, role, and tier placements with source context/copy assumptions. The separate `balance:draft` command uses that metadata for reviewable candidates, not automatic live-card changes. Missing artwork keeps a nonillustrated fallback. The album renders 24 entries per page. Small derived client indexes (`data/assets/card-artwork.json`, `data/characters/gallery.json`) keep full provenance and balance metadata out of the browser bundle.

## Current verified import

Twelve HTML exports produced **411 characters / 811 assets**:

| Universe              | Characters |
| --------------------- | ---------: |
| Genshin Impact        |        129 |
| Honkai: Star Rail     |         95 |
| Zenless Zone Zero     |         66 |
| Wuthering Waves       |         61 |
| Arknights: Endfield   |         34 |
| Neverness to Everness |         26 |

All **411 portraits** are present. **400 source icons** are present; eleven characters do not appear with a separate saved icon. These are optional variants, not failed imports. Validation checks every output file, dimensions, unique IDs, and provenance. A second import produced **0 new / 811 cached** assets with no warnings or failures.

All artwork is marked `development-only-unreviewed` and `publicDistributionApproved: false`. Provenance is not a license grant. Public distribution still requires approval from the appropriate rights holders. No generated card or background illustrations are included.

Still pending from the full Milestone 3 design: manual crop editing, asset admin UI, public-rights review workflow, additional permission-based sources, and generalized arbitrary-file imports. `assets:optimize` is not a standalone command yet; optimization runs as part of import.
