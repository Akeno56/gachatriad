# Full pre-hosting reset — v0.13

Explicitly requested and completed on 8 November 2026. This supersedes v0.12's earlier instruction to retain users. It is an offline maintenance action, **not a startup migration** and not part of the update command.

The local game was already stopped. Its private controller was closed, the entire old `.data` directory was moved into ignored `.cache/before-v13-full-reset-20261108T201525Z`, and a new database was initialized. Frontend URL settings were retained; bot auto-population was disabled. The authentication signing secret was regenerated so old sessions cannot authenticate against the new save.

| Data                  | Before | After |
| --------------------- | -----: | ----: |
| Auth users            |     91 |     0 |
| Player profiles       |     92 |     0 |
| Matches               |    307 |     0 |
| Owned inventory rows  |    346 |     0 |
| Public chat messages  |      2 |     0 |
| Private chat messages |      1 |     0 |

The fresh save also has zero login accounts, sessions, admin assignments and Stellar Prisms. The database and auth secret were closed cleanly after verification. The private controller was reopened at `http://127.0.0.1:3030`; the game server and bots remain off. No new test user was created in this active save. The old backup and its private `reset-report.json` remain local and are not published.

## Administrator access after the wipe

Start the game server when ready, register a new normal account, then open the private host tool. In **Moderation**, find that account and choose **Make admin**. Refresh the game to obtain its admin UI. Guests cannot become admins. The host tool works without an existing game admin; its access is independent of game accounts.

For the new VPS, use the same private panel through SSH forwarding; see [hosting and first-admin setup](DEDICATED_HOSTING.md). Start with an empty VPS data directory. Do not copy the old PC save or recovery archive there.

An isolated hosted-controller test starts with no admin, registers a test account, promotes it through the host-only moderation endpoint, verifies its new admin status and performs a currency grant. Public requests still cannot grant themselves admin access.

Normal future releases preserve accounts and gameplay in `/var/lib/gachatriad`. Neither `git push` nor the deployment updater runs this wipe.
