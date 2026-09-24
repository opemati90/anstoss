# Rules for every revamp implementer

Repo: /Users/yemi/anstoss (Turborepo). Mobile: apps/mobile (Expo Router, RN). API: apps/api (NestJS + Prisma). Shared Zod: packages/shared. Branch: develop. Other agents are editing OTHER areas of the same working tree at the same time.

## Coordination
- Touch only the files in your area. If you must edit a shared file (app/_layout.tsx, src/e2e/session.ts, src/i18n/*.ts, apps/api/prisma/schema.prisma, app.module.ts), make small, surgical Edit calls (never rewrite the whole file), re-read right before editing, and keep your additions in one clearly commented block.
- Do NOT git commit, push, stash, reset, or checkout. The lead commits.
- Do NOT start Metro, simulators, or Maestro. The lead verifies on device.
- When running tsc, ignore errors in files outside your area (another agent may be mid-edit); fix all errors in yours. Run only your area's jest specs plus src/i18n/__tests__ (not the whole suite) to save memory.

## Design system (already applied to tokens; use it, do not fork it)
- Accent: `c.primary` from `useClubColors()` is the ONE accent (club colour, default pitch green). Spend it on the primary action, active/selected state, progress. Everything else is neutrals. Exception by decision: RSVP answers use semantic status colours (Zusage success green, Vielleicht warning amber, Absage error red) because they are status, not decoration.
- Neutrals: warm greys only (`c.textPrimary/Secondary/Tertiary`, `c.surface*`, `c.border*`). No hardcoded hex in screens; both light and dark must work.
- Type: use `<Text variant=...>` from src/components/ui. Floor is 12pt; body text 15–17. Tabular numerals (`tabular`) for times, scores, counts, money. One large title per screen.
- Shape: actions are pills (Button already is), cards radius 16, inputs 12, `borderCurve: 'continuous'` on every rounded rect. Spacing on a 4/8 grid, prefer `gap`.
- Depth: flat surfaces separated by background contrast and hairlines; no heavy shadows. No gradients, no emoji in chrome, no glassmorphism on content.
- Icons: the existing `Icon` component (SF-symbol names). One icon family.
- Tap targets >= 44pt. Every Pressable has accessibilityRole + label.
- Full state cycle on every screen: loading skeleton that matches layout, composed empty state that says how to fill it, inline specific error with retry. Never a stuck skeleton: a failed or empty query must resolve to empty/error.
- Navigation: push to go deeper; `presentation: 'modal'` for self-contained tasks with Cancel/Done; formSheet/BottomSheet only for short pickers. Native stack titles where possible.
- Reuse the UI kit in src/components/ui (Button, Card, ListRow, SectionGroup, SegmentedControl, StatusPill, Avatar, Badge, Banner, BottomSheet, SearchBar, Screen). Improve a kit component rather than re-implementing it locally.

## Cross-platform and every screen size (owner: "pixel perfect on all devices, Android too")
- Layout must hold from a 320–360pt/dp-wide phone (iPhone SE, small Android) to Pro Max and tablets. No fixed widths for text containers; rows use flex with `flexShrink: 1` / `minWidth: 0` on text, `numberOfLines` only where truncation is a deliberate design choice (then with an ellipsis that never hides the key fact), and wrap chips/segments rather than overflow. Horizontal ScrollViews only for genuinely scrollable rails.
- Test mentally at font scale 2.0 (Android) / Accessibility XL (iOS): nothing clips, buttons grow in height, rows wrap.
- Android specifics: no iOS-only shadow props (use the elevation tokens or hairlines), `includeFontPadding: false` + explicit lineHeight on custom text, TextInput vertical padding/`textAlignVertical`, `android_ripple` on pressables (or the kit's PressableScale), hardware back closes sheets/modals first, KeyboardAvoidingView `behavior` per platform (`padding` iOS, `height` or none on Android with `softwareKeyboardLayoutMode: pan`/resize respected), status bar and navigation bar colours follow the theme in light and dark, edge-to-edge insets via safe-area context (no hardcoded 44/34 insets).
- Spacing only from tokens (4/8 grid); screen horizontal padding 16; consistent section rhythm; no negative margins to fix alignment.
- Use `useWindowDimensions`, never `Dimensions.get` at module scope.

## German amateur-club realism
Use real domain terms in German copy: Training, Spiel, Heim/Auswärts, Anstoß, Treffpunkt, Zusage/Absage, Kader, Aufstellung, Fahrgemeinschaft, Trikotwäsche, Kabinendienst, Probetraining, Vereinswechsel, Freigabe, Passantrag, spielberechtigt ab, Beitrag, SEPA-Lastschrift, Aufnahmeantrag, Jugendleiter, Kassenwart, Abteilungsleiter. English copy uses the plain English equivalent.

## i18n
- Locales: de (fallback), en, fr, it, pt, tr in apps/mobile/src/i18n/*.ts (these six are the registered app languages). Arabic has been removed from the app (ar.ts deleted 2026-09-24); never create or reference an ar locale. Every new key goes into ALL six, properly translated (no English or German copy pasted into other locales). src/i18n/__tests__/parity.spec.ts and defaultValue-keys.spec.ts must pass.
- No hardcoded user-facing strings.
- Native-speaker quality in every locale: no literal translations, natural football terminology per language, correct plurals (i18next _one/_other), register consistent with the existing file (German uses "du"), dates/times/money through locale formatters (Intl / date-fns locale), never hand-assembled.

## E2E mocks
The app runs Maestro flows against mock scenarios in src/e2e/session.ts (routes matched by URL; personas player, coach, club-admin, parent, free-agent). If you add or change an API endpoint the screens call, add the matching mock response there so the e2e personas render real-looking German data (club "SV Albatros", opponents like "SV Babelsberg 03", names like Tim Weber, Lukas Hoffmann).

## API changes
- New Prisma fields/models need a migration under apps/api/prisma/migrations (timestamped folder, hand-written SQL consistent with schema.prisma). Any model with clubId must be registered in apps/api/src/prisma/tenant.middleware.ts (a schema-drift spec enforces it).
- Validate inputs with Zod schemas in packages/shared; enforce authorization server-side (reuse existing access helpers); add/adjust *.spec.ts for services you change and run them.

## Done means
tsc clean for your files, lint clean for your files, your specs + i18n specs pass, dead screens/routes removed from navigation and `_layout.tsx`, and a final report listing: files changed, routes added/removed, API changes, migrations, mocks added, anything you could not finish and why.
