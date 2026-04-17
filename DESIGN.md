# Design System — Anstoss

> Doctrine as of 2026-04-17: Anstoss adopts the **Renuir design system** end-to-end
> (tokens, primitives, state components, sheet/drawer patterns). The Industrial/Utilitarian
> doctrine from 2026-03-21 is retired — see Decisions Log.

## Product Context
- **What this is:** White-label mobile app platform for amateur football clubs in Germany/Europe
- **Who it's for:** Amateur football coaches (Kreisliga), players, parents — clubs that currently run everything through WhatsApp
- **Space/industry:** Sports team management (competitors: Spond, Heja, TeamSnap, Tactico)
- **Project type:** Mobile app (React Native / Expo) + API (NestJS)

## Aesthetic Direction
- **Direction:** Editorial-neutral, Renuir-derived. Calm surfaces, confident typography, generous rhythm.
- **Decoration level:** Minimal. Typography, card geometry, and white space do the design work.
- **Mood:** Premium-but-approachable. A club management tool that feels like the companion app of a modern consumer product, not a spreadsheet in disguise.
- **Differentiator:** White-label identity — every club sees their badge and primary color propagate through the app's `primary` slot. Renuir's neutrals stay constant; the club colors the accents.

## Typography

**Stack:**
- **DM Sans** — all interface text. Regular (400) / Medium (500) / Bold (700).
- **Geist Mono** — kept exclusively for numeric data displays (match scores, kick-off times, stat values, dues amounts). Use via the `StatCard` component or explicit `fontFamily="geist-mono"`.

**Loading:** Both loaded via `expo-font` at app root. DM Sans: `@expo-google-fonts/dm-sans`. Geist Mono: local asset.

**Scale (7-step, responsive via `ms()`):** source of truth is `apps/mobile/src/theme/typography.ts`.

| Token | Base px | Use |
|---|---|---|
| `display` | 32 | Hero text, onboarding, empty-state headlines |
| `h1` | 24 | Screen titles, section headers |
| `h2` | 20 | Card titles, dialog headers |
| `body` | 16 | Body text, form field labels, buttons |
| `bodySmall` | 14 | Secondary text, timestamps, metadata |
| `caption` | 12 | Tags, badges, helper text, tab labels |
| `micro` | 10 | Legal fine print, distance labels |

**Semantic text styles:** consume `TextStyles.display`, `TextStyles.h1`, etc. from `typography.ts`. Each style bundles family + size + lineHeight + letterSpacing + color. Do not pick font-size and weight separately in component styles.

**Line height:** 1.15 for display/h1, 1.4 for body, 1.6 for caption/micro.

**Letter spacing:** tighter on display/headlines (`-0.5` → `-0.2`), zero on body, wider on captions and badges (`+0.3` → `+0.4`).

## Color

### Approach: club-adaptive primary over Renuir neutrals

Neutrals and semantic colors are fixed (Renuir palette). The `primary` slot is populated at runtime from the club badge / club setup color picker. Dark mode is first-class — `useColors()` returns the active theme object.

### Tokens — light theme (source: `apps/mobile/src/theme/colors.ts`)

**Brand (runtime, from `ClubThemeContext`):**
- `primary` — club primary color
- `primaryPressed` — 15% darkened primary (pressed states)
- `primary50` — 10% opacity of primary (selected backgrounds, subtle highlights)

**Surfaces:**
- `surface` `#FFFFFF`
- `surfaceRaised` `#FFFFFF` + shadow `0 1px 3px rgba(0,0,0,0.08)`
- `surfaceSunken` `#F3F3F3` — search fields, inline inputs on cards
- `surfaceOverlay` `rgba(15,17,22,0.55)` — modal/drawer backdrops

**Text:**
- `textPrimary` `#1A1C22`
- `textSecondary` `#5F626C`
- `textTertiary` `#9CA3AF`
- `textInverse` `#FFFFFF`

**Borders:**
- `borderSubtle` `#F3F4F6` — card dividers
- `borderDefault` `#E6E7F2` — default input/card borders
- `borderStrong` `#C9CCD9` — focus, dividers

**Semantic:**
- `success` `#22C55E` / `successBg` `#DCFCE7`
- `warning` `#F59E0B` / `warningBg` `#FEF3C7`
- `error` `#9C4A67` / `errorBg` `#FEE7E7`
- `info` `#3B82F6` / `infoBg` `#E8EBFF`

### Dark theme (source: `apps/mobile/src/theme/colors.ts → darkTheme`)
- Mirrors the shape of `lightTheme`. Surfaces collapse to warm charcoals, text inverts, semantic colors lighten by ~10% to stay legible. The club primary is desaturated 15% to reduce glare.

