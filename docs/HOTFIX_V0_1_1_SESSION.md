# 0.1.1 session workload hotfix

Users reported progressively slow interactions and disconnects after deployment. A VPS reboot temporarily cleared the symptoms. The failed deployment attempt had stopped at sudo authentication, before activating the release. Memory was available, while the running game process used substantial CPU. The screenshots show successful repeated requests, not a confirmed IP block or HTTP 429.

Inspection identified avoidable repeated work: world notifications triggered profile/social refreshes and all page subscribers, including full public profiles and admin history analysis. Bot ticks could announce changes even when the bot made no move. Every profile read also rewrote its last-seen timestamp and saved deck, including unchanged rows. These are corrected below; the exact cause of the live stall is not conclusively established from the available logs.

## Changes

- Automatic world notifications are coalesced with at least two seconds between completed menu refreshes. Battles retain a 250ms interval; explicit actions still refresh immediately. The safety poll is every 15 seconds. Hidden tabs suspend automatic refreshes and refresh when shown again.
- Public profiles and admin history/collection snapshots refresh every 30 seconds, independently of unrelated world events. Admin review has a manual Refresh button. Own-profile edits and account/query changes update immediately. Bot status refreshes every 15 seconds, and population actions update it immediately.
- Profile activity timestamps write at most once a minute. Saved decks/avatars are repaired only when an owned card is actually missing. Healthy profile polling does not rewrite the profile row.
- Routine API/socket authentication loads a small identity record, rather than rebuilding inventory, packs, decks and match history for every chat, battle or Market read. Ownership, suspension, guest expiry, admin and matchmaking-rating checks remain live. The full profile still loads through `/api/profile`.
- Idle bot turns no longer trigger a false world-change notification.
- HTTP 429 responses respect Retry-After, including the auth header variant, without discarding the signed session or replaying a mutation. GET requests time out after 15 seconds; empty gateway responses show a readable reconnecting message. Transient failures preserve the selected profile too.
- The server logs slow requests (over two seconds) and HTTP 429 responses, at most once per route/category every 30 seconds. Logs use route templates, status and duration, without query parameters, bodies or session tokens. This supplies evidence if a stall recurs.

No accounts, cards, currency, history or ratings are reset. No schema migration is needed. The live site is unchanged until this patch is committed, pushed and deployed with the existing updater.

## Verification

- The full regression run passed 162 tests. After the final transport-error refinement, all 13 targeted transport/scheduler/connection/translation tests passed, including separate handling of chat moderation rejections so they do not pause battle reads.
- All 16 desktop/mobile browser checks passed, covering sustained notifications, profile navigation, manual admin refresh, Market purchases/exchanges, ranked results, arena chat, spectating, ladder and Cards.
- In the sustained-notification test, 50 rapid world updates produced at most six automatic profile reads and no repeated viewed-profile/history queries. Manual admin refresh and navigation to the current account still worked.
- An isolated query-count comparison measured 14 database queries for full profile reconstruction versus two for the authorization identity. This is the authorization portion of a request, not a claim of an overall 7x site speedup.
- An unmodified live test guest was observed for six minutes: 146 requests completed, no failed requests/disconnections, and the slowest request was about 1.62 seconds. This did not reproduce the reported stall; it does not rule out the heavier admin/battle workload or a later recurrence. The new slow-request logs are intended to help investigate that if needed.

## Publish after local verification

In the project folder on the PC:

```powershell
git add .
git commit -m "Fix repeated session and profile refresh workload"
git push origin main
ssh -t gachatriad "bash /opt/gachatriad/source/tools/deploy/update.sh https://gachatriad.com"
```

The updater restarts the game service and private admin service. Refresh the browser with Ctrl+F5 after success. A full VPS reboot is not required for this code update.
