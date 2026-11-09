# Sharing review — 0.1.2 Alpha

Reviewed 9 November 2026. This is a source review and isolated regression testing, not an external penetration test. No direct administrator escalation, arbitrary code execution or inventory/currency bypass was found in the reviewed routes. It does not guarantee that every exploit has been excluded.

## Current patch

- Moves, rewards, market transfers, duplicate actions and administrator permissions remain server-authoritative. Editing browser state or calling routes from the console does not bypass authentication, ownership, role checks, reservations or transaction validation. Existing security regressions cover forged admin flags, foreign profiles, socket tokens, spoofed IP headers and disallowed origins.
- Bulk Trade Up debits and all rewards commit together, with a per-profile request receipt. Replays cannot consume cards twice; altered payloads using the same ID are rejected. Last and reserved copies remain protected. Rewards use server-side cryptographic randomness.
- Reports accept bounded text and a small diagnostic allowlist. Text is rendered literally in React and with `textContent` in the controller. Markup in a test report did not produce an image or execute a script. Report reads/updates require an authenticated administrator or the private host-control secret. Submission limits apply per protected network hash, including guests.
- Google/Discord are optional. Client Secrets stay in the private VPS environment. OAuth tokens are encrypted at rest. Better Auth handles provider responses, state and PKCE; local tests verify redirects and reject a forged callback without creating users. Implicit email-based linking is disabled; existing players explicitly connect a provider from their signed-in profile. The IP registration limit also applies to new provider accounts while existing logins remain allowed. Real external consent/login cannot be certified without the operator's provider applications and credentials; see [setup](SOCIAL_LOGIN.md).
- The public proxy denies `/api/local-control/*` and removes the private-control header. The controller remains on loopback with Host/Origin and POST token checks. Its new report proxy passes those checks. Tests verify that closing a managed controller does not stop the game service.
- Optional client diagnostics retain at most 12 slow/error requests, redact UUIDs and query strings, and omit bodies, tokens and cookies. `Server-Timing` exposes duration only. Private runtime metrics expose neither a raw save nor credentials.
- Production dependency audit: **0 known advisories**, 249 production/optional dependencies at review time. No new dependency was added. This advisory scan does not establish the absence of unknown vulnerabilities or check the VPS operating system.

The remaining public-playtest limits are email verification/password recovery (not configured), abuse from multiple IPs/VPNs, and denial-of-service capacity. A one-account-per-IP policy is an abuse signal, not proof that two people share an identity, and households may need a host-managed exception. Use the existing HTTPS/loopback deployment, keep its backups and runtime patched, and verify real provider login after configuration. A staged public playtest is reasonable; a security guarantee is not.

The intermittent long-session slowdown is a separate unresolved live-verification item. See [0.1.2 notes](RELEASE_V0_1_2.md) for the mitigation, endurance checks and diagnostics. No production server change or data wipe was performed by this review.

## Earlier review history

The following notes record earlier milestones and their checks; their test counts are historical.

**v0.13 follow-up:** French translation is local React rendering; user messages and names are not sent to a translation service or interpreted as markup. Optional VPS templates keep both the backend and private controller on loopback, deny the private-control path at the public proxy, and store data/secrets outside static releases. The controller's managed-service mode uses a private shared control secret for moderation/grants and refuses to launch another database writer. An isolated test checks those operations and confirms closing the panel leaves the externally managed game running. Linux provisioning/Caddy/systemd behavior still requires verification on the chosen VPS; the files are deployment templates, not an independently audited production installation. See [hosting](DEDICATED_HOSTING.md).

Reviewed 8 November 2026. The game is suitable for a small, trusted-friend demo with the private host console kept on this PC. This is a source review and automated regression check, not a penetration-test certificate or a guarantee against attacks.

## What was checked