### Club color contract
- On club setup, contrast-check the chosen primary against white. If ratio < 3:1, auto-darken 20% and warn the coach.
- Never place the club badge on the club primary — badges have their own colors; use `surface`.

## Spacing

Source: `apps/mobile/src/theme/spacing.ts`. Responsive via `ms()`.

| Token | Base px | Use |
|---|---|---|
| `xxs` | 2 | Hairline gaps |
| `xs` | 4 | Tight internal padding (badge text) |
| `sm` | 8 | Between inline elements |
| `md` | 12 | Standard form field spacing |
| `lg` | 16 | Between related cards |
| `xl` | 20 | Between sections inside a screen |
| `xxl` | 24 | Between major sections |
| `xxxl` | 32 | Hero spacing |

**Component-level constants:**
- `SCREEN_PADDING = 24` — horizontal padding on every screen root
- `BODY_PADDING = 20` — inner padding for cards that take the full screen width
- `CARD_PADDING = 16` — default card internal padding
- `BUTTON_PADDING_HORIZONTAL = 16`, `BUTTON_PADDING_VERTICAL = 12`
- `INPUT_PADDING_HORIZONTAL = 16`, `INPUT_PADDING_VERTICAL = 12`

## Layout
- Mobile-first, single column. Two-column grids allowed for stat cards, admin dashboards, league tables.
- **Max content width:** 428px (iPhone 14 Pro Max logical width).
- **Tab bar:** `TAB_BAR_HEIGHT = 85`, `TAB_ICON_SIZE = 28`, `TAB_BUTTON_SIZE = 58`.
- **Touch targets:** 44×44 minimum (Apple HIG / WCAG).

## Radii

Source: `spacing.ts → Radius`.

| Token | Base px | Use |
|---|---|---|
| `sm` | 8 | Badges, chips, pills |
| `md` | 12 | Inputs |
| `lg` | 16 | Cards, modals |
| `xl` | 20 | Bottom sheets, hero cards |
| `full` | 9999 | Avatars, circular buttons |
| `button` | 23 | Primary buttons (Renuir signature) |
| `card` | 16 | Cards (equivalent to `lg`) |
| `input` | 12 | Inputs (equivalent to `md`) |

## Motion
- **Easing:** ease-out on enter, ease-in on exit, ease-in-out on move.
- **Durations:** 50–100ms (button press), 150–250ms (tab transitions), 250–400ms (screen transitions, modal entry), 400–700ms (celebration only).
- **Rules:** Every motion must aid comprehension. RSVP tap gets a 100ms scale pulse (0.95→1.0) + haptic. Bottom sheets: 300ms ease-out spring from bottom. No parallax, no scroll-driven animations.

## Component Patterns

### Primitives (all under `apps/mobile/src/components/ui/`)

Each primitive is a thin wrapper around Renuir's visual language, styled with the new tokens.

- **Button** — primary / secondary / tertiary. Uses `primary` for filled, `borderStrong` for outlined, `textPrimary` for ghost. Height `BUTTON_HEIGHT_MD = 46`. Radius `button = 23`.
- **Text** — variant prop maps to `TextStyles` key. Always prefer this over raw `<Text>`.
- **Card** — radius `card = 16`, padding `CARD_PADDING = 16`, subtle shadow.
- **Badge / StatusPill** — uppercase `tag` TextStyle, `letterSpacing: 1.0`, radius `sm`. Colored backgrounds come from the semantic `*Bg` tokens.
- **Avatar** — circular, fallback = first two letters of the user's name in DM Sans Bold on `primary`.
- **IconButton / PressableScale** — Ionicons only. 40×40 hit area minimum. Scale pulse on press.
- **ListRow** — left slot (avatar/icon) + title + subtitle + right slot (chevron / timestamp / badge).
- **SegmentedControl / FilterChipRow** — caption-sized labels, `primary50` background on the active segment.
- **SectionHeader / SectionGroup** — `caption` style uppercase label, then grouped rows with `surface` background and `borderSubtle` between.
- **Banner / Divider** — banners use semantic `*Bg` with matching text color.
- **Screen (root wrapper)** — safe-area, StatusBar tuned to theme, background = `background`.
- **StatCard** — Geist Mono for the value, `caption` for the label, `h2` for the delta.

### Forms, inputs, sheets (all under `apps/mobile/src/components/`)

