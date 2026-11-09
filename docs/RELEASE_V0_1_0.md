# 0.1.0 Alpha — Battles, moderation and card variety

Accounts, cards, currency and history are preserved. Migrations 015–016 add spectator privacy, network restrictions and rating audit records; they run automatically without resetting data. The header reads **Gacha Triad / Alpha**.

## Account and ranked protections

- New registrations are limited to one account per IPv4 address or IPv6 /64 network. Simultaneous signup attempts are serialized. The server uses the connection address and trusted Caddy forwarding, not user-supplied IP fields. Existing session IP records seed the restriction; earlier accounts are preserved for investigation.
- Network restrictions in the private control panel can block/unblock IPs or allow/revoke a shared-household exception. Blocks reject guests and existing accounts too, disconnect active sockets and persist across restarts. The panel lists saved restrictions and actions. Admin APIs and IP data remain protected; public profiles and chats never receive IPs.
- IP restrictions discourage duplicate accounts but cannot identify a person or prevent VPN/mobile-network evasion. Existing duplicate accounts are not automatically deleted or accused. Rated matchmaking avoids pairing recorded shared networks unless an administrator has granted an exception; those unapproved pairings cannot award Elo if an older match is already running.
- Ranked and Draft tables are hidden from the public lobby list. Direct join requests are rejected server-side, and rated rematches return players to matchmaking. The private live monitor still sees these games.
- The isolated PC test save grants a localhost shared-network exception so you can create several test users. Production receives no such exception. Browser/unit tests use a development-only loopback exception.

## Administration and history

- Connected players show their IP in the private control panel. Registered-user rows link to the public profile, offer History review and prefill network controls.
- Battle history lists results, opponents, mode, finish reason, card settlement and new rating changes. Opponent summaries count wins/draws/losses and the longest consecutive win streak per rated mode. A streak of five or more is highlighted as a review signal, not a conviction. History is paginated in batches of 100. Older games remain inspectable, but their precise Elo deltas were not recorded.
- Admins viewing a player's profile get protected Battle history and Collection tabs. Regular users cannot access those endpoints or see these controls.
- Admin participants have **Admin: instant win** in every mode, including Draft selection. It ends the game through normal settlement, allowing Trade One testing, but awards no currency, Elo, statistics or achievements and does not count for ladder/title qualification. It cannot end someone else's match.

## Cards and economy

- Cards has independent sorting by name, rarity and total stats, in addition to its existing filters.
- Individual Standard card prices are **100 / 200 / 500 / 1,000 / 2,500 Stellar Prisms** for 1★–5★. Holo copies remain unavailable for direct purchase.
- **660** duplicate spreads were redistributed across **814** cards, increasing distinct spreads from **154 to 814**. Totals, rarities, elements and base IDs stay fixed; Aha remains A / 8 / A / 2. Printed and Holo sides are capped at **8 for 1★–3★**, and **A for 4★–5★**. Existing Holo IDs remain valid with +1 total; bonuses move to an eligible side when the former direction reaches its rarity's cap. All 570 low-rarity base cards and every Holo variant pass the cap audit. New games and owned definitions use the updated stats; already running games finish with their starting snapshot. See [the stat report](STAT_SPREADS_ALPHA.md).

## Battles and chat

- Desktop arenas size to available viewport height, including short laptop displays. Collection card sizes remain unchanged. Hands, board, timer and battle log fit without scrolling; turn history expands over the arena.
- Battle / General / Friends chat is always available beside desktop battles. Mobile uses a docked Chat drawer to preserve the board. Bot and practice matches default to General; their Battle tab explains that bots cannot reply. Human battle messages remain private to those two players.
- Friends & messages opens a non-modal conversation drawer. It has searchable contacts, online indicators, unread badges, latest-message previews, message bubbles and a bottom composer. Desktop selects the recent conversation; mobile separates inbox and conversation with a Back button. Invitations, friend requests, moderation and unread tracking retain their existing server checks.
- Ladder uses Ranked and Draft tabs, without the explanatory paragraph requested for removal.

