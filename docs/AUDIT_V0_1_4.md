# 0.1.4 validation

This audit covers the daily puzzle, coexistence of both Draft formats and ordinary Ranked without collection loss. It supplements [AUDIT_V0_1_3.md](AUDIT_V0_1_3.md), which covers the earlier interface, security and long-session work still present in this working tree.

## Functional and security checks

- Original Draft still opens three private boosters, resumes after reload and locks a legal five-card hand.
- Shared Draft has exactly 20 shared, distinct cards. Ownership, opening readiness, alternating turns, card availability, rarity limits and match versions are validated on the server. Duplicate concurrent picks accept only once.
- Shared Draft timeouts automatically pick once and forfeit after a second consecutive missed pick. The populated-bot policy opens packs and drafts legal hands. Bot practice changes neither Elo nor ranked leaderboard results.
- Constructed Ranked, original Draft and Shared Draft ratings and leaderboard match counts remain independent. Existing Draft ratings are preserved.
- Ranked losses preserve inventory and the saved deck; players can requeue immediately. Custom Trade One remains supported by the existing regression suite.
- Migration 019 removes active Ranked stakes and releases their reservations when games finish. Already completed, pending legacy transfers remain claimable.
- Daily boards are deterministic and persisted, with a uniquely winning first move. The opponent uses exact endgame defense. UTC boundaries, retries, stale versions and first-solve ranking are checked.
- Puzzle rewards pay 100 Prisms once per account/day, including accounts with multiple legacy profiles. Concurrent claims cannot pay twice. A repeated practice solve cannot improve the first result.
- Forged profile headers are rejected. Posting solved/reward/account fields cannot fabricate a solve, select another account or change the reward. Guests cannot claim without an authenticated registered account.
- Existing authentication, authorization, admin, economy, origin, rate-limit and game-rule regression checks remain in the unit suite. This is scoped code/test coverage, not a claim that all possible vulnerabilities have been excluded.

## Browser and visual checks

Verified against the standalone static export using isolated local servers and test accounts. Production requests are blocked in the new test contexts.

- Eight desktop/mobile workflows passed: original Draft opening/reload/hand locking, immediate Ranked requeue, daily puzzle solve/reward/reload/French leaderboard, and Shared Draft opening/picks/reload/battle/separate ladders/French queue rules.
- Four additional checks passed after final card-spacing adjustments, including 320 px French layouts and a measured gap between the pick confirmation button and floating social controls.
- Two final queue-flow checks passed after correcting rules-dialog focus, confirming the French heading is initially in view on desktop and at 320 px.
- Profile checks cover the three ratings on a shared row, separate match statistics, and single-line Elo values in English and narrow French layouts.
- Captures cover English puzzle play, French results, both queue states, shared picks, confirmation, ladder tabs and rules dialogs. Page-width overflow assertions pass at tested sizes.
- Visual inspection corrected inherited Draft card heights that left blank space below portraits, floating-button overlap with confirmation, and initial scroll position in long French rules dialogs.
- The translation source scan reviewed the current interface dictionary, with no duplicate dictionary keys. Remaining unchanged phrases are names, rule names, French labels or dynamic/numeric templates. New puzzle and Draft messages have English/French entries; card and player names are preserved.

## Performance

A 60-second isolated local run with **30 populated bots** and six clients made **348 HTTP requests**, including the new puzzle endpoint:

| Measurement                      | Result |
| -------------------------------- | ------ |
| Failed requests                  | 0      |
| Median response                  | 87 ms  |
| 95th percentile                  | 257 ms |
| Maximum                          | 393 ms |
| Puzzle endpoint 95th percentile  | 306 ms |
| Event-loop delay 95th percentile | 40 ms  |

Generating 100 seeded puzzles in a separate bounded check took about 5.4 ms at the 95th percentile, maximum 8.4 ms. Generation is coalesced and happens once for a new UTC day; boards persist across restarts. Puzzle leaderboard polling runs once per minute and does not broadcast a global profile refresh for every move.

These are short local measurements. They do not reproduce the earlier Wi-Fi/HTTP2 delivery issue, prove long-term memory stability or guarantee production latency. The earlier 15-minute disk-backed endurance results remain documented in the 0.1.3 audit.

## Build and test records

Logs and the latest browser artifacts are retained under ignored `.cache/release014-*`. The final complete regression run passed **188 checks across 34 files**. Two stateful/randomized fixtures were hardened during verification: requeue checks now clean up their waiting lobby, and the Holo exchange fixture avoids requesting the base card it asserts unchanged.

Workspace type checks, the standalone hosted build and the earlier GitHub Pages build passed. Formatting and whitespace checks passed before handoff. No production data was modified; no commit, push or deployment was performed.
