# Anstoss Revamp: Implementation Brief

For Claude Code. Read `DESIGN.md` first for tokens, type and component rules. The interactive prototype sources are in `prototype/` (one `.dc.html` per screen; open any file to read exact layout, copy and states). Copy in the prototype is the target German copy.

## Ground rules

1. Change the presentation layer and role logic only. Keep existing data hooks, API calls, sockets, tests and route paths unless a section below says otherwise.
2. Build primitives first, then screens. No raw hex, font sizes or spacing in screens; everything comes from tokens (the existing codemods and `tokens.spec.ts` enforce this).
3. Every screen must work in light, dark, RTL (Arabic) and at 200% font scale.
4. Update the existing `__tests__` specs alongside each screen. Add specs for every new behaviour listed under acceptance.

## Screen map

| # | Prototype | Route / component | What changes |
|---|---|---|---|
| 01 | Main | `app/(auth)/welcome.tsx` | Club-color full bleed, pitch line drawing, language chip top-right, three actions: Verein beitreten (accent), Verein anlegen (outline), Anmelden (link). |
| 02 | Language | `app/language.tsx` | Seven languages with native name, English name and code. Live preview card in the chosen language. Whole screen switches direction on Arabic. Reachable from welcome and Mehr. |
| 03 | SignIn | `app/(auth)/sign-in.tsx` | Email OTP via Clerk as primary path, Apple and Google below. Code step with six boxes, resend timer, change email. Lands on the home for the user's combined roles. |
| 04 | Join | `app/(auth)/club-search.tsx` + `app/join/[...code].tsx` | Merge into one screen: invite code field with inline club match (crest, name, team, check), then search. If the team has an account-less roster entry matching the user, offer "Ich bin Kofi Osei, Nr. 9" to claim it (reuse `claim-pending.tsx` for the approval state). |
| 05 | Role | role/intent step in `sign-in.tsx` | Multi-select checklist (Spieler, Trainer, Elternteil, Vorstand). Selections are requests; Vorstand confirms. Continue routes to the combined home when more than one is picked. |
| 06 | ClubSetup | `app/club-setup.tsx` | Crest upload, name, optional DFB Vereinsnummer (drives the verified badge). Club colors: Hauptfarbe (six presets plus "Eigene" with hex input) and Zweitfarbe (four presets plus "Eigene"). Live crest, preview strip and continue button. Invalid hex shows an inline error. A primary below 4.5:1 against white is kept for surfaces and auto-darkened for text, with a note showing the derived value. Step 1 of 2. |
| 07 | Invite | `app/invite.tsx` | QR, team code, Teilen (accent), Link kopieren, "Kader selbst anlegen", fussball.de import. Step 2 of 2; Fertig goes to first-run home. |
| 07b | AddMembers | new `app/roster-build.tsx` (replaces `(auth)/roster-build`) | Admin or captain enters people directly. Einzeln: name, number, role chips (Spieler, Kapitän, Trainer, Elternteil), optional email or phone. Liste einfügen: one per line, optional leading number. List shows Du / Eingeladen / Ohne Konto. Optional; Fertig returns to Invite. Also reachable from Kader via Einladen. |
| 08 | Home | `src/components/home/CoachHome.tsx` | Crest + team switcher header, one hero (kickoff in display type, opponent, response bar and counts), "Vor dem Spiel" queue (remind non-responders inline, lineup, announce), one "Danach" line. Remove quick-action grid and week tiles. |
| 09 | Notifications | new `app/notifications.tsx` | Inbox grouped Heute / Diese Woche. Join requests approve inline (absorbs `pending-requests.tsx` entry point). Bell in home header opens it. |
| 10 | Calendar | `app/(tabs)/events/index.tsx` (coach mode) | Week strip, filter chips, grouped list with date block and "dabei" count. "+" opens create event. |
| 11 | CreateEvent | `app/create-event.tsx` | Type segmented control, opponent or title, date/time/place rows, weekly repeat switch, meet-time chips, notify switch, sticky save. |
| 12 | Event | `app/event-detail.tsx` | Club header with three stats (day, kickoff, meet), own answer segmented control, place row with route link, squad list with status, remind action, bottom bar Live + Aufstellung. |
| 13 | Lineup | `app/lineup-builder.tsx` | Dark screen, formation tabs (4-2-3-1, 4-4-2, 4-3-3, 3-5-2), pitch in club color, empty slots dashed, bench grid with drag. "Ans Team" posts a lineup card to team chat. |
| 14 | LiveMatch | `app/match-live.tsx` | Club header with crests and score, Tor / Gegentor / Karte / Wechsel, timeline, Abpfiff. |
| 15 | Chat | `app/(tabs)/chat/index.tsx`, `chat/[id].tsx` | Channel chips with unread counts, pinned notice, polls, lineup card message, read count. |
| 16 | Squad | `app/(tabs)/squad/index.tsx` | Search, filter chips (Alle, Fit, Verletzt, Probe), grouped by position, jersey number, status tag, last-4 attendance bars. Account-less entries show "ohne Konto" and no attendance until claimed. Einladen opens invite. |
| 17 | PlayerProfile | new `app/member/[id].tsx` (self: `me.tsx`) | Large jersey number, name, message, role toggles for this team (Spieler, Kapitän, Trainer, Teammanager, Kassenwart, Vorstand; editable by Vorstand only), season stats, last-8 attendance, dues, player pass. |
| 18 | More | `app/(tabs)/more/index.tsx` | Profile card listing all held roles, "Vorschau und Vertretung" card (Vorstand and Teammanager only), Team group (Beiträge, Tabelle, Wechselbörse, Team einladen), Verein und App group (Vereinsprofil, Sprache, Darstellung, Mitteilungen), Abmelden. |
| 19 | Fees | `app/admin-contribution-reconciliation.tsx` | Tracking only. Inverse summary card (received, open, progress, remind), Offen / Bezahlt / Alle, per-row "Bezahlt" or "Bestätigen" (for member self-reports), bank statement import (CSV/CAMT, existing `contribution-imports`). Visible to Vorstand, Kassenwart and Teammanager (own team). |
| 20 | LeagueTable | `app/league-table.tsx` (+ `team-spiele.tsx`) | Tabelle / Spielplan segments, own row in club color, form squares (S/U/N), fussball.de source line. |
| 21 | Wechselboerse | `app/wechselboerse/index.tsx` | Position chips, free-agent rows with inline Probetraining invite, "Gesuch veröffentlichen". |
| 22 | Player | `src/components/home/PlayerHome.tsx` | Hero with inline RSVP (white fill on club), confirmation line, "Grund angeben" after a decline, reply queue, season line, next dues row linking to MyDues. |
| 23 | PlayerCalendar | `app/(tabs)/events/index.tsx` (player and parent mode) | No "+". Inline Dabei / Vielleicht / Absage on every row. Header shows count of open answers. |
| 24 | DeclineSheet | new `src/components/rsvp/DeclineReasonSheet.tsx` | Opens after "Absage". Reason chips, optional note, visible to coach only. |
| 25 | Parent | `src/components/home/ParentHome.tsx` | Child switcher chips, hero answers per child, carpool offer (away games), photo consent (`child-consent.tsx`), youth dues. |
| 26 | MyDues | `app/my-contributions.tsx` | Amount due, GiroCode (EPC QR) generated on device from the club's IBAN, recipient, IBAN and reference with copy, "Ich habe überwiesen" (existing `markOwnAsPaid`, status Gemeldet until confirmed), paid history. |
| 27 | HomeEmpty | CoachHome zero state | Setup checklist: club created, invite team, first event, connect fussball.de. Progress bar. |
| 28 | HomeLoading | `HomeSkeleton.tsx` | Skeleton matching the real layout. |
| 29 | ErrorState | `ErrorState.tsx` + new `OfflineBanner` | Error card with retry; offline banner; queued answers shown as "Wartet". |
| 30 | HomeDark | `darkTheme` | Reference for dark tokens. |
| 31 | HomeCombined | `src/components/home/` new `CombinedHome.tsx` (or extend resolver) | One home for a person with several roles: player hero with own answer plus team bar, "Als Trainer und Kapitän" queue, "Als Vorstand" queue. See roles. |
| 32 | RoleSwitch | new `src/components/roles/PreviewCoverSheet.tsx` | Vorschau (read-only player or parent view) and Vertretung (time-boxed cover). See roles. |
| 33 | ActingAs | new `src/components/roles/ActingAsBanner.tsx` in `(tabs)/_layout.tsx` | See role switching. |