- **FormInput** — label above, field with `borderDefault`, focus turns border to `primary`, error swaps to `error`. Supports leading/trailing icons and helper text.
- **BottomDrawer** (host for `MultiSelectSheet`, `SelectionSheet`, `ScrollPicker`, `ModalHeader`) — top drag handle, title row, scroll body, optional sticky CTA footer. Radius `xl` on top corners only. Backdrop `surfaceOverlay`.
- **SearchBar** — pill-shaped, `surfaceSunken` background, leading magnifier icon, trailing clear button.
- **BadgeUploadPicker** — dashed-border tap target; on tap opens `CameraModal`-style picker.

### State components

- **EmptyState** — centered, `display`-sized heading, `bodySmall` supporting copy, optional CTA button.
- **ErrorState** — same layout as EmptyState, with error semantic color + retry CTA.
- **Skeleton** — four variants (card, row, avatar, text). Pulses opacity 0.4→1 over 900ms.

### Feature-level patterns

- **RSVP card** — full-width Card, event title (`h2`), date/time in Geist Mono (`body`), location (`bodySmall`), three buttons in a row (Yes/Maybe/No). Selected state = filled semantic background + `primary` border.
- **Club badge treatment** — rendered at actual aspect ratio. Sizes sm/md/lg/xl = 24 / 40 / 64 / 96. Never on the club primary; always on a neutral surface.
- **Chat bubbles** — own messages use `primary` background + `textInverse`. Others use `surfaceSunken` + `textPrimary`. Announcements (coach-only) are full-width cards with a `primary`-tinted left border, not bubbles. Timestamps Geist Mono, `micro`, `textTertiary`.
- **Data display** — always Geist Mono. Scores centered at `h1` weight 500. Kick-off times `body` weight 400. Dues `body` weight 500, right-aligned in tables. Tabular figures enabled (`fontVariant: ['tabular-nums']`).

## Accessibility
- **Contrast:** All text meets WCAG AA (4.5:1 body, 3:1 large text). Enforced via `useColors()` token outputs; no hand-picked hex values in components.
- **Club color validation:** On club setup, runtime contrast check; auto-darken 20% if the chosen primary fails 3:1 against white.
- **Touch targets:** 44×44 minimum everywhere. Enforced at the primitive level.
- **Screen reader:** Every icon button has `accessibilityLabel`. Every image has `accessibilityLabel` or `accessibilityRole="image"`.
- **Reduced motion:** Respect `AccessibilityInfo.isReduceMotionEnabled()` — disable scale pulses and spring transitions; opacity transitions remain.
- **Font scaling:** Support up to 200% system font size without layout breakage.

## White-Label Theming Implementation
- **Framework:** React Native StyleSheet + Renuir-derived tokens under `apps/mobile/src/theme/`.
- **Token files:**
  - `colors.ts` — `lightTheme` / `darkTheme` + `useColors()` hook
  - `typography.ts` — `TextStyles` + size/weight/line-height/letter-spacing scales
  - `spacing.ts` — `Spacing` / `Radius` + component constants
  - `scale.ts` — responsive `ms()` utility
  - `tokens.ts` — re-exports from the above; preserved during the migration sweep
  - `club-theme.ts` — hydrates `primary` / `primaryPressed` / `primary50` from club config
- **Theme config fields:** `primary_colour` (hex), `secondary_colour` (hex), `badge_url` (R2), `club_name`, `welcome_text` (max 500 chars).
- **Premium fields:** `splash_image_url`, `sponsor_logos[]`, `custom_domain`.
- **Caching:** Theme config cached in AsyncStorage on login, applied immediately on app open, background refresh every 24h.
- **Fallback:** If fetch fails with no cache, apply Anstoss defaults (Renuir indigo `#2438EB` as primary, warm grays).
- **Contrast safety:** Runtime check — if `primary` contrast ratio against white < 3:1, auto-darken 20%.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | ~~Industrial/Utilitarian aesthetic~~ (retired 2026-04-17) | Superseded by Renuir doctrine below. |
| 2026-03-21 | DM Sans + Geist Mono | DM Sans: geometric clarity, excellent mobile readability. Geist Mono: sharp numeric display. Both retained. |
| 2026-03-21 | Club-adaptive color system | No fixed brand color. Club IS the brand. Retained. |
| 2026-04-17 | **Adopt Renuir design system end-to-end** | Renuir's token layer and component library are mature (68 components, dark-mode ready, 7-step type scale, responsive `ms()` utility). Anstoss adopts them wholesale; the club-adaptive primary slots into Renuir's `primary` token. Replaces Industrial/Utilitarian doctrine. |
| 2026-04-17 | Responsive sizing via `ms()` | Renuir's `scale.ts` provides moderate damping for 320–430pt range. Avoids fixed px scaling on small devices. |
| 2026-04-17 | Dark mode promoted to first-class | Renuir tokens include `lightTheme` / `darkTheme`. All new components must consume `useColors()` rather than raw color constants. |
