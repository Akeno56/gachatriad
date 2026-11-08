# Gacha Triad

**v0.13:** Elemental-adjusted values now drive Same/Plus as well as ordinary/Combo captures. English/French selection persists in the browser, preserving character names, rule names and player messages. Starter packs remain openable but are absent from the shop. Epic Seven and Star Savior use the provider's portrait-framed listing art. See [localization](docs/LOCALIZATION.md) and the [always-on VPS installation/update guide](docs/DEDICATED_HOSTING.md), including private administration, consistent backups and a single-command release switch. A separately authorized [full pre-hosting reset](docs/RESET_V13.md) removes all existing users and gameplay. Normal updates do not repeat that reset.

A local Triple Triad fan game with FF-style menus, CRT presentation, 814 playable cross-game cards and persistent multiplayer services.

**v0.12:** Gacha Universe I and II split eight games into two four-universe pools, with the supplied booster artwork. Starter packs are exclusive, contain no 5★ cards and have 1% Holo odds. A centered welcome leads directly to automatic, artwork-gated opening; one or up to ten packs reveal card by card before results. Holo copies gain one randomly assigned, persisted +1 side bonus and use slower foil animation. Aha's approved base spread is A/8/A/2. Play adds ranked Draft, rule dialogs remember preferences, lobby filters combine required/excluded rules, rematches detect departed opponents, chat titles sit under names, and Same/Plus/Combo resolve with staged flips and centered splashes. The supplied logo appears in the sticky header, card backs and favicon. This release includes an explicitly requested, backed-up gameplay reset preserving login credentials and admin access. See [release and reset details](docs/RELEASE_V12.md).

**v0.11:** Play now uses Unranked and Ranked matchmaking, with centered rules confirmation, a persistent queue timer and a red cancel button. Browse lobbies replaces the old online shortcut. Fresh players get an interactive, scripted training duel covering ordinary capture, visibility, Same, Plus, Combo, Elemental, scoring, Trade One and mode differences. Invitations use Unranked rules, show a pending count and announce new invites for five seconds. Draft sorts all 15 revealed cards by total stats or rarity in a compact desktop grid. Chat rows align sender, title, message and time with alternating backgrounds. Custom lobbies remember Allow bots.

**v0.10:** page-specific chat defaults (Play → General, Lobbies → Lobbies, Trades → Trade), shared chat in Trades and space for at least three ordinary messages. Standard cards can be bought directly for 50/125/200/300/500 Prisms, with compact buttons beside the card details; Holo stays drop-only. Normal booster odds are 50/27/17/5/1%, the guaranteed slot is 80/17/3%, and Holo is 0.5%. Draft automatically reveals three temporary boosters with both 3★+ and 4★+ guarantees and 5% Holo before choosing five of 15 cards. Pending Trade One results block new games and bring the winner back to card selection. Multiplayer results support consensual rematches with the same opponent and rules. Holo uses its animated foil without a text badge overlapping YOU/RIVAL. See [economy and Draft details](docs/BOOSTER_PACKS.md).

**v0.9:** Play places the shared General/Trade/Lobbies chat and online-player list below your hand, beside duel setup; Lobbies uses the same compact chat. Settings live in a bottom-left cog. Collection sorting is independent of filters. Open any available booster count up to ten across stack sources; individual reveals preload artwork and wait 0.8 seconds between cards. Captures turn from the old owner's face/color to the new owner's face/color, including Same/Plus/Combo chains. The rulebook demonstrates All Open, Three Open and Closed hands. See the [sharing/security review](docs/SECURITY_REVIEW.md).

The top-right account button now reads **Login/Register** for guests and **Logout** for signed-in players. Logout signs out directly.

**v0.8:** chat messages align avatars, names, titles and timestamps consistently. Rulebook examples autoplay at half speed and loop without playback buttons. Holo/CRT motion defaults on independently of OS reduced-motion, with a saved switch under Volume. Elemental board values include modifiers, and selected cards preview green/red elemental cells. Play unranked and Play ranked are separate from practice presets; Unranked and Draft use Three Open + Same/Plus/Combo with no trade. Other pages remind players about active battles. Auto build varies same-rarity choices while preserving the highest legal total rarity. Permanent human Ranked top-10/top-3/champion titles require five Ranked games.

**v0.7:** public chat lives in Play; accepted friends have private conversations and unread badges. The rulebook replays Same, Plus and Combo through the real engine. CRT scanlines scroll, Holo sheen runs without hover, cards resist accidental text/art selection, and checkboxes use consistent styling. Auto build maximizes total owned, available rarity within legal deck limits, then printed side values. Boosters stack by source, support quantity purchases and opening ×5/×10, and registered accounts can claim one free standard booster per UTC day. Collection supports duplicate recycling and five-for-one rarity upgrades; see [economy details](docs/BOOSTER_PACKS.md).

**v0.6:** friends, main chat, human ranked/Draft ladders and friend duel invitations; earned titles and square match avatars; separate ranked entry with first-time Trade One consent. Hosts can control bot difficulty, grant currency/boosters to a selected user and delete confirmed accounts. Guest accounts expire after seven inactive days; temporary guest profiles are discarded on existing-account sign-in. Lost last copies are removed from active decks. Booster opening now uses a centered pack, individual reveals and a final fan. Menu and battle music are separate, with fades, default ON and 50% volume. See [community/account rules](docs/SOCIAL_AND_ACCOUNTS.md).

**v0.5:** three five-card starter boosters replace the old new-profile card grant; every pack guarantees a 3★ or better card. Standard boosters cost 150 **Stellar Prisms**, earned at 50/25/10 for completed wins/draws/losses. The private PC control panel manages bots, admin assignments and account moderation. Only explicitly appointed registered admins can see or use in-game bot controls. Music and SFX have saved volume sliders, Holo cards animate at rest, number shadows are lighter, and personal navigation sits on the right. See [booster rules](docs/BOOSTER_PACKS.md).

