# Gacha Triad roadmap

This is the agreed sequence after 0.1.4. Public GitHub Pages testing precedes each production update. Features retain the FF/pixel style and support English/French, mouse-first interaction and narrow screens.

Player-facing copy stays short and functional in both languages. Avoid promotional slogans, reassurance and repeated rule explanations in page bodies.

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

- Complete any three of six weekly objectives for 150 Prisms, once per account and UTC week. Wins, streaks and collection loss are never required. Guests can progress and register before claiming.
- Count real server records only, including practice and bots for full duels; exclude forfeits, timeouts and administrative test results. Reset Monday at 00:00 UTC, and reject stale-week claims. Repeated requests cannot pay twice.
- Provide a persistent journey journal with optional next steps across tutorial, boosters, decks, duels, puzzles, drafting, duplicate management and card exchanges. Keep completed chapters after deleting a loadout.
- Give Season 0 the identity “The First Gathering” and show separate actual rated results for Ranked, Draft and Shared Draft. Do not invent an end date, reset ratings or introduce collection loss.
- Keep the home chat and card values readable, avoid extra polling on profile revisions, and verify English/French desktop and phone layouts. Achievements visual changes remain scheduled for 0.1.9.