## Navigation

- Tabs are the union of what a person's roles need. Anyone with Trainer, Teammanager or Vorstand: Start, Termine, Chat, Kader, Mehr. Player only or parent only: Start, Termine, Chat, Mehr.
- Kader management and Beiträge administration are never reachable for player-only or parent-only users, by tab or deep link; extend `tabs-role-access.spec.tsx`.
- **New club path:** Welcome, ClubSetup, Invite, HomeEmpty. AddMembers is optional, one tap from Invite and from Kader.
- **Joining path:** Welcome, Join, Role (multi-select), matching home.
- **Returning user:** Welcome, SignIn, home for their combined roles.

## Roles: hats, not modes

One person can be player, captain, coach and Vorstand at the same time. All held roles are active at once. Nobody switches between their own roles.

### Model

- Club level stays in `Membership.role` (OWNER, ADMIN for Vorstand) and `Membership.operationalRoles` (TREASURER as Kassenwart).
- Team level uses several `TeamAccess` rows per person (the unique key `teamId, userId, role` already allows this). Add `CAPTAIN` and `TEAM_MANAGER` to `TeamRole`. Migrate existing club-level `ClubOperationalRole.CAPTAIN` and `TEAM_COORDINATOR` assignments into these per-team roles, then retire those two values.
- Permissions are the union of all held roles, resolved per team on the server.