**v0.4:** results now open over the board in a centered dialog; all game dialogs center consistently. Cards shows collection ownership and Standard/Holo finishes, with unowned copies greyed out. Character Library has been removed from the UI. Decks is now **Collection**, without artwork-inspection buttons. The main menu keeps a small bottom-right Credits link instead of a navigation tab. Music on/off is remembered and resumes on the next permitted gesture after reload.

Elemental is available in practice, custom tables and Roulette: marked cells apply +1 for matching affinity and −1 for mismatches, including cards with no affinity. Same/Plus, ordinary and Combo captures all use Elemental-adjusted ranks. Card and cell icons expose the rule. Custom Combo is explicit, and Trade One requires Closed + Same + Plus + Combo; additional rules remain allowed. Fresh guests/accounts must complete the interactive training duel or acknowledge the rulebook before their first duel; this is enforced by the server.

Player profiles expose records, ratings, achievement unlocks and a chosen owned profile card. Private decks and inventory are not exposed. Holo copies have animated foil and one +1 bonus assigned to a side below A when acquired. The exact side persists through inventory, decks, matches and trades. Ordinary boosters have a published 0.5% Holo chance per card; Starter packs use 1% and temporary Draft boosters use 5%. Five-star cards have an ornate crown/frame.

## Host a showcase from your PC

See the complete [GitHub Pages + PC server guide](docs/ONLINE_DEMO.md). The project address is `https://akeno56.github.io/gachatriad/`. Local changes publish through the repository's Pages workflow after you commit and push them.

On this Windows development PC, double-click **Start Server Control.cmd** to open the panel without terminal commands.

The launcher prefers the verified project-local Node 24.22.2 LTS in `.tools` when present. A fresh Windows checkout can install this copy with `node tools/server-control/install-runtime.mjs`; otherwise install current Node LTS system-wide. Older runtimes must be updated before public hosting; manual developer commands still use your system PATH.

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

Guests can train, build their starter deck, play unranked/custom/Roulette and browse the exchange. Use the account button to register with email and a password of at least ten characters; registration preserves guest progress. Ranked, rated Draft, and permanent card trades require an account. Email verification, recovery delivery and OAuth are not configured in this local prototype.

## Current game

- **Play:** Start match (Unranked), Start match (Ranked) and Start Draft (Ranked) enter separate queues; populated bots or searching players can join. Each queue shows its elapsed time and a red X to leave. Saved games resume after navigation or reload. The legacy Solo API remains available for existing saved practice games.
- **Unranked:** Three Open, Same, Plus, Combo; no trade.
- **Ranked:** closed hands, Same, Plus, Combo and **Trade One**. The winner chooses one card from the losing original five-card deck. Draws trade nothing; forfeits retain the stakes. The loser’s five reserved copies remain locked until selection. After two minutes, the server selects a card automatically.
- **Custom:** visible public tables combining Closed/Three Open/All Open, Same, Plus, Random and optional Trade One. All custom rules share the lobby browser.
- **Draft:** separate rated queue; three temporary boosters open automatically, then choose five legal cards from 15 offers and play Three Open + Same/Plus/Combo with no trade. Draft cards do not enter permanent inventory.
- **Roulette:** separate queue; compatible advanced rules are drawn when the match begins.
- **Online turns:** 60 seconds. A missed turn plays automatically; three missed turns forfeit. Waiting rooms expire after 15 minutes.
- **Collection:** five distinct owned available characters per deck; at most one 5★ and one 4★, or two 4★ without a 5★. Auto build repairs a deck after losing or trading a card. Cosmetic finishes do not add a second character slot.
- **Exchange:** permanent card-for-card offers with reservations, confirmation, atomic settlement and a ledger. A currency marketplace and auctions are future work.
- **Achievements:** eleven persistent goals derived from server-recorded games, capture chains, collection and Trade One.

Cards and board artwork are about 150% of v0.2 at full desktop width. Smaller screens use scrolling hands and artwork inspection. Menus retain their own scale. Menus use the supplied “Shuffle or Boogie (Ambient Remix) — Hands of Fate” recording; active duels use GlacialSpoon’s “Queen of Cards.” Both tracks loop with a six-second equal-power crossfade, and scene changes fade out/in. Fresh browsers default to Music ON and both volumes at 50%; playback waits for a permitted gesture and hidden tabs pause it. Saved choices take precedence. Credits live on `/credits`, without individual Prydwen links in the library.

## Cards and artwork

`data/cards/catalog.json` contains **814 approved v2 cards**. The local asset catalogue contains **855 portraits and 845 icons** across eight games, plus 444 listing images. Forty-one unscored character records remain artwork-only. Alternate forms remain distinct. No AI-generated character or background images are used. Epic Seven and Star Savior import details, approved element mappings, score assumptions and the Aha override are documented in [release details](docs/RELEASE_V12.md).

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

On restricted Windows environments, point TEMP/TMP at `.cache/tmp` for Vitest. Stop the dev server before building; both use the same Next.js output directory. Production preview starts both services. Dedicated hosting, mail delivery/OAuth, shared external PostgreSQL, seasons, auctions and operational hardening remain future work. Existing artwork provenance retains its distribution-review status.

`apps/web` owns presentation; `apps/server` owns sessions, legal moves and transactions; `packages/engine` is the pure rules/CPU library; `packages/shared` holds published cards and public DTOs; `packages/balance` holds configurable scoring. See [architecture](docs/ARCHITECTURE.md), [rules](docs/GAME_RULES.md), [Draft](docs/ARENA.md) and [decisions](docs/DECISIONS.md).
