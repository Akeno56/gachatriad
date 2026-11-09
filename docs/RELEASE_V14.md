# v0.14 — Match activity, chat and bot population

The turn policy and interface described here are superseded by [0.1.0 Alpha](RELEASE_V0_1_0.md). The 120-second disconnect policy, moderation and bot economy remain.

This update preserves existing accounts, collections, currency and history. Migration 014 is additive. Do not run a reset or copy the old PC save to the VPS.

## Match abandonment

- A human has 120 seconds to play on their turn. Expiry forfeits the match instead of playing random cards for them.
- Losing the last authenticated browser connection starts a separate 120-second grace period, including while the opponent is playing. Another connected tab keeps the player online. Reconnecting before expiry clears the disconnection clock, but does not reset the turn clock.
- A valid move or new Draft reveal also proves activity if a browser temporarily loses its socket connection. Polling, duplicate moves and duplicate reveals cannot keep an AFK player in the game.
- Draft participants forfeit after 120 seconds without a new reveal or locking their deck. Locked participants can wait for the other player. The existing three-minute draft selection deadline remains.
- Disconnect clocks are saved. A server restart retains an existing clock and starts one for any active human who has not yet reconnected. A reconnect or move after expiry cannot evade the result.
- Forfeits use normal result settlement, including Trade One and human-versus-human Elo. They do not award currency. Repeated timer ticks cannot settle twice.

## Chat

- Public General, Trade and Lobbies channels, friend messages and battle messages use the same server-side English/French moderation.
- The local filter checks a curated abuse/threat vocabulary, common accent/spacing/zero-width/leet obfuscations, repeated spam, executable links and credential requests. It is a conservative rules-based first layer, not semantic moderation or a guarantee of catching every abusive message.
- Existing three-second send limits remain. Five recent messages within 30 seconds, or a third identical message in that window across chat types, are blocked. Three moderation violations within ten minutes mute all chat for ten minutes; the mute survives reconnects and restarts.
- Automatic blocks and mutes appear in the private panel's recent moderation actions, with the category rather than the rejected message body. Administrators retain the existing suspension/disconnect tools.
- Battle chat is readable only by that match's two participants and is not broadcast into public feeds. Guests can use it against a human opponent. Bots have no chat. Sending closes when the sender leaves the result or ten minutes after completion; older messages remain readable by the participants.
- Public chat still requires registration. Its disabled input now explicitly says to register or sign in. Account, public, friend and battle inputs retain native text editing on mobile.

## Bots

- Enabling population creates/reuses 30 labeled bots. A previously enabled population is expanded automatically on server startup.
- The private host panel and in-game administrator controls provide linked Easy/Medium/Hard percentage sliders. Percentages total 100%, save to the database and survive restarts. Setting Easy to 45%, then Medium to 25%, leaves Hard at 30%.
- Percentages are apportioned to 30 whole bots using largest remainders: 45/25/30 gives 14 Easy, 7 Medium and 9 Hard bots. Actual counts are shown alongside the mix. The original default remains 100% Medium.
- Each bot uses its assigned AI difficulty. Easy bots cannot create/join Ranked tables. Rebalancing closes any waiting Ranked tables that become ineligible.
- Ranked and Draft results involving any bot change neither participant's Elo. Bot games are excluded from ladder game/win/draw counts and ranked title qualification. Currency, ordinary achievements and applicable card transfers continue normally.
- Legacy API calls specifying a single difficulty still work and select a 100% mix of that difficulty.

CRT now defaults to OFF for a new visitor. An explicit saved ON/OFF preference is preserved.

## Validation

- 130 unit/API tests pass, including exact timeout boundaries, early/late reconnects, valid HTTP play during a temporary socket loss, persisted clocks, real multi-tab socket disconnects, Trade One settlement, guest battle privacy, moderation/mutes and completed bot duels with currency but no Elo.
- Eleven desktop/mobile browser journeys pass (one shared population journey intentionally skips on mobile), plus the chat/input journey passes in an Android-sized Chromium touch browser. Account, public, friend and battle inputs accept text and retain focus during background polling. This is browser emulation, not a claim of testing a physical Redmi in Opera.
- The private-panel browser test checks linked 45/25/30 controls, rounded 14/7/9 counts, reload persistence, rebalancing and pause. An actual isolated local server restart preserves the mix.
- The `https://gachatriad.com` hosted production build and workspace type checks pass. Browser/API tests use isolated or in-memory saves, not the live VPS.

Screenshots: [desktop battle chat](screenshots/v14-battle-chat-desktop.png), [mobile battle chat](screenshots/v14-battle-chat-mobile.png), [private bot controls](screenshots/v14-bot-mix-panel.png).

## Publish on gachatriad.com

In **PowerShell on your PC**, from the project folder:

```powershell
cd E:\DEVPRG\Codex\GachaTriad
git add .
git commit -m "Add activity forfeits, moderated battle chat and mixed bot difficulties"
git push origin main
```

After the push succeeds:

```powershell
ssh -t gachatriad "bash /opt/gachatriad/source/tools/deploy/update.sh https://gachatriad.com"
```

Wait for the deployment success message, then refresh the website. Both game and private host panel restart on the new release. Existing saves remain in `/var/lib/gachatriad`; the updater takes its normal backup. Deploy between matches because timers use real elapsed time.