- Authentication, signed browser sessions and Socket.IO handshakes; profile ownership and server-side administrator/host authorization.
- Lobby/match rules, hidden hands, inventory reservations, atomic trades, booster/reward ledgers and duplicate request handling.
- Public/private chat rendering and conversation access, public player identity fields, origin checks and request limits.
- The loopback-only Windows controller, its origin/host/CSRF checks, static-export file serving and the scope of the public tunnel.
- Tracked configuration and dependency advisories. `pnpm audit --json` reported **zero known advisories** across all severities at review time. Ignored saves, auth secrets, tool downloads and saved third-party HTML are not tracked or included in the Pages export.

No malicious code or direct account/admin bypass was found in the reviewed surfaces. Chat text is rendered as text, database values use parameterized queries, and the game server validates moves and ownership. A forged client administrator flag does not grant privileges. The online-player list contains public ID/name/avatar/title fields, without email, tokens or inventory. Private conversations require an accepted friendship and the matching authenticated participant.

## Changes made in this review

The installed system runtime was **Node 24.1.0**, older than published Node security fixes. The project now has a local **Node 24.22.2 LTS** executable in ignored `.tools`, downloaded from nodejs.org and verified against that release's SHA-256 manifest. The double-click Windows launcher prefers it; the system installation is unchanged. The launcher rejects known outdated supported runtime baselines. Use a current LTS for manual developer/server commands too: the package audit does not check Node itself. References: [October security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases), [24.22.2 release and checksums](https://nodejs.org/en/blog/release/v24.22.2).

