# Gacha Triad 0.1.4

## Daily Triad puzzle

One shared, server-generated endgame per UTC day. Players have two cards and three empty cells; exactly one first move forces a win against the opponent's strongest defense. The puzzle uses real cards and All Open, Same, Plus and Combo.

The first solve earns **100 Stellar Prisms once per account per day**. The daily leaderboard sorts first solves by attempts, then total elapsed time since first revealing the board, including retries. Practising after solving does not replace the first result. Guests can play, but must register or sign in to claim a reward. Registration preserves the guest profile; signing into a different existing profile switches progress to that profile.

Boards and progress persist in the database. Moves, defense, version checks, solve detection, time and rewards are server-authoritative. Repeated claims cannot pay twice, including accounts with multiple legacy profiles. Puzzle play does not modify collection cards, saved decks, match statistics or Elo.

## Two ranked Draft formats

The original **Draft** remains available: three private boosters per player, choose five of 15 cards, Three Open / Same / Plus / Combo. Its existing Elo and history stay intact.

**Shared Draft** is a separate queue: four boosters form one shared pool of 20 distinct cards. Both players finish opening, then alternate picks until each has five legal cards. Public picks make the battle All Open / Same / Plus / Combo. The second picker starts the battle. Each pick allows 45 seconds; the first missed pick is automatic and a second consecutive missed pick forfeits. A manual pick resets that player's missed-pick warning. Temporary cards never enter collections.

Shared pools contain at least ten cards of 3★ or below, ensuring both players can finish legal hands even after denial picks. Each booster still contains its guaranteed 3★+ and 4★+ slots; Holo chance is 5% per card.

Ranked, Draft and Shared Draft each have an independent Season 0 Elo rating and leaderboard tab. Rated queues search for humans by default. Players can explicitly allow a practice bot while waiting; practice never changes Elo or adds ranked leaderboard results. Shared Draft has a new rating starting at 1000. Existing Draft ratings are not reset or reused.

## Ranked without collection loss

New ordinary Ranked games use no card trade. Losses and forfeits preserve the collection and saved deck, allowing immediate requeue without editing the deck. Trade One remains an explicit custom-lobby rule.

Migration 019 also removes stakes from waiting and active Ranked games. Already completed games with a pending Trade One selection retain their settlement so previously held reservations can finish correctly.

## Interface and deployment

The preview follow-up moves the puzzle's hands, controls and leaderboard beside a closely fitted board frame. Its reward badge and instructions use less space. Shared Draft has a persistent desktop chat column, four sorting options and selected-card inspection. Repeated Draft instructions are available in a rules dropdown. Picked-card summaries place values at the bottom-right above the fade, with the name kept separate; shared-pool cards retain their usual layout. Card values remain large; the layouts reclaim space from interface panels and margins first.

The home page links to the daily puzzle and offers both Draft queues. Queue notices, the rulebook, tutorial, profiles, results and English/French text distinguish the formats. Desktop and mobile layouts retain the FF/pixel theme. This release also includes the uncommitted 0.1.3 interface improvements documented in [RELEASE_V0_1_3.md](RELEASE_V0_1_3.md).

Migration 019 runs through the existing server migration path. Back up persistent server data before a normal deployment. There is no account, inventory or existing rating reset. Build the hosted site with the normal production origin, and deploy frontend and server together so the new routes and profile field are available.

Validation results are recorded in [AUDIT_V0_1_4.md](AUDIT_V0_1_4.md). The GitHub Pages preview is published separately from the VPS; see [PREVIEW_V0_1_4.md](PREVIEW_V0_1_4.md). Production has not been deployed by Codex.