### Capabilities (additive)

| Role | Adds |
|---|---|
| Spieler | Answer events, team chat, own profile and dues |
| Kapitän | See who answered, remind teammates, pin and announce in the team channel, add players and invite a coach to the team (Vorstand can review) |
| Trainer (head or assistant) | Create and edit events, lineup, live match, Kader, invite |
| Teammanager | Team settings, team colors, add and remove members, team dues status, preview and cover within own team |
| Kassenwart | Club dues tracking, statement import, confirm payments |
| Vorstand | Club settings, members, assign roles, all teams, preview and cover in any team |

### UI rules

- `resolveRoleMode` becomes a capability resolver. The home composes sections from held capabilities: player hero first when the person plays, then "Als Trainer und Kapitän", then "Als Vorstand". Single-role users get the focused homes (Home, Player, Parent).
- The profile line under the name lists all held roles.
- Captain shows as "Kapitän" next to the position in Kader and profile.
- Role assignment happens on the member profile and is editable by Vorstand only. Join requests can ask for several roles; Vorstand confirms each.

### Vorschau und Vertretung (Vorstand and Teammanager only)

- **Vorschau:** read-only view of the app as a player or parent of a chosen team. No writes possible. Used to check what members see.
- **Vertretung:** time-boxed cover for a role the person does not hold, for example Trainer of the A-Jugend while its coach is away.
  - Scope: Vorstand in any team, Teammanager only in own team. Never as Vorstand, never as a named person.
  - Duration 15, 30 or 60 minutes. Ends early through "Beenden" in the banner or automatically at expiry.
  - API: `POST /clubs/:clubId/acting-sessions` `{ teamId, role, durationMin }` returns `{ id, expiresAt }`; `DELETE /acting-sessions/:id`. The guard resolves permissions for that role and team while the session is valid.
  - Audit: writes store `actorUserId` and `actingSessionId`; attribution reads "Yemi (Vorstand) als Trainer". The team's head coach is notified when a session starts.
  - `ActingAsBanner` on every screen during the session.

## Setting up a team for others

Default is self-join with the team code. As an option, one person (Vorstand, Teammanager or Kapitän) can enter the coach and players before anyone else installs the app.

- Who: Vorstand, Teammanager and Kapitän can add members. Only Vorstand assigns Vorstand, Kassenwart and Teammanager.
- Account-less entries: `TeamMember.userId` is required today. Make it nullable and add `displayName` and `invitedContact` (email or phone, optional), or add a `RosterPlaceholder` model linked to `TeamAccess`. Placeholders appear in Kader, lineups and events (answers can be set by staff on their behalf, marked as such).
- Claiming: when someone joins with the team code, match placeholders by name (and contact if given) and offer "Ich bin ...". A claim merges the placeholder into the new user, keeping number, position, roles and history. Staff approve claims that do not match a provided contact.
- Invites: entries with a contact get an invite link by email or SMS with the role pre-assigned.
- A placeholder is personal data entered by someone else: show who added it, and delete unclaimed placeholders on request or after the club's retention period.

## Club and team colors