- Added per-IP limits for registration (5/min), guest creation (20/min), sign-in (10/min), session requests (60/min), and match/lobby creation (20/min per route). Ordinary authenticated reads retain their existing allowance.
- Limited authenticated sockets to five per profile, capped admitted transports at 200, and shortened unauthenticated connection timeouts to ten seconds. The existing 8 KiB socket message limit remains.
- Added private API `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. The private controller also rejects framing.
- Enforced trimmed 1–32 character names on new registrations. Existing names remain intact.
- Added isolated tests for privilege forgery, disallowed origins, spoofed auth-IP headers, request throttling, invalid socket tokens, cross-profile socket access, socket limits and presence-field redaction. Shared chat channels also validate channel names and request replay contents.

## Limits before a wider public launch

Account verification and password-reset email delivery are not configured. Disposable accounts can claim starter/daily rewards; these limits do not prevent multi-IP farming or distributed denial of service. An invitation gate or stronger abuse controls would be appropriate before advertising the game broadly. No payment or real-money feature is implemented.

The cross-origin client stores its signed session in browser local storage. A future same-origin script injection or malicious browser extension could read it; never paste unknown scripts into the browser console. Existing origin checks do not replace authentication or upstream traffic protection.

Keep the host console bound to loopback and tunnel only the game API. A future remote deployment needs HTTPS, a reverse proxy that overwrites trusted forwarding headers, persistent storage, backups and operating-system updates. Do not expose the controller or `.data` directory. Back up a stopped save before maintenance and preserve its auth secret.

Cloudflare Quick Tunnel remains a temporary demonstration transport, with a changing address and no uptime guarantee. The reviewed local code and export only reach the public Pages site after a new commit/push deploys them; the host backend must also be restarted.

The dependency audit is a point-in-time advisory check and cannot establish that every dependency or runtime is free of vulnerabilities. Recheck before public releases.

## Validation

93 unit/integration tests passed. All 55 applicable desktop/mobile browser cases passed across the full regression and focused final rechecks; one duplicate mobile bot scenario is intentionally skipped. The Pages production build and isolated two-player host integration passed using Node 24.22.2. The exported text scan checked 109 files without finding the local auth secret; private directories were absent. Static preview requests for `.env`, `.data/auth-secret` and an encoded traversal returned 404. The host integration also checks controller framing/cache headers and rejects an untrusted control origin.

The stopped main save was backed up before updating the local controller/backend. All eight registered primary accounts were preserved, and the public tunnel remains closed. These local checks do not test a newly deployed GitHub Pages revision until it is pushed.

## v0.10 follow-up

Direct Standard-card purchases use server-owned prices and atomic currency/inventory ledgers. Holo and unknown definitions are rejected; retries cannot charge twice or substitute another card. Account deletion removes purchase receipts. Pending Trade One is enforced at both matchmaking entry and match creation, including rematches. Rematches verify participants, mutual human consent, expiry, current eligibility/decks and availability; accepted retries point to the same new match. Ongoing bot games are never interrupted. Draft offers/reveal progress are server-owned and temporary; they cannot be credited to permanent inventory or rerolled by refreshing.

99 unit/server tests passed, together with all 63 applicable desktop/mobile browser cases across the full regression and final focused rechecks (one duplicate mobile bot scenario skipped). The final Pages export, TypeScript checks, formatting checks and isolated production-host integration passed. Host checks include direct card purchases, three titled private messages and a consensual Ranked rematch visible as a 2/2 playing table. The browser harness now waits for the API health endpoint before starting, preventing requests during backend startup. The 109 exported text files were checked again without finding the local signing secret or private directories.

The stopped main save was backed up again before migration 012; all **nine registered primary accounts** present at that update were preserved. The local server is updated and its public link remains closed. The matching frontend still needs a commit/push deployment.

## v0.11 follow-up

Queue timers use waiting-lobby metadata from the authenticated player's own profile; public lobby visibility and recipient-reserved invitation checks remain enforced by the server. Friend invitations now explicitly use Three Open, Same, Plus and Combo without card stakes. The training duel runs locally with synthetic teaching copies through the real engine; completing it changes only the existing tutorial acknowledgement, without awarding inventory, currency, records or rating. No dependencies or authentication policies changed in this batch.

101 unit/server tests passed. All 69 applicable desktop/mobile browser cases passed (one duplicate mobile bot scenario intentionally skipped), with final focused checks of the larger training dialog and Draft at 1366×768, 1440×900 and mobile. TypeScript, formatting, the final Pages production build and isolated production-host integration passed. Host checks verified the invitation popup expires after five seconds, the badge persists, refreshing does not replay the popup, invited duels use Unranked rules, Ranked matchmaking pairs independent accounts, and Trade One/rematches still work. The 109 exported text files were checked without finding the local signing secret or private directories. Tests used isolated saves; the main save was not changed.

## v0.12 follow-up

Booster prices, types, pool membership, rarity rolls and Holo side bonuses are server-owned. Purchase receipts bind both quantity and type; Starter packs cannot be purchased. Exact Holo orientations persist through settlement. Departed/offline/busy opponents are rejected by rematch validation. The first Ranked acknowledgement remains enforced even when a browser hides later rules prompts. The new saved-page adapter parses inert HTML and validates public image responses; no saved scripts are executed or shipped in the export.

The reset helper has no HTTP route. Its explicitly confirmed offline CLI checks for a live server, makes a cold backup, performs a transactional one-time wipe, verifies credential/admin fingerprints, pauses bots in both the database and controller config, and records its release marker. On this PC it preserved all 89 authentication users, including **11 registered human login accounts and one admin assignment**. Inventory, balances, matches and chat history were verified empty; ratings reset to 1000, and every retained linked profile received three Starter packs. The public link and main server remain stopped after maintenance.

**108 unit/server tests** passed. All **81 applicable desktop/mobile browser cases** passed across the full regression and final focused rechecks; one duplicate mobile bot scenario remains intentionally skipped. The production Pages build, TypeScript and formatting checks, asset validation (2,144 images), and isolated production two-player host integration passed. Host coverage includes real-time automatic ten-pack and six-pack opening, Universe II purchasing, daily rewards, recycling, Trade Up, rematches, moderation and restart persistence. The 109 exported text files contain no local signing secret, and private save/tool/raw-download folders are absent. The dependency audit reports **zero known advisories** at this review. The trusted-demo scope and wider-launch limits above still apply.
