# Design System — Anstoss

## Product Context
- **What this is:** White-label mobile app platform for amateur football clubs in Germany/Europe
- **Who it's for:** Amateur football coaches (Kreisliga), players, parents — clubs that currently run everything through WhatsApp
- **Space/industry:** Sports team management (competitors: Spond, Heja, TeamSnap, Tactico)
- **Project type:** Mobile app (React Native / Expo) + API (NestJS)

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian
- **Decoration level:** Minimal — typography and spacing do the design work
- **Mood:** Confident, functional, no-nonsense. The app should feel like a well-run club — organized, reliable, quietly authoritative. Not playful, not corporate. Think locker room whiteboard clarity, not sports marketing gloss.
- **Reference sites:** Spond (hot pink, photography-heavy), Heja (green, illustrated, family-friendly), Tactico (dark mode, premium sports photography) — Anstoss deliberately avoids all three aesthetics. The differentiator is the white-label identity: every club sees their own badge, their own colors.

## Typography
- **Display/Hero:** DM Sans Bold (700) — clean geometric sans with personality in the rounded terminals. Feels modern without being trendy.
- **Body:** DM Sans Regular (400) — excellent readability on mobile, generous x-height, clear at small sizes.
- **UI/Labels:** DM Sans Medium (500) — distinct from body weight, clear button/label hierarchy.
- **Data/Tables:** Geist Mono — match scores, kick-off times, stats, dues amounts. Tabular figures, tight spacing, unmistakable data voice.
- **Code:** Geist Mono
- **Loading:** Google Fonts CDN — `DM Sans:wght@400;500;700` + `Geist Mono:wght@400;500`
- **Scale:**
  - `3xl`: 32px / 2rem — screen titles, hero numbers
  - `2xl`: 24px / 1.5rem — section headers
  - `xl`: 20px / 1.25rem — card titles, nav items
  - `lg`: 18px / 1.125rem — emphasized body
  - `md`: 16px / 1rem — body text (base)
  - `sm`: 14px / 0.875rem — secondary text, captions
  - `xs`: 12px / 0.75rem — labels, badges, timestamps
  - `2xs`: 10px / 0.625rem — legal text, fine print

## Color

### Approach: Club-Adaptive Neutral System
Anstoss is a chameleon — it must look intentional with any club's colors. The design system uses warm neutrals as the foundation and reserves color for the club's identity. No fixed brand color. The club IS the brand.

### Club Colors (Dynamic)
- **`--club-primary`:** Provided by club setup (badge upload extracts dominant color, coach can override). Used for: primary buttons, active states, links, selected tabs, progress bars.
- **`--club-primary-light`:** 10% opacity of club primary. Used for: selected backgrounds, subtle highlights.
- **`--club-primary-dark`:** 20% darker than club primary. Used for: pressed states, text on light primary backgrounds.

### Neutral Palette (Fixed — Warm Grays)
- **Background:** `#FAFAF8` — warm off-white, not clinical
- **Surface:** `#FFFFFF` — cards, modals, inputs
- **Surface Elevated:** `#FFFFFF` with `shadow: 0 1px 3px rgba(0,0,0,0.08)` — floating elements
- **Border:** `#E5E5E0` — warm gray, subtle
- **Border Strong:** `#D1D1CC` — dividers, input borders on focus
- **Text Primary:** `#1A1A18` — near-black, warm
- **Text Secondary:** `#6B6B66` — descriptions, timestamps, secondary info
- **Text Tertiary:** `#9C9C96` — placeholders, disabled text
- **Text Inverse:** `#FFFFFF` — text on dark/colored backgrounds

### Semantic Colors
- **Success:** `#2D7A3A` — confirmations, RSVP yes, payment received
- **Warning:** `#B8860B` — attention needed, overdue, tentative RSVP
- **Error:** `#C4372C` — failures, declined, injury alert
- **Info:** `#2563A0` — informational, neutral notices

### Dark Mode Strategy
- Swap background to `#0F0F0E`, surface to `#1A1A18`, text to `#E8E8E4`
- Reduce club primary saturation by 15% to avoid eye strain
- Semantic colors: lighten by 10%, reduce saturation by 10%
- Borders become `#2A2A28`

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — mobile-first, thumb-friendly targets
- **Scale:**
  - `2xs`: 2px — hairline gaps
  - `xs`: 4px — tight internal padding (badge text)
  - `sm`: 8px — compact spacing (between inline elements)
  - `md`: 16px — standard padding (card content, form fields)
  - `lg`: 24px — section spacing (between cards in a list)
  - `xl`: 32px — major section breaks
  - `2xl`: 48px — screen-level padding (top/bottom margins)
  - `3xl`: 64px — hero spacing (rare, marketing screens only)

