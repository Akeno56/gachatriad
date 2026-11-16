# 0.1.3 — Interface polish

The Play screen groups mode selection, the saved deck and chat into one compact lobby. Feedback lives in the top bar. Ranked and Draft queues use a timer panel, a separate cancel control and a full-width practice action, including in French.

- Collection groups search, universe and sorting, marks empty deck slots, and displays unsaved changes. Site links offer Save and leave, Discard changes or Keep editing. Refresh/close use the browser warning. A recovery draft survives Back/Forward and reload in the same tab; it is scoped to the player and server. Editing never changes the active server deck until Save or Auto build succeeds.
- Successful saves, purchases and market actions show a dismissible confirmation. Failed saves keep the editor and warning open for retry. Errors remain inline.
- Cards, Collection and Market remember browsing filters, sorting, card pagination and scroll position in this tab. Storage is optional and does not add polling.
- Mobile navigation exposes all eight game destinations through Menu. Friends becomes a compact chat icon with an unread badge.
- Market keeps common filters visible, puts additional filters in More filters with an active count, and distinguishes loading from an empty result. Card inspection separates artwork from its facts.
- The Alpha version indicator opens localized update notes. Menu feedback uses ordinary hover, pressed and focus states.

The production export is built with `pnpm build:hosted` and the existing VPS updater remains the deployment path. This release does not require a data reset.

Validation covers isolated desktop/mobile Market purchases and exchanges; deck save, discard, recovery and failed-save retry; browser preference restoration; French mobile navigation and release notes. Queue layout was separately checked in English/French at 1366, 390 and 320 px, including cancellation and practice disclosure.

The release audit also fixes excessive automatic battle refresh traffic, artwork-inspection overlap, narrow profile layouts, clipped album metadata, early filter-input restoration and missing French administrator text. See [the audit report](AUDIT_V0_1_3.md) for measurements, security checks and remaining verification limits.
