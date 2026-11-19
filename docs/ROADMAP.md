# Gacha Triad roadmap

This is the agreed sequence after 0.1.4. Public GitHub Pages testing precedes each production update. Features retain the FF/pixel style and support English/French, mouse-first interaction and narrow screens.

Season names use a single word. Player-facing copy stays short and functional in both languages. Avoid promotional slogans, reassurance and repeated rule explanations in page bodies.

| Patch | Theme               | Features                                                                       |
| ----- | ------------------- | ------------------------------------------------------------------------------ |
| 0.1.5 | The card tavern     | Tavern home; shared controls; clearer match results.                           |
| 0.1.6 | Build your decks    | Named deck loadouts; dedicated deckbuilding workspace; strength/weakness view. |
| 0.1.7 | Your player journey | Flexible weekly objectives; journey journal; stronger season identity.         |
| 0.1.8 | Learn and improve   | Saved match replays; distinctive bot personalities.                            |
| 0.1.9 | Your identity       | Configurable public profiles; portrait frames; achievements UI/visual rework.  |

## 0.1.5 acceptance criteria

- The home page brings current daily notices, the active deck, matchmaking and community chat together. Notices use existing server data; they do not poll on every profile revision.
- The entire desktop home chat, composer and Send button fit at 100% zoom. Card values retain their readable scale. Mobile layouts scroll normally.
- Standard buttons, native fields/selects, tabs, dialogs and help tips share the same theme and focus/disabled/loading states. Tabs support arrows and Home/End; dialogs support Escape and restore focus.
- Results show the server-awarded Prisms and actual Elo change, with capture highlights derived from the match history. Settled matches can requeue directly. Trade One must settle before another game.
- Win, loss, draw, practice and custom Trade One cases remain clear. The release does not change rewards, rating formulas, matchmaking policies or saved player data.

## 0.1.6 acceptance criteria

- Save, rename, copy, delete and explicitly activate private named loadouts. Preserve existing active hands and inventories. Prevent unauthorized access and stale overwrites.
- Retain incomplete or unavailable alternatives for later editing. Recheck deck legality and current ownership/availability when activating; protect queued matchmaking from a deck switch.
- Keep the hand readable beside a filtered collection on desktop, with usable phone layouts. Provide explicit replacement, inspection, Undo and unsaved-work recovery.
- Show real directional coverage, weak/high side counts and corner placement guidance. Include actual Holographic values without claiming a predicted win rate.
- Support English/French and validate the new migration, recovery paths, keyboard controls and public testing build before production deployment.

## 0.1.7 acceptance criteria

- Complete any five of six weekly objectives for 150 Prisms, once per account and UTC week. Wins, streaks and collection loss are never required. Guests can progress and register before claiming.
- Count real server records only, including practice and bots for full duels; exclude forfeits, timeouts and administrative test results. Reset Monday at 00:00 UTC, and reject stale-week claims. Repeated requests cannot pay twice.
- Provide a persistent journey journal with optional next steps across tutorial, boosters, decks, duels, puzzles, drafting, duplicate management and card exchanges. Keep completed chapters after deleting a loadout.
- Give Season 0 the identity “Astral” and show separate actual rated results for Ranked, Draft and Shared Draft. Do not invent an end date, reset ratings or introduce collection loss.
- Keep the home chat and card values readable, avoid extra polling on profile revisions, and verify English/French desktop and phone layouts. Achievements visual changes remain scheduled for 0.1.9.

## 0.1.8 acceptance criteria

- Save completed matches for their participants, including practice and both Draft formats. Provide a private library with mode filters, favourites and pagination. Active matches and unrelated players must never expose hidden hands through replay endpoints.
- Preserve actual starting cards, Holographic values, rules, Elemental cells, captures, final result and awarded Elo. Playback uses stored frames rather than rerunning a future rules engine. Support older completed matches and partial games ending in forfeit.
- Offer first/previous/next/last turns, scrubbing, pause/play, speed and card inspection. Access replays from the result screen and the player's own profile. Reading or favouriting a replay cannot award rewards or alter ratings.
- Give bots Balanced, Attack, Defence and Combos styles independently of difficulty. Let players select practice difficulty, style and rules. Keep bot labels, legal deck limits, hidden-hand privacy and existing no-Elo practice rules.
- Retain account-deletion anonymisation, English/French and usable phone layouts. Verify the public GitHub Pages test build before production deployment. Achievements visuals remain in 0.1.9.

## 0.1.9 acceptance criteria

- Configure a plain-text bio, portrait, earned title, preferred rated format, three owned showcase cards and three earned showcase achievements. Save all fields atomically; reject stale updates and recheck ownership and unlocks on the server.
- Keep existing avatars, titles and earned records. Remove showcase cards when their last owned copy leaves the collection. Never expose the remaining inventory, active deck, account details or private replays through a public profile.
- Offer a Classic portrait frame and five permanent achievement frames: Silver (first duel), Azure (first win), Verdant (50 characters), Amethyst (two Combo captures in one turn) and Gold (100 wins). Frames are cosmetic and appear in profiles, the tavern, chat, friends, ladders, battles and results.
- Rework achievements with categories, earned/in-progress filtering, progress/recent sorting, a selected achievement detail view, earned dates and frame rewards. Equip an unlocked frame and add/remove featured achievements directly from this view.
- Preserve completed achievement bars even if an inventory-based counter later falls. Do not change achievement targets, gameplay rewards, Elo, matchmaking or the weekly five-of-six requirement.
- Validate short English/French text, desktop and 320 px layouts, modal focus/unsaved changes, authorization, conflicting edits and the public Pages testing build before production deployment.
