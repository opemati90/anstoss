# Design System: Anstoss "Flutlicht"

Doctrine as of 2026-11-13. Supersedes the Renuir-derived doctrine of 2026-04-17. The white-label contract, the one-accent RSVP rule (2026-09-11) and the emoji rule (2026-09-11) carry over unchanged.

Reference prototype: Anstoss Redesign canvas (31 interactive screens). Exact values below are taken from it.

## Direction

Floodlit pitch at night. Calm chalk surfaces, deep club color for match moments, one floodlight-lime accent for the single most important action on a screen. Hierarchy comes from type and space, not boxes.

## Color

### Light theme

| Token | Value | Use |
|---|---|---|
| `background` | `#F6F5F1` | Screen background (chalk) |
| `surface` | `#FFFFFF` | Grouped lists, cards, inputs |
| `surfaceSunken` | `#ECEAE3` | Segmented-control track |
| `surfaceIcon` | `#F1EFE9` | Icon tiles inside rows |
| `surfaceAvatar` | `#E8E6DE` | Initials avatars |
| `inverse` | `#121A15` | Primary button, money card, lineup screen, offline banner |
| `textPrimary` | `#121A15` | Body and titles |
| `textSecondary` | `#5B675F` | Meta, labels, inactive tabs (5.3:1 on background) |
| `textOnClub` | `#FFFFFF` | Text on club color |
| `textOnClubMuted` | `#C9D6CF` | Secondary text on club color |
| `textOnInverseMuted` | `#A9B8B0` | Secondary text on inverse |
| `hairline` | `#EDEBE4` | Row dividers inside groups |
| `border` | `#E4E2DA` | Icon buttons, tab bar top edge |
| `borderStrong` | `#CFCDC4` | Secondary button outline |
| `accent` | `#D4F25C` | Floodlight lime. Fill only, always with `textPrimary` on top. Never text on light surfaces. |
| `scrim` | `rgba(12,17,14,0.55)` | Sheet backdrop |
| `tagPositiveBg` / `tagPositiveText` | `#EEF1E6` / `#2E3B13` | Paid, trial |
| `tagNeutralBg` / `tagNeutralText` | `#F1EFE9` / `#3E4A43` | Open, waiting |
| `tagCriticalBg` / `tagCriticalText` | `#FBE4D8` / `#8A2C0D` | Overdue, injured, sign out |
| `dotUnread` | `#D9480F` | Notification dot |
| `dotOffline` | `#F2A33A` | Offline banner |

### Dark theme

| Token | Value |
|---|---|
| `background` | `#0B100D` |
| `surface` | `#151C17` |
| `surfaceIcon` | `#1F2821` |
| `hairline` | `#232C25` |
| `border` | `#2A342D` |
| `textPrimary` | `#ECEFEA` |
| `textSecondary` | `#97A39C` |
| `tabBar` | `#0F1511` |
| `inverse` (primary button) | `#ECEFEA` with `#0B100D` text |
| `accent` | `#D4F25C` (unchanged) |
| Club primary | Lightened about 8% in lightness so heroes keep depth against the dark background |

### Club color (white-label)

- `primary` stays runtime-hydrated from `ClubThemeContext`. New default: `#0E3B2B` (replaces `#16794A`).
- Full club-color backgrounds are allowed on: the home hero, the event header, the live match header, the lineup pitch and the parent/player hero. Never more than one club-color surface per screen.
- Text on club color is always `textOnClub` / `textOnClubMuted`. Keep the existing runtime contrast check (auto-darken below 3:1 against white).
- Club setup offers six primary presets (`#0E3B2B`, `#7A1F2B`, `#123A5C`, `#1F2A44`, `#5B2A86`, `#B4511E`) and four secondary presets (`#D4F25C`, `#FFFFFF`, `#121A15`, `#E8B92E`), each with a custom hex option.
- Teams inherit the club pair and may set their own.
- A primary below 4.5:1 against white keeps its value for surfaces; a darkened `primaryTextColor` is derived for text and icons.
- `secondary` appears only on the crest ring, hero accent strip and kit UI. Lime stays the action accent.

### Rules

1. **One lime per screen.** Lime marks the single most important action (Erinnern, Teilen, Ans Team, Platz anbieten) or a live/attention dot. Everything else uses `inverse` or outline buttons.
2. **RSVP uses one accent.** Selected answer is filled with the club primary on light surfaces and with white on club-color heroes. The other two stay neutral. Response distribution is one bar in three densities of the same color (100%, 45%, 16% on club; club, mid-tint, `#E1DFD7` on light).
3. **Status tags** (paid, overdue, injured) may use the tag pairs above. They are states, not choices.

## Typography

| Role | Font | Size / weight | Notes |
|---|---|---|---|
| Display | Barlow Condensed | 700, uppercase, line-height 0.95 | Match moments only: kickoff time (50 to 54), opponent on event header (40), scores (72), welcome headline (66) |
| Numbers | Barlow Condensed | 700, tabular | Dates in lists, points, amounts, jersey numbers, stats |
| Title | Inter | 30 / 700, letter-spacing -0.025em | Screen titles, sentence case |
| Sheet title | Inter | 22 / 700 | |
| Body | Inter | 15 to 16 / 400 to 600 | |
| Small | Inter | 13 | Meta lines |
| Label | Inter | 12 / 600, uppercase, +0.07em | Section labels |
| Tab | Inter | 11 / 500, active 700 | |
| Arabic | IBM Plex Sans Arabic | 400 / 600 / 700 | Replaces both Inter and Barlow when `ar` is active. No uppercase. |

