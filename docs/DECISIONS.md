# Decisions and validation

## 7 November 2026 — v0.4 player feedback and PC hosting

Results and all game dialogs are centered overlays. Market guests receive actionable account guidance; filters cover acceptability, offered/requested rarity, universe, finish, missing cards, duplicates and sorting. Unowned album entries are greyed out, Character Library is removed from the UI, Decks becomes Collection, and Credits moves to the small main-menu footer link. Music preference survives refresh and resumes on an allowed gesture.

Elemental generates/persists marked cells and adjusts ordinary/Combo comparisons, while Same/Plus retain printed values. Custom Combo is explicit. Both UI and server require Closed + Same + Plus + Combo for Trade One, permitting extra rules. First-duel onboarding is persisted and enforced before starting/joining matches. Public player profiles exclude private deck/inventory data.

Each base card has a stat-identical Holo definition with separate ownership/trading identity; legality and collection achievements use base identity. Holo acquisition belongs to forthcoming boosters. The current album offers a visual preview, and 5★ framing is independently distinct. No pack costs, currency payouts or prices are invented.

The GitHub Pages export supports the `gachatriad` base path and runtime server selection. The loopback PC control tool manages the backend, its logs, real socket presence, a static local preview and an optional official Cloudflare Quick Tunnel. Cross-origin clients use signed bearer sessions rather than relying on third-party cookies. The tunnel helper is installed locally; the actual GitHub repository/site has not been created or published.

Validation: 64 unit/server tests, 29 desktop/mobile browser journeys (one shared bot test intentionally skipped on mobile), type checks, formatting, asset validation and the static production build pass. The local hosting test connects two independent browser clients, plays a complete Elemental duel, tests cookie-free refresh and static navigation, restores the active match/inventory after restart, and verifies graceful shutdown without SIGKILL. A preClose hook drains the simulation and closes socket transports before database shutdown, allowing clients to reconnect normally.

The user subsequently gave explicit approval for an isolated public-relay test. The Cloudflare HTTPS relay passed signed cross-origin guest authentication, two real WSS connections, connected-player reporting, shared lobby creation/joining and a complete nine-move Elemental duel. Only fresh guests in a separate test save were used. The temporary relay was closed immediately afterward; the main save and accounts were not used. The earlier automatic approval rejection is resolved for this specifically approved test. Normal `pnpm test:host` remains local-only.

## 7 November 2026 — v0.3 user-directed expansion

Final validation: 52 unit/server tests pass; all 19 distinct desktop/mobile browser journeys pass (the shared bot-population journey runs once). The production build passes. A separate restart probe restored its authenticated profile, exact inventory and active match, confirmed all ten bots remained enabled, and captured desktop/mobile production screens in `docs/screenshots/v03-*.png`. The local production preview is served on port 3000 with its loopback server on 3001.

Later user requests supersede the milestone order below. Publish 400 approved cards, retire twelve earlier test cards, enlarge desktop board/cards to 150% while keeping menu chrome compact, remove per-character source links and consolidate credits.

Implement real local Fastify/Socket.IO services with Better Auth guest/email sessions and embedded PostgreSQL via PGlite. Sessions, inventory, legal decks, lobbies, matches, Elo, Draft rating, achievements and transfers persist in ignored `.data/`. Hidden hands are redacted in server DTOs. Results, stake settlement and card exchanges use transactions and ledger constraints.

Unranked is Three Open + Same/Plus/Combo. Ranked is closed Same/Plus/Combo with Trade One. Custom rules share a public waiting/playing browser; Draft and Roulette are separate queues. Draft replaces the planned Arena runs with one duel and independent rating. In v0.10 the user requested three automatically opened temporary boosters and a five-card deck chosen from fifteen offers, replacing the previous eight-card pool. These boosters and their 5% Holo rate are Gacha Triad design choices; the official FFXIV description does not specify this pack structure.

The user explicitly requested bots to populate local testing. Ten persistent, labeled bots use the same game/inventory services, open tables, play an exhibition, join player tables, draft and exchange owned cards. Population can be paused without abandoning current games. Local bot activity affects the local save; it is never represented as human matchmaking. Production disables bot controls unless explicitly enabled.

Use the user-supplied GlacialSpoon Queen of Cards recording without editing its original file. Two audio decks use a six-second equal-power crossfade from the ending to the opening. Browser tests seek near the end and observe the incoming deck start and outgoing deck pause. This is smooth-repeat playback, not a claim of a musically exact loop. No AI-generated illustrations or backgrounds are introduced.

Validation includes 52 unit/server tests (guest conversion, redaction, queues, full Draft game, concurrent Trade One/offer settlement, bot provisioning and engine rules) plus desktop/mobile browser game journeys, the updated real-card Combo lesson, MP3 crossfading, responsive pages and a complete bot/account/trade journey. A browser failure exposed an empty JSON header on DELETE requests; the API helper now sends Content-Type only with a body. Remaining current validation is recorded in the completion notes after the production pass.

## 7 November 2026 — Milestone 1

