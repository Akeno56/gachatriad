# English and French — v0.13

The flag selector between the wallet and account button changes the game language. The choice is saved in this browser under `triad-language`; the server does not modify chat or account content. English is the default.

`LanguageProvider` owns the locale; `LocaleView` translates React text nodes and accessibility text declaratively before rendering. It never rewrites the live DOM. Client pages/components must create their visible text inside `LocaleView`; opaque server-component children cannot always be traversed. Form values, IDs, event handlers and class names are unchanged. `LocalizedDate` formats dates/times using the active locale.

Add exact English/French pairs to `apps/web/lib/translations-fr.json`. Dynamic messages use numbered captures (`{0}`, `{1}`); the translator preserves captured names and translates known mode/booster/element labels where appropriate. Use `NoTranslate` or `translate="no"` for character names, player names and user messages. Same, Plus, Combo, Elemental and other rule names remain in their original form.

The unit test checks training steps, presets, dynamic placeholders and unchanged names. The browser suite checks persistence, onboarding, gameplay during a language change and visible dictionary coverage across game sections. When adding UI, add its translation and check both languages on desktop and mobile.