Inter replaces DM Sans. Barlow Condensed replaces Geist Mono for numeric display. Load both through `expo-font` (`@expo-google-fonts/inter`, `@expo-google-fonts/barlow-condensed`, `@expo-google-fonts/ibm-plex-sans-arabic`).

## Spacing and shape

| Token | Value |
|---|---|
| Screen padding | 20 horizontal, 60 top (below safe area), 108 bottom above tab bar |
| Section gap | 24 |
| Group radius | 20 |
| Hero radius | 28 |
| Sheet radius | 28 top corners |
| Row min height | 60 (54 for dense lists) |
| Icon tile | 40, radius 12 |
| Icon button | 44 circle |
| Button | 56 high, pill (radius 28) |
| Small button / chip | 36 high, pill |
| Input | 52 high, radius 14 |
| Tab bar | 84 high, 4px active dot under label |

## Components

- **GroupedList**: white surface, radius 20, horizontal padding 16, rows separated by `hairline`. No outer border, no shadow. Replaces bordered cards everywhere except heroes.
- **ListRow**: leading slot (icon tile, avatar or number), title + optional meta, trailing slot (value, tag, chevron, small button).
- **Button**: `primary` (inverse), `accent` (lime), `secondary` (outline `borderStrong`). Pill. Sizes 56 and 36.
- **Chip / FilterChipRow**: pill, outline when off, `inverse` fill when on.
- **SegmentedControl**: track `surfaceSunken`, selected segment white with soft shadow. RSVP variant fills selected with club primary.
- **Crest**: shield shape with initials, club primary fill, thin lime inner line. Real badge image replaces it when uploaded. Sizes 28, 36, 44, 48, 72.
- **Hero**: club-color card with a faint centre-circle line drawing at 7% white. One per screen.
- **BottomSheet**: chalk background, 40x5 handle, scrim backdrop. Used for decline reason, role switch, reminders.
- **GiroCode**: EPC QR generated on device, 148pt, on white, with recipient, IBAN and reference rows beside copy chips.
- **ActingAsBanner**: inverse bar pinned under the status bar, lime dot, role and remaining time, lime "Beenden" button. Present on every screen while an acting session runs.
- **Skeleton**: `#E9E7E0` blocks, opacity pulse 1.0 to 0.45 over 1.2s, disabled under reduced motion.
- **EmptyState / ErrorState**: centred in a white group, 56 icon tile, title 20/700, one primary action.
- **OfflineBanner**: inverse bar, amber dot, explains that answers are queued.

## Motion

Unchanged from the previous doctrine: ease-out enter, 150 to 250ms tab transitions, 300ms sheet spring, RSVP 100ms scale pulse with haptic, no parallax. Respect reduced motion.

## Accessibility

- WCAG AA on every text pair. Lime is never used for text on light surfaces.
- 44x44 minimum targets.
- Real radio, tab and switch semantics on segmented controls, chips and toggles.
- Support 200% font scale. Display type may wrap; it must not clip.
- RTL: all layout uses start/end. Directional icons (back, chevron, send, swap) mirror under RTL. Numbers and times stay LTR.

## Decisions log

| Date | Decision | Rationale |
|---|---|---|
| 2026-11-13 | Adopt Flutlicht doctrine | Premium, football-native identity with less visual noise than the card stack. |
| 2026-11-13 | Inter + Barlow Condensed replace DM Sans + Geist Mono | Condensed numerals read like a scoreboard and save width on dense rows. |
| 2026-11-13 | Grouped hairline lists replace bordered cards | Removes the card-stack look; hierarchy from type and space. |
| 2026-11-13 | One lime action per screen | Keeps the accent meaningful. |
| 2026-11-13 | Tabs follow capabilities; player-only and parent-only users get 4 tabs | Kader and dues administration are staff tools. |
| 2026-11-13 | Roles are hats, not modes | One person can be player, captain, coach and Vorstand at once. All held roles are active together; no switching. |
| 2026-11-13 | Vorschau and Vertretung limited to Vorstand and Teammanager | Read-only preview of member views, plus time-boxed, logged cover for a role not held. |
| 2026-11-13 | Clubs and teams define primary and secondary colors, with custom hex | Not every club fits a preset; youth teams often wear different kits. |
| 2026-11-13 | Vorstand, Teammanager and Kapitän can enter the roster for others | Many clubs are set up by one person before others join; placeholders are claimed later. |
| 2026-11-13 | Two plans: Kostenlos and Verein (10,99 € per month per club) | Free is enough for one team to adopt; the club pays once it spreads. Per club keeps it under 50 cents per player. |
| 2026-11-13 | Dues are tracked, never collected | Members pay the club directly via GiroCode; Anstoss shows status only and stays out of payment flows. |
| 2026-11-13 | Languages: de, en, tr, es, fr, pt, ar | Spanish and Arabic added; Arabic ships with full RTL. |