## Layout
- **Approach:** Grid-disciplined — mobile-first, single column with occasional 2-col grids for stats/data
- **Grid:** Mobile: 1 column, 16px horizontal padding. Tablet: 2 columns for data-heavy views.
- **Max content width:** 428px (iPhone 14 Pro Max logical width — design for the widest common phone)
- **Border radius:**
  - `sm`: 4px — badges, small chips, input fields
  - `md`: 8px — cards, buttons, modals
  - `lg`: 12px — large cards, bottom sheets
  - `full`: 9999px — avatars, circular buttons, pills
- **Touch targets:** Minimum 44x44px per Apple HIG / WCAG

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Easing:**
  - Enter: `ease-out` (elements arriving)
  - Exit: `ease-in` (elements leaving)
  - Move: `ease-in-out` (repositioning)
- **Duration:**
  - `micro`: 50-100ms — button press feedback, toggle switches
  - `short`: 150-250ms — tab transitions, dropdown open/close
  - `medium`: 250-400ms — screen transitions, modal entrance
  - `long`: 400-700ms — complex animations (rare — celebration states only)
- **Rules:**
  - No decorative animation. Every motion must serve comprehension.
  - RSVP tap feedback: 100ms scale pulse (0.95 → 1.0) + haptic
  - Screen transitions: 250ms horizontal slide (push/pop nav)
  - Bottom sheets: 300ms ease-out spring from bottom
  - No parallax, no scroll-driven animations, no bouncing logos

## Component Patterns

### RSVP Card
The core interaction. Must be one-tap, zero-friction.
- Full-width card with event name, date/time in Geist Mono, location
- Three action buttons in a row: Yes (success green), Maybe (warning amber), No (error red)
- Selected state: filled background with club primary border
- Attendance count shown below: "14 yes · 3 maybe · 2 no"

### Club Badge Treatment
- Always rendered at actual aspect ratio (no forced square crop)
- Displayed on warm off-white background, never on club primary (badges have their own colors)
- Sizes: `sm` (24px), `md` (40px), `lg` (64px), `xl` (96px for club setup/profile)
- Fallback: first two letters of club name in DM Sans Bold on `--club-primary` circle

### Chat Bubbles
- Own messages: `--club-primary` background, white text
- Others' messages: `#F0F0EB` (warm light gray) background, `--text-primary` text
- Announcements (coach-only): full-width card with `--club-primary` left border, no bubble shape
- Timestamps: Geist Mono `xs`, `--text-tertiary`

### Data Display (Scores, Times, Money)
- Always Geist Mono — creates instant visual distinction from conversational text
- Match scores: `3xl` weight 500, centered
- Kick-off times: `lg` weight 400
- Dues amounts: `lg` weight 500, right-aligned in tables
- Tabular figures enabled for all numeric displays

## Accessibility
- **Contrast:** All text meets WCAG AA (4.5:1 for body, 3:1 for large text)
- **Club color validation:** On club setup, warn if chosen primary color fails contrast check against white text. Suggest darker variant.
- **Touch targets:** 44x44px minimum on all interactive elements
- **Screen reader:** All icons have aria-labels, all images have alt text
- **Reduced motion:** Respect `prefers-reduced-motion` — disable all transitions except opacity
- **Font scaling:** Support up to 200% system font size without layout breakage

## White-Label Theming Implementation
- **Framework:** Tamagui token-based design system
- **Theme config fields:** `primary_colour` (hex), `secondary_colour` (hex), `badge_url` (R2), `club_name`, `welcome_text` (max 500 chars)
- **Premium fields:** `splash_image_url`, `sponsor_logos[]`, `custom_domain`
- **Caching:** Theme config cached in AsyncStorage on login, applied immediately on app open, background refresh every 24h
- **Fallback:** If fetch fails with no cache, apply Anstoss defaults (navy `#1A3C6E` primary, warm grays)
- **Contrast safety:** Runtime check — if `club_primary` contrast ratio against white < 3:1, auto-darken by 20%

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | Industrial/Utilitarian aesthetic | Must work as chameleon with any club colors. No decoration competing with club identity. |
| 2026-03-21 | DM Sans + Geist Mono | DM Sans: geometric clarity, excellent mobile readability, not overused. Geist Mono: sharp data display for scores/times/money. |
| 2026-03-21 | Club-adaptive neutral system | No fixed brand color. Warm grays as foundation. Club IS the brand. |
| 2026-03-21 | Minimal-functional motion | Amateur football coaches are volunteers with no patience for animation. Every motion earns its milliseconds. |
| 2026-03-21 | 4px base spacing unit | Comfortable density for mobile — thumb-friendly without wasting screen real estate. |
