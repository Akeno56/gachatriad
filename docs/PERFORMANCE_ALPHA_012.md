# 0.1.2 responsiveness checks

Run locally on Windows with Node 24.22.2, 9 November 2026. No VPS accounts or player saves were used.

| Check                            | Result                                                       |
| -------------------------------- | ------------------------------------------------------------ |
| Continuous bot/API fixture       | 60 minutes, 30 populated bots                                |
| HTTP requests                    | 13,102                                                       |
| Failed HTTP requests             | 0                                                            |
| Overall 95th percentile response | 38 ms                                                        |
| Duels entered by the test actor  | At least 184; includes the final in-progress duel            |
| Final sampled database queue     | 0                                                            |
| Final sampled process RSS        | 268 MB                                                       |
| Production browser recovery      | Four-minute hidden-tab pause, then a music-on battle: passed |
| Music scene/crossfade stress     | Eight repeated desktop/mobile runs: passed                   |

The slowest request in the recorded sampling windows took 1,213 ms; sampled process RSS ranged from 209 to 505 MB.

The API fixture uses a real on-disk isolated database, actual HTTP requests and the 30-bot scheduler. It repeatedly reads profile/social/match state and plays legal moves while bot activity continues. Other unit tests, browser tests and builds ran on the same PC during this window. The fixture loaded the database-scheduling runtime when it started; later UI/auth/report changes were checked separately by regression tests and the final production export. [Recorded samples and final summary](reports/alpha012-session-soak.json).

Reproduce with the supported Node runtime from the repository root:

```powershell
node --import ./apps/server/node_modules/tsx/dist/loader.mjs tools/server-control/session-soak.mjs --minutes=60
```

The fixture creates its own `.cache/session-soak-*` save and loopback server, and closes both at completion. It never connects to an existing server.

These measurements are local HTTP results, not a measurement of the VPS/Caddy/HTTP2 route or the user's network. They do not prove the intermittent live slowdown is eliminated. The live reports showed variable TTFB while another player remained fast. After publishing, a slow in-game bug report with optional diagnostics can distinguish recorded application duration from browser-observed delay; event-loop stall logs cover an earlier stage that handler timing misses.
