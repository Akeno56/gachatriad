# Sharing review — v0.9

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
