# Gacha Triad roadmap

This is the agreed sequence after 0.1.4. Public GitHub Pages testing precedes each production update. Features retain the FF/pixel style and support English/French, mouse-first interaction and narrow screens.

| Patch | Theme               | Features                                                                       |
| ----- | ------------------- | ------------------------------------------------------------------------------ |
| 0.1.5 | The card tavern     | Tavern home; shared controls; clearer match results.                           |
| 0.1.6 | Build your decks    | Named deck loadouts; dedicated deckbuilding workspace; strength/weakness view. |
| 0.1.7 | Your player journey | Flexible weekly objectives; journey journal; stronger season identity.         |
| 0.1.8 | Learn and improve   | Saved match replays; distinctive bot personalities.                            |
| 0.1.9 | Your identity       | Configurable public profiles; portrait frames.                                 |

## 0.1.5 acceptance criteria

- The home page brings current daily notices, the active deck, matchmaking and community chat together. Notices use existing server data; they do not poll on every profile revision.
- The entire desktop home chat, composer and Send button fit at 100% zoom. Card values retain their readable scale. Mobile layouts scroll normally.
- Standard buttons, native fields/selects, tabs, dialogs and help tips share the same theme and focus/disabled/loading states. Tabs support arrows and Home/End; dialogs support Escape and restore focus.
- Results show the server-awarded Prisms and actual Elo change, with capture highlights derived from the match history. Settled matches can requeue directly. Trade One must settle before another game.
- Win, loss, draw, practice and custom Trade One cases remain clear. The release does not change rewards, rating formulas, matchmaking policies or saved player data.