## Turn policy

Each turn lasts **60 seconds**. The first missed turn auto-plays one legal card. If that same player misses their next turn, they immediately forfeit. A genuine manual move between missed turns clears their warning; duplicate requests and late moves cannot evade the deadline. The countdown explains the first-timeout rule and shows a red **Next timeout: instant defeat** warning after a missed turn.

The independent **120-second disconnect limit** remains, even while the other player is playing. Draft still forfeits after 120 seconds of inactivity during selection. Trade One and human-only Elo use normal result settlement; forfeits do not award currency. This replaces v0.14's immediate loss at a single 120-second turn deadline.

## Spectating

- Public ongoing tables have a Spectate link in Lobbies. Guests can watch without opening starter packs or completing the play tutorial.
- The watch view is server-redacted: Closed hides both hands; Three Open exposes only each hand's chosen revealed cards; All Open exposes both. Draft pools and selection choices stay private. Public board/history update through the existing authenticated change notifications.
- Spectators cannot play, resign, choose Trade One cards, request rematches or read battle chat. Normal participant routes keep their existing authorization; a spectator flag from the browser never grants host access.
- Friend-invitation matches and solo practice are not publicly spectatable. The private server-control panel's host-only Live battle monitor can inspect any ongoing match, including those modes. It recreates nine board cells using text, adjusted values, owner colors and scores, with no artwork or game UI assets. Hands continue to follow their public reveal policy.
- Host monitor requests pass through the existing loopback controller and secret-checked private API. The public Caddy configuration already denies `/api/local-control/*`.

## Test and publish

Validation completed locally: **146 unit/API tests**, **10 desktop/mobile browser checks**, a further **5 mobile checks** after compacting the Alpha header, production and isolated-preview builds, workspace type checking and private host-tool browser probes. The final browser pass explicitly checks 1★–3★ Standard and Holo values against the cap of 8. The isolated preview also verified admin promotion, another player's collection/history and the instant-win action while blocking all external requests. No VPS or live-player data was accessed.

Visual checks: [desktop battle](screenshots/alpha010-battle.png), [mobile messenger](screenshots/alpha010-mobile-messenger.png), [history review](screenshots/alpha010-history.png), [private battle monitor](screenshots/alpha010-host-monitor.png), [admin collection](screenshots/alpha010-admin-collection.png). The browser checks cover 1920×1080, 1366×768, 1280×720 and 390×844; mobile typing uses emulated touch Chromium, not a physical Redmi/Opera device.

The corrected [low-rarity Holo catalogue](screenshots/alpha010-card-caps.png) is also captured after checking Standard and Holo cards at 1★, 2★ and 3★ against the side cap of 8.

Run **Start Local Test.cmd** to rebuild the current interface and refresh the separate PC test panel on **3040**. Then click **Start server → Open local game preview**. Its save is `.data-local/`; its frontend/backend are **3100/3101**. The existing VPS SSH panel on **3030** is separate. **Start Test Server Control.cmd** retains GitHub Pages + Cloudflare testing, but GitHub Pages only displays whichever frontend was last published there.

The launcher detects an outdated PC test controller and refreshes it, so new host-monitor routes are picked up without manually finding its background process. This stops the current PC test session/tunnel and preserves its save.

Once tested, in PC PowerShell:

```powershell
cd E:\DEVPRG\Codex\GachaTriad
git add .
git commit -m "Release 0.1.0 Alpha"
git push origin main
```

After the push succeeds:

```powershell
ssh -t gachatriad "bash /opt/gachatriad/source/tools/deploy/update.sh https://gachatriad.com"
```

Wait for the success message and refresh the browser. The normal updater builds both services and the frontend, with a backup and a brief restart. No live deployment was performed during development.