- Begin with a real local CPU game as explicitly requested. Accounts, fake economy, and pretend online queues are out of scope.
- Next.js App Router + React + TypeScript + Tailwind in pnpm workspaces. The installed lockfile resolves Next.js 16.4.5, React 19.3.1, Vitest 4.1.12, and Playwright 1.65.0. The workspace requires Node 22.12+.
- Select Webpack explicitly. Turbopack's PostCSS subprocess failed to connect in the restricted Windows sandbox; the Webpack production build succeeds.
- Keep the engine standalone and immutable by API convention. Snapshot card definitions and rules at creation; do not deep-freeze returned objects. Keep art in frontend components and catalog definitions in JSON.
- Use Web Crypto only to seed local practice. Engine randomness is injected; tests replay seeded matches. This is not a server-authoritative release.
- Easy CPU uses random legal moves 75% of the time and heuristic decisions otherwise. Normal evaluates immediate captures (including Same/Plus/Combo), exposed stats, and weak sides. Neither is minimax. CPU views omit the opponent hand even under All Open, so its decisions never require hidden knowledge.
- Same/Plus share a pre-capture snapshot. Special captures, ordinary placement captures, then breadth-first Combo. Same takes labeling precedence when the same target also qualifies for Plus. See GAME_RULES.md.
- Native HTML controls and modal dialogs support keyboard play and focus trapping. Board buttons announce row, column, card identity, and ownership. Reduced-motion preference disables nonessential transitions. Mobile places hands beneath the board.
- No timers in practice. No persistence or match resume; refresh/navigation loses the match. In-game rules open a dialog so they do not interrupt play.
- Original geometric placeholders ensure the game has zero third-party artwork/network dependencies. Test character catalog is provisional. The two original extra cards explicitly demonstrate rarity/number extremes.

## Validation

Engine/catalog suite: 28 tests passed, including 200 seeded full matches over all presets with score/card conservation and state immutability checks. Cases cover directional captures, equal/stronger/friendly/diagonal non-captures, row boundaries, invalid moves, seeded first player, Same friendly participation, multiple Plus sum groups, simultaneous Same/Plus, Combo chains and non-chain captures, tenth-card scoring, draws, both winners, and CPU knowledge isolation.

Workspace TypeScript checks pass. Production build passes with static routes `/`, `/cards`, and `/rules`.

Browser acceptance: **16 Playwright tests passed** across desktop Chromium (1440px) and mobile Chromium (iPhone 13 emulation). Real matches cover all five presets and both CPU difficulties. Controlled starting seeds exercise distinct victory, defeat, and draw screens; all actions are played through the UI. Checks include correct ten-point scoring, nine placed cards, the one remaining hand card, closed-hand redaction, rematches, rules dialog/Escape, keyboard selection, selection feedback, safe abandonment, catalog search/filtering, and rulebook navigation. Additional active-match captures at 320px and 768px verify viewport fit and accessible navigation.

Visual review of lobby, finished desktop/mobile matches, and active narrow-phone/tablet matches found and fixed a skip-link overlay. The catalog filter now has an explicit accessible name; hand and board labels include directional values. No outstanding gameplay defects were found in these checks. Mobile uses ellipsis for long character names in small cards; full names and stats remain in accessible labels.

The final production build passes after stopping the dev server. A production rebuild attempted while the elevated dev server was running encountered a sandbox directory permission error; serializing the build outside isolation resolved it. The production smoke journey and server are verified separately. Formatting checks pass. No paid service was used.

Review artifacts: [lobby](screenshots/lobby-desktop.png), [phone match](screenshots/match-phone.png), [victory](screenshots/victory-desktop.png). Playwright regenerates detailed reports and captures under ignored output directories.

## 7 November 2026 — RPG presentation, assets, and draft balancing

The user requested a game-like interface with classic FF menu influence, pixel typography/CRT, audio, recognizable artwork, and clearer Combo feedback. The UI now uses blue beveled windows, a title/menu composition, collectible portrait frames, a compact battle HUD, and no website marketing header/footer. Original synthesized Web Audio music is opt-in; SFX and CRT have independent controls. Fonts are locally bundled VT323 and Rajdhani with license copies under `public/licenses`. Generated portrait/background experiments were rejected by the user and are not used or bundled. All actual character artwork is sourced from Prydwen.

The user supplied complete saved character and tier-list pages after direct directory access returned HTTP 403 / an anti-bot page. No restriction was bypassed. The offline importer reads those files without executing scripts or making requests. It supports the five initial games plus explicitly requested NTE. Final import: **411 distinct character/variant records, 411 portraits, 400 source icons**. All files/dimensions/provenance validated; repeated import yielded **0 new / 811 cached** assets with no failures. Artwork remains development-only, public distribution unapproved.

Combo was already implemented correctly. A real four-move setup exposes Plus → Kaeya → Chixia → Amber. It is now an interactive lesson, with production-engine moves, staggered flips, reason badges, callouts, and sound. All **22 desktop/mobile browser tests passed**, covering the earlier five presets and all result types plus the new archive, variants, Combo lesson, and actual running Web Audio contexts/note scheduling. Narrow phone/tablet fits were checked. No runtime errors were found in desktop/phone screenshot review.

The user subsequently changed the balancing direction: original rarity and Prydwen tiers should influence Triad rarity and points. This explicitly supersedes the previous no-tier-derived-stats requirement. A pure `packages/balance` calculator and `draft-v1` configuration produce source-linked JSON/CSV review reports for all 411 characters. **400 have numeric proposals**; 11 lack sufficient data. After retaining full constellation/eidolon/cinema/expert conditions, 164 proposals have complete unflagged inputs and 236 need review. Reports include configuration and source-snapshot hashes. No active card stats were changed and no live Google Sheet was edited. See CARD_BALANCE.md for formulas, thresholds, examples, calibration distributions, and the need for gameplay simulation before competitive release.

Final validation: **41 unit tests**, workspace TypeScript, formatting, and artwork validation pass. The production build succeeds. Current presentation screenshots: [title screen](screenshots/rpg-title-desktop.png), [phone battle](screenshots/rpg-battle-phone.png), [Combo lesson](screenshots/rpg-combo-lesson.png). The full browser suite passed 22 cases; the final production smoke suite covers a full match, the real Combo chain, archive browsing, and audio controls.
