# 0.1.5 — The card tavern

## Home

The tavern keeps the active deck and community chat prominent, with compact matchmaking commands and a noticeboard for the daily puzzle, booster availability and online players. Daily status is read when entering the tavern, when returning to a visible tab, and at most once a minute while visible; it is independent of the profile polling cycle. A failed notice fetch offers a retry without blocking play.

The desktop chat continues to size itself from the actual space below the deck. Its composer, guest sign-in notice and bottom controls remain within the viewport. Narrow screens retain a scrolling layout.

The original metallic GACHA / TRIAD title remains. Combo practice now opens from the rulebook instead of adding another home command. Short desktop screens use tighter command and notice spacing without shrinking the cards.

## Shared controls

`components/ui.tsx` provides Button, Tabs, GameDialog and HelpTip. The visual tokens and standard button/field/select states live in `app/controls.css`. Inputs and selects retain native browser behavior. Tabs support arrows and Home/End, with one selected tab in the tab order. Dialogs use the native modal top layer, restore focus and support Escape; dismissing a help tip does not close its containing dialog.

The shared components are used by the tavern commands, public/battle chat tabs, leaderboard tabs, queue confirmations, practice confirmation, update notes and results. Existing standard controls inherit the shared visual theme without changing their form logic.

## Match results

Results group the outcome, player identities, score, reward and rating change. Prisms and Elo come from the server response. Captures, Same/Plus turns and the largest Combo are counted from the real move history, including recaptures. Early endings identify the score at the time of the result rather than implying the board was completed.

Queue again leaves the settled result before entering the same queue. Custom games keep their rematch action. Pending Trade One transfers block queueing and returning to the tavern until settlement; review-board access remains available. The server retains all eligibility and settlement checks. No new reward, rating or inventory rules are introduced.

## Spectating

Spectators have a prominent exit above the score. A completed public match opens a summary with both players, the winner or draw, score, rules, saved starting decks and the exact recorded Elo change for each player. The large lobby-return action stays visible while the decks scroll. Closing the summary allows board review and reopening match details.

The summary uses a compact header on taller desktop screens and a side column on short, wide screens. Both desktop deck rows retain their card dimensions; phones scroll the deck lists within the dialog while keeping the lobby-return action visible.

The spectator API exposes starting decks only after completion and retains its public-lobby authorization check. Draft pools, live hidden hands and participant settlement actions remain private. Elo comes from the match audit, so later games cannot change the displayed result. Unrated matches report no Elo change; an older backend reports unavailable details rather than inventing data.

## Deployment

The completed spectator summary extends the existing spectator API response. Deploy frontend and backend together to provide its saved decks and Elo audits. No database migration or new environment variables are required. The normal hosted updater preserves production data. GitHub Pages testing is separate from the production VPS.
