# Community, ranked and account lifecycle — v0.6

**Chat & friends** opens a centered community panel from any game screen. Main chat is readable by guests; posting, friend requests and duel invitations require registration. Messages are plain text (1–300 characters), limited to one every three seconds. Request IDs make send retries idempotent. The latest 80 messages are shown. Administrators can remove messages. The existing suspension control blocks both HTTP actions and socket reconnection.

Players can search registered human accounts by public name/profile ID, request/accept/decline/remove friendships, see friends' socket presence, and invite accepted friends. An invitation creates a human-only, recipient-reserved Three Open table with no card trade. It lasts five minutes. Only the recipient can accept; either participant can cancel/decline. The server checks friendship, ownership, expiry, tutorial completion, deck legality and existing games. Accept retries return the same match. Public lobby join requests cannot bypass recipient or expiry checks.

The Ladder page has constructed ranked and Draft leaderboards. Only registered, unsuspended human players with a completed match in that mode are included. Lists show rating, games, wins and provisional status for fewer than five games. Bots remain real duel opponents but do not occupy leaderboard places.

Titles unlock from existing achievements and constructed rating milestones. Rating titles require five completed ranked matches and use peak rating, so a subsequent loss does not remove the unlock. Equip a title in Profile; the server rejects unearned titles. Names, equipped titles and the chosen avatar appear during duels. Square imported character icons are used for avatars, with portrait/emblem fallbacks.

Ranked is separate from solo practice. Its first entry requires an explicit Trade One acknowledgement saved on the profile; the API also enforces it. Prior ranked players are treated as already informed on migration. Ranked opponents may be players or Medium/Hard population bots. Easy bots cannot open/join ranked tables; an already-running ranked bot retains at least Medium play if population difficulty is lowered. Solo practice never transfers cards or changes rating.

Human-created lobbies/queues default to bots disabled; the host can opt in. Bot-created demo tables permit bots. Eligibility is enforced on the server, including automatic pairing and bot simulation. Only a waiting table's host may close it; closure is retry-safe. A table that has started must be left through the normal match-forfeit action.

Card exchange and Trade One transfer exact copies/finishes. When the last owned copy is gone, it is removed from the saved active deck in the same transaction. Duplicate copies keep the deck entry valid. A lost profile-avatar card falls back to the default emblem. Existing stale deck entries are repaired when the profile loads. A deck below five cards produces a count-specific message and must be completed in Collection; acquisition does not silently replace a stolen card with an unrelated card. Draft retains its separate temporary-card pool.

## Guest lifecycle and deletion

Registering a new account preserves that guest's collection, boosters and currency. Signing into an existing account discards the temporary guest instead of attaching another selectable profile. Legacy secondary guest profiles are removed during startup cleanup; only the registered account's primary profile remains selectable.

Guests expire after seven days without authenticated game-profile activity. A live browser's normal refreshes count as activity. Cleanup runs at startup and every five minutes while the server is running. Orphan anonymous auth accounts are also cleaned using session/user timestamps. Registered accounts and bot identities are excluded. On the first migration, existing guests' activity is initialized from available profile, auth-user and session timestamps; subsequent game-profile activity updates it directly.

Deletion removes the profile, inventory, boosters, currency ledger, friendships, invitations, messages and login sessions. Historical matches/trade offers are retained with a shared **Deleted player** identity so the other participant's results and transfer records remain valid. Active duels are forfeited and pending Trade One is settled through the existing rules before removal. Administrative audit entries remain in the private host database.

The private host console can delete a selected guest or registered account. The operator must type its exact current name. Neither ordinary users nor in-game administrators can invoke the host deletion endpoint without the private controller secret. Use the console to manage an account when it is offline as well as online.

## Testing grants and bot difficulty

The host console's **Selected user tools** grants 1–1,000,000 Stellar Prisms or 1–100 standard boosters per action. Grant retries use a stable request ID, and the server logs them. Gift boosters use standard odds, preserve their admin source, and are unopened until the recipient chooses to open them. In-game administrators also have a testing grant form on player profiles; non-admins cannot view/use it. Grants cannot create negative balances or exceed integer limits.

Bot difficulty defaults to **Medium**. Easy favors random legal moves; Medium uses capture/placement evaluation; Hard additionally evaluates exposed friendly edges, including cards just captured. Every difficulty receives only its own hand and public board. The console can apply difficulty without restarting the server, and it persists across restarts.
