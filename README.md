# Gacha Triad

A local Triple Triad fan game with FF-style menus, CRT presentation, 400 playable cross-game cards and persistent multiplayer services.

**v0.4:** results now open over the board in a centered dialog; all game dialogs center consistently. Cards shows collection ownership and Standard/Holo finishes, with unowned copies greyed out. Character Library has been removed from the UI. Decks is now **Collection**, without artwork-inspection buttons. The main menu keeps a small bottom-right Credits link instead of a navigation tab. Music on/off is remembered and resumes on the next permitted gesture after reload.

Elemental is available in practice, custom tables and Roulette: marked cells apply +1 for matching affinity and −1 for mismatches, including cards with no affinity. Same/Plus use printed ranks; ordinary and Combo captures use adjusted ranks. Card and cell icons expose the rule. Custom Combo is explicit, and Trade One requires Closed + Same + Plus + Combo; additional rules remain allowed. Fresh guests/accounts must complete the short tutorial or acknowledge the rulebook before their first duel; this is enforced by the server.

Player profiles expose records, ratings, achievement unlocks and a chosen owned profile card. Private decks and inventory are not exposed. Every base card has a separate cosmetic Holo definition with identical stats and an animated foil; 5★ cards have an ornate crown/frame. Holo acquisition comes with the upcoming booster feature. The album can preview the finish now, and inventory/decks/matches/trades already preserve exact finishes.

## Host a showcase from your PC

See the complete [GitHub Pages + PC server guide](docs/ONLINE_DEMO.md). The expected project address is `https://akeno56.github.io/gachatriad/`; the repository has not been created or published automatically.

```sh
pnpm build:pages
pnpm control
```

Open `http://127.0.0.1:3030` for server start/stop/restart, connected players, logs, an optional local static preview, and a public HTTPS session link. The panel stays on loopback. The game frontend selects its server at runtime; separate browser accounts/guests share the same PC world through signed authenticated requests and sockets. `pnpm test:host` verifies this layout with two independent browser clients and an isolated test save.

```sh
pnpm install
pnpm dev
```

Open [the game](http://127.0.0.1:3000). This starts Next.js on port 3000 and the game server on 3001. Node 22.12+ is required. PostgreSQL runs locally through PGlite; no separate database installation is needed. The server binds to loopback. Saves, accounts, inventory, matches, lobbies, trades, achievements and the generated auth secret live in ignored `.data/`. Keep this directory to retain progress. Run only one server per save directory.

## Try the local world

Open **Lobbies → Populate with bots**. Ten persistent players labeled **[BOT]** open waiting tables, play exhibition games, join player-created tables, draft, post card exchange offers and accept offers they can fulfil. Bots obey the real engine, reservations and inventory transfers. **Pause population** closes their waiting tables and offers; existing duels continue to completion. Bot activity affects this local save's cards, records and ratings. Bots are opt-in and disabled by default when `NODE_ENV=production`, unless `LOCAL_BOTS=true` is explicitly configured.

Guests can practice, build their starter deck, play unranked/custom/Roulette and browse the exchange. Use the account button to register with email and a password of at least ten characters; registration preserves guest progress. Ranked, rated Draft, and permanent card trades require an account. Email verification, recovery delivery and OAuth are not configured in this local prototype.

## Current game

- **Solo:** server-authoritative CPU play; no player turn timer or stakes. Saved games resume after navigation or reload.
- **Unranked:** Three Open, no trade.
- **Ranked:** closed hands, Same, Plus, Combo and **Trade One**. The winner chooses one card from the losing original five-card deck. Draws trade nothing; forfeits retain the stakes. The loser’s five reserved copies remain locked until selection. After two minutes, the server selects a card automatically.
- **Custom:** visible public tables combining Closed/Three Open/All Open, Same, Plus, Random and optional Trade One. All custom rules share the lobby browser.
- **Draft:** separate rated queue; choose five legal cards from eight temporary offers, one duel per draft. This replaces the former Arena run plan. Draft cards do not enter permanent inventory.
- **Roulette:** separate queue; compatible advanced rules are drawn when the match begins.
- **Online turns:** 60 seconds. A missed turn plays automatically; three missed turns forfeit. Waiting rooms expire after 15 minutes.
- **Collection:** five distinct owned available characters per deck; at most one 5★ and one 4★, or two 4★ without a 5★. Auto build repairs a deck after losing or trading a card. Cosmetic finishes do not add a second character slot.
- **Exchange:** permanent card-for-card offers with reservations, confirmation, atomic settlement and a ledger. A currency marketplace and auctions are future work.
- **Achievements:** eleven persistent goals derived from server-recorded games, capture chains, collection and Trade One.

Cards and board artwork are about 150% of v0.2 at full desktop width. Smaller screens use scrolling hands and artwork inspection. Menus retain their own scale. Music uses the supplied GlacialSpoon “Queen of Cards” MP3 with a six-second equal-power crossfade from ending to opening; this smooths playback without claiming a beat-perfect loop. Music is opt-in; hidden tabs pause it. Credits live on `/credits`, without individual Prydwen links in the library.

## Cards and artwork

`data/cards/catalog.json` contains the **400 user-approved v1 cards**, promoted from the balance report. The previous twelve test cards are removed. Eleven characters without sufficient scoring data remain artwork-only. Alternate forms remain distinct. All **411 portraits and 400 icons** from six games, including NTE, are local; no AI-generated character or background images are used.

```sh
pnpm assets:inspect
pnpm assets:import
pnpm assets:validate
pnpm balance:draft
pnpm cards:promote
```

Saved complete Prydwen pages belong in ignored `prydwenData/`. Scripts in those pages are never executed. Importing artwork or generating new balance proposals does not silently update the published card release; promotion is a deliberate command. Source assumptions, conversion flags, hashes and provenance remain in the data and reports. See [balance](docs/CARD_BALANCE.md) and [asset tooling](docs/ASSET_IMPORTER.md).

## Validate

```sh
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm start
```

On restricted Windows environments, point TEMP/TMP at `.cache/tmp` for Vitest. Stop the dev server before building; both use the same Next.js output directory. Production preview starts both services. Public deployment, mail delivery/OAuth, shared external PostgreSQL, seasons, economy, auctions and operational hardening remain future work. Existing artwork provenance retains its distribution-review status.

`apps/web` owns presentation; `apps/server` owns sessions, legal moves and transactions; `packages/engine` is the pure rules/CPU library; `packages/shared` holds published cards and public DTOs; `packages/balance` holds configurable scoring. See [architecture](docs/ARCHITECTURE.md), [rules](docs/GAME_RULES.md), [Draft](docs/ARENA.md) and [decisions](docs/DECISIONS.md).
