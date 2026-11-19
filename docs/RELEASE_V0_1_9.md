# 0.1.9 — Profiles, portrait frames and achievements

## Changes

- Public profiles have a bio (160 characters), a chosen rated format, up to three owned cards and three earned achievements in showcases. Portrait and title selection move into Customize profile, with a preview and unsaved-change confirmation. Account connections remain in a separate section.
- Six portrait frames: Classic is available immediately; Silver, Azure, Verdant, Amethyst and Gold unlock through existing achievements. Frames appear in profiles, the tavern, chat, friends, ladders, battles and results.
- Achievements use category menus, status and sort controls, readable progress and a detail view. Small screens open details in a dialog. Earned frame rewards can be equipped and achievements added to or removed from the public showcase.
- Earned achievements retain full progress bars if the current collection later shrinks. Targets and rewards are unchanged.

## Storage and security

Migration `023_profile_customization.sql` adds profile revision, bio, frame, featured format and showcase columns. Defaults preserve existing avatars and titles. It does not reset saved progress, currencies, decks, replays or ratings.

Customization routes operate on the authenticated profile. The server validates all fields in one transaction, verifies card ownership and earned titles/achievements, and rejects stale revisions. Legacy avatar/title routes advance the revision too. Bio text is bounded, checked by the existing moderation rules and displayed as plain text; it is never interpreted as HTML or Markdown. Unknown frame IDs and custom asset URLs cannot be equipped.

When the last copy of a showcased card leaves the inventory, normal inventory cleanup removes it from the showcase. Public reads also filter by current ownership. Earned frame unlocks use the permanent achievement records. The offline gameplay reset clears equipped frames and showcases along with their gameplay prerequisites; do not run that reset for this release.

## Public test checklist

1. Open Profile → Customize profile. Change the portrait, title, bio and rated format. Add cards and earned achievements in Showcases. Choose an unlocked frame and save.
2. Reload, then view the profile from another test account. Only the chosen cards should appear. Inspect a Holo card and compare its values. Replays and edit controls must remain owner-only.
3. Try an unearned frame. Check that its requirement is readable and it cannot be selected.
4. Make an edit and cancel. Check Keep editing and Discard changes. Edit from two tabs; the older tab must receive a conflict without overwriting the saved version.
5. In Achievements, try every category, earned/in-progress filters and both sorts. Open a reward, equip a frame, then feature/unfeature an earned achievement. Recheck Profile.
6. Check English/French on desktop and a 320 px phone viewport. Inspect dialog scrolling, footer buttons, progress bars, card values and portrait frames in chat/battle/results.
7. Register a customized guest profile and confirm the choices persist. Confirm accounts and saved replays still work.

Public testing uses GitHub Pages with the isolated backend and the complete `?server=...` preview URL. Pushing this release publishes Pages only. Production requires the existing separate backup/update process after testing is approved.

## Verification

- 229 automated tests across 42 files. Coverage includes authorization, owned cards, earned frames/titles, bounded and moderated bio text, atomic/concurrent saves, collection shrinkage, public identity fields and unchanged gameplay data.
- 18 desktop/mobile browser flows across 0.1.7–0.1.9, including public profile viewing, Holo card inspection, frame rewards, showcase actions, error recovery, guest registration, weekly objectives and saved replays.
- Rechecked the six new flows at 1280×720 and narrow phone sizes, with French at 320 px, screenshot review and visible achievement actions.
- Workspace type checks and the production-mode GitHub Pages export.
