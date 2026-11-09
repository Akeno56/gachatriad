# 0.1.2 Alpha — playtest tools and responsiveness

## Gameplay and interface

- Ranked and rated Draft search for humans. While waiting, **Play a practice bot — no Elo** explicitly allows Medium/Hard bots. Human matches still award Elo; bot matches do not. Ranked practice retains Trade One, including its loss risk. Bots leave their own waiting tables to answer an eligible human table.
- Duplicate tools show one row per rarity. Recycle spare copies in one confirmation, or Trade Up batches of five, up to 20 rewards per action. The preview shows the exact consumption/reward, keeps one copy of every selected card and all reserved copies, and excludes Holo duplicates unless explicitly enabled. Receipts make retries safe.
- Feedback / Report a bug is available beside settings. Guests and accounts can send a report; admins can review it in game or in the private host panel. Reports have a status and private admin note. Optional diagnostics contain recent slow request timings and audio loading state, without tokens or form contents.
- Friend previews sit beside their avatars. Battle chat uses smaller avatars and wrapping names/titles. Draft-stage chat is centered and capped at 560px on desktop. The rulebook has clearer sections, concise timer/deck rules, and updated English/French copy.
- Form controls have names for autofill/accessibility warnings. This is separate from request latency.
- Optional Google/Discord login and explicit account linking: follow [SOCIAL_LOGIN.md](SOCIAL_LOGIN.md). Buttons appear only for providers configured on the VPS. Real provider consent/login must be checked after configuration.

## Responsiveness work

The live slowdown was intermittent. Music-off initially helped, but a later music-on capture was fast too, and another player remained fast simultaneously. Neither music, the admin role, nor a failed deployment has been established as the sole cause.

This patch gives player database work priority over queued bot work while periodically servicing bots too. It yields to network I/O between embedded-database leases. Active transactions remain indivisible. Runtime indexes cover active matches, pending claims, player history and open offers.

Music downloads once per track at low fetch priority, then both crossfade decks play local Blob URLs. Switching scenes and looping reuse the bytes. Hidden/off states cancel pending loads. A crossfade cannot start while the next scene is loading. Music failure does not block gameplay.

The control panel polls every five seconds with one refresh at a time and skips hidden tabs. New diagnostics expose application duration through `Server-Timing`, record event-loop stalls over one second, and show memory/database queue/recent loop delay in the private panel.

**A local endurance pass cannot prove the intermittent live issue is gone.** If it recurs after publishing, send an in-game bug report with diagnostics enabled while the problem is occurring. Compare browser TTFB with the report's `serverMs`; application timings omit delays before Node begins handling a request, which is why event-loop monitoring is included. Read recent VPS logs with:

```powershell
ssh -t gachatriad "sudo journalctl -u gachatriad --since '15 minutes ago' --no-pager"
```

## Test locally

Double-click **Start Local Test.cmd**, then use its separate PC test panel on **3040**, preview **3100**, backend **3101**. The SSH-forwarded VPS panel stays on **3030**. The test launcher rebuilds local frontend changes and uses a separate save. Local testing does not publish or erase live accounts.

## Publish

In your PC's PowerShell or Git Bash, from the project folder:

```powershell
git add apps packages docs tools tests package.json
git commit -m "Release 0.1.2 Alpha"
git push origin main
ssh -t gachatriad "bash /opt/gachatriad/source/tools/deploy/update.sh https://gachatriad.com"
```

Wait for **Deployed … to https://gachatriad.com**. The updater builds both parts, backs up and restarts the services automatically. Refresh the game with Ctrl+F5 and reload the private panel. No additional reboot or account wipe is required. The targeted staging command leaves the personal `StartPanelONLINE` root helpers outside this release.

For the private panel, keep this PC PowerShell window open, then visit `http://127.0.0.1:3030`:

```powershell
ssh -N -L 3030:127.0.0.1:3030 gachatriad
```

Normal deployment preserves `/etc/gachatriad/server.env` and `/var/lib/gachatriad`. OAuth needs the separate one-time provider setup. Do not place Client Secrets in Git or the browser build.

## Validation

- 174 unit/server tests passed, including authenticated role checks, OAuth redirect/state guards, report privacy/rate limits, batch idempotency and human/practice queue behavior.
- 20 desktop/mobile browser checks passed, plus eight repeated music-transition checks and a final two-layout friend-preview recheck. These include previous Market/Season 0 regressions and French report status controls.
- The 60-minute, 30-bot runtime fixture completed 13,102 requests with zero failures and a 38 ms overall p95. See [measurements and limits](PERFORMANCE_ALPHA_012.md).
- The production static export passed isolated onboarding, feedback, English/French privacy and four-minute background-tab recovery checks, with external browser traffic blocked. The browser reported no missing-name/nonstandard-autocomplete form issues in the checked screens.
- The private-controller probe passed report review, literal markup rendering, Origin/CSRF checks, non-overlapping polling and hidden-tab suspension. Closing the managed panel left the game service running.
- Hosted production build, workspace TypeScript, formatting and asset validation passed (2,144 images). The 131 exported text files contained no tested signing/provider/control secrets or private directories. Production dependency audit: zero known advisories.

Previews: [Draft chat](screenshots/alpha012-draft-chat.png), [friend preview](screenshots/alpha012-friend-preview.png), [French feedback inbox](screenshots/alpha012-feedback.png), [private panel](screenshots/alpha012-private-panel.png). [Security review](SECURITY_REVIEW.md).
