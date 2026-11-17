# 0.1.5 validation

This release changes the tavern home, shared controls and match results. It uses existing server APIs and does not change reward formulas, Elo rules, inventory settlement or authentication.

## Automated checks

- All 191 unit/server tests pass across 35 files, including two match-highlight tests against an actual engine replay.
- Workspace type checks and the standalone hosted static export pass.
- The final targeted browser run passes 19 scenarios; one desktop-only viewport scenario is intentionally skipped in the mobile project.
- Browser scenarios use isolated test accounts and local servers. New test contexts block production requests.
- Desktop and mobile checks cover human Ranked wins/losses and exact saved Elo, completed Unranked wins/draws, one-time reward persistence after reload, direct requeue without deck changes, and custom Trade One claiming and navigation restrictions.
- Home checks cover English/French, registered/guest states, desktop viewports down to 1280×720, narrow 320px French layouts, the restored GACHA / TRIAD title, and the absence of a home Combo command.
- Layout measurements keep the desktop chat composer within the viewport. Short desktop screens compact commands and notices without reducing card dimensions.
- Keyboard checks exercise arrow/Home/End tabs, dialog initial focus and focus restoration, and Escape dismissing a tooltip without closing its modal.
- The relocated rulebook Combo lesson retains its two-sided capture animation and game effect preferences. Existing rule animations and Shared Draft layout/chat/sorting remain covered.
- Daily notice requests are bounded independently of profile polling. Translation scanning finds no missing new prose or duplicate dictionary keys; remaining new unchanged templates are numeric Elo text and the Trade One rule name.

## Visual review and limits

Screenshots cover the home title and readable card values, compact desktop spacing, French/narrow layouts, victory/defeat/draw results, and custom card settlement. Native modal top-layer behavior preserves focus containment, with portals kept within the game shell so the theme and effects setting still apply.

This is regression and visual coverage for the changed surfaces. It does not establish that every possible UI, security or network issue has been excluded. The earlier intermittent Wi-Fi/HTTP2 delivery problem cannot be reproduced or diagnosed from local frontend checks. Production deployment remains separate from GitHub Pages testing.
