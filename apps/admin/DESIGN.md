---
name: Anstoss Admin Directory
description: Existing Anstoss identity applied to scoped, searchable platform directories.
colors:
  page: "#F6F5F1"
  surface: "#ffffff"
  ink: "#121A15"
  muted: "#5B675F"
  line: "#E4E2DA"
  line-strong: "#CFCDC4"
  primary: "#0E3B2B"
  primary-soft: "#E7EEE9"
  accent: "#D4F25C"
  nav-text: "#ECEFEA"
  nav-muted: "#C9D6CF"
  green: "#21784a"
  green-soft: "#e7f4ec"
  danger: "#a61b12"
  danger-soft: "#fdebea"
typography:
  body:
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    lineHeight: 1.45
  headline:
    fontSize: "36px"
    fontWeight: 630
    lineHeight: 1
    letterSpacing: "-0.03em"
  brand:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.03em"
  table:
    fontSize: "13px"
  label:
    fontSize: "14px"
    fontWeight: 600
rounded:
  control: "14px"
  surface: "20px"
  pill: "999px"
  badge: "6px"
components:
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "9px 14px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  navigation-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  status-active:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.green}"
    rounded: "{rounded.badge}"
  status-deleted:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.badge}"
---

# Design System: Anstoss Admin Directory

## Overview

This scoped document inherits the Anstoss Redesign identity from [the repository design system](../../DESIGN.md); it does not replace that file. It records the web admin implementation in `src/styles.css`, the directory contract in `src/index.html`, and shared behavior in `src/directory.js`. Mobile-specific dimensions and historical tokens in the root document are not claims about this web surface.

The established identity is warm neutral surfaces, ink text, pitch-green interaction cues, lime navigation selection, and Inter with Barlow Condensed branding. The user-approved extension separates Clubs, Teams, Players, and All accounts into task-first directories. No new visual world or imagery was introduced.

Finish review disposition: **SHIP**. Teams and shared components were screenshot-reviewed at desktop and mobile sizes; Clubs, Players, and All accounts were source-reviewed. This is the recorded finish-review coverage, not a claim that every view received a separate visual review. Evidence: repository `.impeccable/review/admin-directory/desktop.png` and `mobile.png`.

## Colors

Pitch green supplies focus and hover cues; lime identifies the active item on the ink navigation surface. White tables and fields sit on the warm page. Muted text and neutral rules separate metadata from record names without introducing another brand palette.

Active and deleted account badges use the existing green and danger pairs respectively, alongside explicit text labels. Directory refresh, reset, and pagination actions use the neutral outlined button, not a new accent treatment. This implementation declares a light color scheme; it does not implement the mobile dark theme.

## Typography

Locally hosted Inter provides interface text. Barlow Condensed is reserved for the inherited wordmark and dashboard figures, not directory record names. Directory headings use the headline role above, reducing to 30px on small screens. Supporting introductions use 15px text, reducing to 14px on small screens.

Tables use the table role, with stronger ink record names and muted metadata. Column headings are uppercase (11px, weight 760, tracking 0.06em); filter labels use the label role. Tabular number features are enabled on the body. Preserve the actual CSS weights rather than importing the mobile type scale.

## Layout

Desktop retains a fixed 240px navigation rail and a content maximum of 1240px. At 1100px the rail narrows to 208px. At 980px navigation becomes a sticky top strip; at 680px it becomes a toggle-controlled vertical menu. Main horizontal padding becomes 24px at the intermediate breakpoint and 16px on small screens.

Each directory follows title and introduction → labelled filters → result count and page-size selector → table → pagination. Filters use three equal columns with an 18px gap; the main search spans two columns. At 680px they collapse to one column and the result header stacks.

Tables retain a 760px minimum width inside a horizontally scrollable region. Small screens show an explicit sideways-scroll hint and edge-to-edge table treatment; columns are not discarded or converted to cards. Pagination keeps Previous and Next on either side of a nonwrapping range label.

## Elevation & Depth

Directory surfaces are flat: warm page, white fields/table, and thin neutral borders. There are no directory card shadows. Focused fields use a pitch-green border and a three-pixel primary-soft ring; other keyboard targets receive a two-pixel focus outline with a three-pixel offset. Navigation links use a lime focus outline on the dark rail. The inherited club-detail dialog uses the existing modal shadow and backdrop; it is not a new directory elevation system. Animations and transitions are globally disabled.

## Shapes

Controls use the control radius, tables the surface radius, action buttons and navigation items the pill radius, and state badges the badge radius. Fields, action buttons, lookup matches, and table links have a minimum 44px height. Lookup results are full-width, left-aligned bordered buttons. Small-screen tables remove their outer corner rounding and side borders.

## Components

- **Navigation:** Dedicated Clubs, Teams, Players, and All accounts entries share the existing shell and active lime treatment. All accounts retains the `#/users` route.
- **Main search:** Clubs search name, slug, or city; Teams search name or league; people directories search name or email. Search changes debounce for 300ms and reset pagination. Refresh results explicitly reloads; Clear filters restores defaults.
- **State filters:** Clubs distinguish all, with teams, and no teams. Teams distinguish all, with active members, and no active members. Players and All accounts distinguish all, active, and deleted accounts. Only All accounts exposes the role selector.
- **Scope lookup:** Teams, Players, and All accounts expose club search; the people directories also expose team search. Lookup searches debounce for 300ms, show at most ten matches, and provide narrowing/no-match/error hints. Team lookup respects the selected club. Changing or clearing the club clears the team. Selected names and explicit clear actions remain visible.
- **Results:** Clubs show club, city, members, teams, creation date, and exploration links. Teams show team, club, active members, creation date, and player exploration. People tables show name/email, roles, clubs, teams, creation date, and textual account state. Club names open the existing detail dialog; cross-directory links carry scope in the hash query. Dates use the German locale.
- **Pagination:** Defaults to 25 rows; options are 25, 50, and 100. Previous/Next disable at boundaries and during requests. Counts and ranges reflect server results; an out-of-range page is corrected after loading. Filters and pagination persist in the route query, not a local account-data cache.
- **Feedback and access:** Loading, empty, and failure messages occupy the table body. Errors direct the user to Refresh results. Result counts and lookup matches announce updates politely; the table region is named, focusable, and marked busy while loading. Tables retain captions and scoped column headers.
- **Existing operations:** Club administrator claims remain below Clubs. Platform admin access remains in a collapsed disclosure below All accounts; it is separate from directory browsing.

## Do's and Don'ts

- **Do** preserve the inherited identity and shared directory renderer across all four views.
- **Do** retain visible labels, selected scope names, clear actions, textual state, and keyboard access to table overflow.
- **Do** distinguish global role/account browsing from scoped club/team exploration.
- **Don't** merge the four directories back into a mixed search list or place admin-account creation above browsing.
- **Don't** replace narrow-screen tables by silently dropping columns, or invent a mobile-app token mapping for this web implementation.
- **Don't** add new raster imagery or infer provenance for the inherited brand mark. This extension introduces no raster assets.