- `Club.primaryColor` and `Team.primaryColor` already exist. Add `secondaryColor` to both.
- Club setup sets the club pair. A team inherits it unless a Teammanager or Vorstand sets its own pair (for example a youth team in a different kit), from team settings.
- Validation: hex `#RRGGBB`. Keep the chosen primary for surfaces; derive a text-safe variant by darkening in 10% steps until 4.5:1 against white, store it as `primaryTextColor`, and use it wherever the club color carries text or icons on light backgrounds.
- The secondary color is used for the crest ring, the hero accent strip and kit-related UI only. Lime stays the app's action accent regardless of club colors.

## Dues: track, never collect

Anstoss does not move members' money. Members pay the club directly; Anstoss shows status.

- Remove any dues checkout path (Stripe or otherwise) from mobile and API. Stripe stays only for clubs paying for Anstoss (`billing`).
- Member side: GiroCode (EPC QR, version 002, SCT) generated on device from club name, IBAN, amount and reference `Beitrag MM/YYYY Vorname Nachname`. Copy buttons for IBAN and reference. "Ich habe überwiesen" calls existing `markOwnAsPaid` and sets status Gemeldet.
- Club side: statuses Offen, Gemeldet, Überfällig, Bezahlt. Kassenwart confirms Gemeldet, marks cash payments, or matches via bank statement import (existing `contribution-imports`, CSV and CAMT). Reminders through the existing `contributions-reminder.worker`.
- Copy on both sides states that Anstoss does not collect money.
- Dues data is personal financial data: keep the existing retention worker and restrict visibility to Kassenwart, Vorstand and the member (Teammanager sees own team only).

## Languages and RTL

- Supported: de, en, tr, es, fr, pt, ar, in that order in `APP_LANGUAGES`. Add `src/i18n/es.ts` and `src/i18n/ar.ts` from `en.ts` keys, plus `states.es.ts` and `states.ar.ts`.
- The repo also ships `it`. Decide whether to keep it before release; the language screen design has room for an eighth row.
- Native-speaker review required for tr, es, fr, pt and ar strings before release.
- RTL: call `I18nManager.allowRTL(true)`. When the user picks or leaves Arabic, call `I18nManager.forceRTL(...)` and reload with `Updates.reloadAsync()`, with a confirmation sheet explaining the restart.
- Replace left/right styles with start/end (`marginStart`, `paddingEnd`, `textAlign: 'auto'`). Mirror back, chevron, send and swap icons with `transform: [{ scaleX: -1 }]` when `I18nManager.isRTL`. Keep numbers, times and scores LTR.
- Arabic font: IBM Plex Sans Arabic for all text; display style drops uppercase and uses 700 weight.
- Locale formatting through `Intl` for dates, times and currency (`25 €` in de, `€25` in en).

## Plans and pricing

Two plans, priced per club. They map onto the existing `PlanTier` and `PLAN_LIMITS` in `apps/api/src/billing/club-entitlements.service.ts`.

| | Kostenlos (`FREE`) | Verein (`PRO`) |
|---|---|---|
| Price | 0 €, forever | 10,99 € per month or 109,90 € per year, incl. VAT |
| Limits | 1 team, 30 players (unchanged) | 5 teams, 150 players (unchanged) |
| Included | Events and answers, team chat, squad, lineup, parents and consents | Everything in Kostenlos, plus club colors and crest, live ticker and lineup sharing, automatic reminders, fixture and table import, dues tracking with GiroCode, chat translation, Vorschau und Vertretung |

- Trial: 30 days of Verein, no card. At the end, the club drops to Kostenlos; existing data stays, gated features become read-only.
- Child consent and safety features are never gated.
- More than 5 teams: contact sales (kontakt@anstoss.io) for now.
- Free clubs show the Anstoss default colors; club colors unlock with Verein.
- Gate features through `ClubEntitlementsService` feature flags, not scattered tier checks. Show an inline upgrade prompt that links to the Abo screen when a free club touches a paid feature.
- Billing uses the existing Stripe integration for the club subscription only. Before shipping in-app purchase buttons, confirm App Store and Google Play rules for selling subscriptions inside the app. The safe default is to sell on the website and show plan status in the app.
- In-app: new `Abo` screen (`prototype/Plan.dc.html`) from Mehr, showing current plan, usage against limits, monthly/yearly toggle and the trial call to action. Only Vorstand and Kassenwart can start or change a plan.

## Website (apps/web)

The marketing site moves to the Flutlicht style and seven languages. Reference: `prototype/WebDesktop.dc.html` and `prototype/WebMobile.dc.html`. All copy is in `website-copy.json`, keyed by language.

