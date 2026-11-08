# Gacha Triad

A local Triple Triad fan game with FF-style menus, CRT presentation, 400 playable cross-game cards and persistent multiplayer services.

**v0.8:** chat messages align avatars, names, titles and timestamps consistently. Rulebook examples autoplay at half speed and loop without playback buttons. Holo/CRT motion defaults on independently of OS reduced-motion, with a saved switch under Volume. Elemental board values include modifiers, and selected cards preview green/red elemental cells. Play unranked and Play ranked are separate from practice presets; Unranked and Draft use Three Open + Same/Plus/Combo with no trade. Other pages remind players about active battles. Auto build varies same-rarity choices while preserving the highest legal total rarity. Permanent human Ranked top-10/top-3/champion titles require five Ranked games.

**v0.7:** public chat lives in Play; accepted friends have private conversations and unread badges. The rulebook replays Same, Plus and Combo through the real engine. CRT scanlines scroll, Holo sheen runs without hover, cards resist accidental text/art selection, and checkboxes use consistent styling. Auto build maximizes total owned, available rarity within legal deck limits, then printed side values. Boosters stack by source, support quantity purchases and opening ×5/×10, and registered accounts can claim one free standard booster per UTC day. Collection supports duplicate recycling and five-for-one rarity upgrades; see [economy details](docs/BOOSTER_PACKS.md).

**v0.6:** friends, main chat, human ranked/Draft ladders and friend duel invitations; earned titles and square match avatars; separate ranked entry with first-time Trade One consent. Hosts can control bot difficulty, grant currency/boosters to a selected user and delete confirmed accounts. Guest accounts expire after seven inactive days; temporary guest profiles are discarded on existing-account sign-in. Lost last copies are removed from active decks. Booster opening now uses a centered pack, individual reveals and a final fan. Menu and battle music are separate, with fades, default ON and 50% volume. See [community/account rules](docs/SOCIAL_AND_ACCOUNTS.md).

**v0.5:** three five-card starter boosters replace the old new-profile card grant; every pack guarantees a 3★ or better card. Standard boosters cost 150 **Stellar Prisms**, earned at 50/25/10 for completed wins/draws/losses. The private PC control panel manages bots, admin assignments and account moderation. Only explicitly appointed registered admins can see or use in-game bot controls. Music and SFX have saved volume sliders, Holo cards animate at rest, number shadows are lighter, and personal navigation sits on the right. See [booster rules](docs/BOOSTER_PACKS.md).

**v0.4:** results now open over the board in a centered dialog; all game dialogs center consistently. Cards shows collection ownership and Standard/Holo finishes, with unowned copies greyed out. Character Library has been removed from the UI. Decks is now **Collection**, without artwork-inspection buttons. The main menu keeps a small bottom-right Credits link instead of a navigation tab. Music on/off is remembered and resumes on the next permitted gesture after reload.

Elemental is available in practice, custom tables and Roulette: marked cells apply +1 for matching affinity and −1 for mismatches, including cards with no affinity. Same/Plus use printed ranks; ordinary and Combo captures use adjusted ranks. Card and cell icons expose the rule. Custom Combo is explicit, and Trade One requires Closed + Same + Plus + Combo; additional rules remain allowed. Fresh guests/accounts must complete the short tutorial or acknowledge the rulebook before their first duel; this is enforced by the server.

Player profiles expose records, ratings, achievement unlocks and a chosen owned profile card. Private decks and inventory are not exposed. Every base card has a separate cosmetic Holo definition with identical stats and an animated foil; 5★ cards have an ornate crown/frame. Boosters have a published 0.1% Holo chance per card. The album can preview the finish, and inventory/decks/matches/trades preserve exact finishes.

## Host a showcase from your PC

See the complete [GitHub Pages + PC server guide](docs/ONLINE_DEMO.md). The project address is `https://akeno56.github.io/gachatriad/`. Local changes publish through the repository's Pages workflow after you commit and push them.

On this Windows development PC, double-click **Start Server Control.cmd** to open the panel without terminal commands.

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

Use the private server control panel's bot tools, or **Lobbies → Populate with bots** while signed in as an admin. Ten persistent players labeled **[BOT]** open waiting tables, play exhibition games, join tables that allow bots, draft, post card exchange offers and accept offers they can fulfil. Difficulty defaults to Medium and can be changed in the control panel. Bots obey the real engine, reservations and inventory transfers. **Pause population** closes their waiting tables and offers; existing duels continue to completion. Bot activity affects this local save's cards, records and ratings. Bots are opt-in and disabled by default when `NODE_ENV=production`, unless `LOCAL_BOTS=true` is explicitly configured.

Guests can practice, build their starter deck, play unranked/custom/Roulette and browse the exchange. Use the account button to register with email and a password of at least ten characters; registration preserves guest progress. Ranked, rated Draft, and permanent card trades require an account. Email verification, recovery delivery and OAuth are not configured in this local prototype.

## Current game

- **Solo:** server-authoritative CPU play; no player turn timer or stakes. Saved games resume after navigation or reload.
- **Unranked:** Three Open, Same, Plus, Combo; no trade.
- **Ranked:** closed hands, Same, Plus, Combo and **Trade One**. The winner chooses one card from the losing original five-card deck. Draws trade nothing; forfeits retain the stakes. The loser’s five reserved copies remain locked until selection. After two minutes, the server selects a card automatically.
- **Custom:** visible public tables combining Closed/Three Open/All Open, Same, Plus, Random and optional Trade One. All custom rules share the lobby browser.
- **Draft:** separate rated queue; choose five legal cards from eight temporary offers, then play Three Open + Same/Plus/Combo with no trade. Draft cards do not enter permanent inventory.
- **Roulette:** separate queue; compatible advanced rules are drawn when the match begins.
- **Online turns:** 60 seconds. A missed turn plays automatically; three missed turns forfeit. Waiting rooms expire after 15 minutes.
- **Collection:** five distinct owned available characters per deck; at most one 5★ and one 4★, or two 4★ without a 5★. Auto build repairs a deck after losing or trading a card. Cosmetic finishes do not add a second character slot.
- **Exchange:** permanent card-for-card offers with reservations, confirmation, atomic settlement and a ledger. A currency marketplace and auctions are future work.
- **Achievements:** eleven persistent goals derived from server-recorded games, capture chains, collection and Trade One.

Cards and board artwork are about 150% of v0.2 at full desktop width. Smaller screens use scrolling hands and artwork inspection. Menus retain their own scale. Menus use the supplied “Shuffle or Boogie (Ambient Remix) — Hands of Fate” recording; active duels use GlacialSpoon’s “Queen of Cards.” Both tracks loop with a six-second equal-power crossfade, and scene changes fade out/in. Fresh browsers default to Music ON and both volumes at 50%; playback waits for a permitted gesture and hidden tabs pause it. Saved choices take precedence. Credits live on `/credits`, without individual Prydwen links in the library.

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