- Keep the site static (`apps/web/src`), no framework. Rebuild `index.html` and `styles.css`; restyle `signup.html`, `join.html`, `legal.html` and `account-deletion.html` with the same tokens. Leave `.well-known/` untouched.
- Sections in order: hero with nav, language select and two phone mockups; trust strip; roles with tabs (Trainer, Spieler, Eltern, Vorstand) swapping the phone mockup; club colors with a live swatch picker; four-step matchday flow; dues panel (tracking only, GiroCode card); pricing with monthly/yearly toggle (replaces the redirecting `pricing.html`; keep the URL and anchor to `#pricing`); languages with chat translation demo; FAQ accordion; closing call to action; footer with Impressum, Datenschutz, Konto löschen.
- Phone mockups are HTML and CSS, not screenshots, so they localise and recolor. Swap to real screenshots only if they exist for every language.
- Localisation: extend `i18n.js` from de/en to de, en, tr, es, fr, pt, ar using `website-copy.json`. Keep the existing order (URL `?lang=`, saved choice, browser language, fallback de). Set `<html lang>` and `dir` on switch; Arabic is `rtl`. Use logical CSS properties (`inset-inline-start`, `margin-inline-end`, `text-align: start`). Add `hreflang` alternates and translated `<title>`, description and Open Graph tags.
- Fonts: Inter, Barlow Condensed, IBM Plex Sans Arabic, self-hosted (no Google Fonts request, for GDPR).
- Store buttons: replace the text buttons with the official App Store and Google Play badges, localised, following each store's badge guidelines, linking to the live listings.
- Legal pages: the German text remains the binding version. Translate navigation and headings, and state that the German version prevails.
- Performance: no layout shift from fonts or mockups, images in WebP, Lighthouse 90+ on mobile.
- Translations need native-speaker review before launch, Arabic and Turkish first.

## Implementation phases

1. **Foundation:** tokens (light, dark), fonts, primitives (Button pill sizes, GroupedList, ListRow, Chip, SegmentedControl RSVP variant, Crest, Hero, BottomSheet, TabBar with 4 and 5 tab variants, Skeleton, OfflineBanner).
2. **Roles, roster, colors, dues and navigation:** nullable roster entries and claiming, club and team color pairs, `CAPTAIN` and `TEAM_MANAGER` team roles with migration, capability resolver, combined home, tab sets by capability, Vorschau, cover sessions API, ActingAsBanner, audit attribution, removal of any dues checkout.
3. **Coach core:** Home, Calendar, CreateEvent, Event, Lineup, LiveMatch, Notifications.
4. **Player and parent:** PlayerHome, PlayerCalendar, DeclineReasonSheet, ParentHome with child switch and carpool.
5. **Team and club:** Chat, Squad, PlayerProfile, More, Fees, LeagueTable, Wechselbörse.
6. **Onboarding:** Welcome, Language, SignIn, Join, Role, ClubSetup, Invite, HomeEmpty.
7. **Languages:** es and ar files, RTL pass on every screen.
8. **Website:** rebuild `apps/web` as specified above.
9. **Polish:** empty, loading, error and offline states on every list screen; dark mode pass; accessibility and contrast pass (`scripts/check-contrast.ts`).

## Acceptance criteria

- No raw colors, sizes or font families in screen files; token tests pass.
- One lime element per screen at most (add a lint or review checklist item).
- RSVP control never shows green, amber and red together.
- A user holding several roles gets every capability at once with no switching; the combined home shows each role's section.
- Player-only and parent-only users cannot reach Kader management or Beiträge administration by tab or deep link.
- Only OWNER, ADMIN and TEAM_MANAGER see Vorschau und Vertretung; Vorschau cannot write; the API rejects cover sessions for anyone else and for out-of-scope teams; sessions expire server-side and writes are attributed.
- Vorstand, Teammanager or Kapitän can build a full roster without anyone else having an account; a joining player can claim their entry and keeps their history.
- Custom club colors accept valid hex only, and any club color used behind or as text meets 4.5:1.
- No code path in the app or API initiates a dues payment. GiroCode payloads validate against the EPC069-12 format.
- Every screen renders correctly in Arabic RTL, dark mode and at 200% font scale.
- Answers given offline are queued and sent on reconnect, with visible "Wartet" state.
- `npm run validate` passes.
