# Anstoss Onboarding & Core-Surface Revamp — Design Spec

**Date:** 2026-04-25
**Scope:** apps/mobile (Expo RN) — welcome, auth, role pick, club create/join, home, events, match detail, more tab
**Out of scope:** Backend schema migrations beyond the minimum needed (called out per surface), chat tab redesign, push notification template changes
**Feature flag:** `anstoss.newOnboarding` — gates the entire new flow so the existing screens stay alive until we cut over per-club or globally
**Inspiration:** Pre-Match (German amateur football app) — UX rhythm only. Visual language stays Anstoss: neutral palette + club-adaptive primary, DM Sans + Geist Mono per `DESIGN.md`. Light + dark parity throughout.

---

## 1. Goals

1. Replace the current welcome → sign-in → role pick → onboarding-wizard chain with a single coherent flow that an amateur football club admin can hand to a 14-year-old or a 60-year-old without explanation.
2. Remove the per-player email-invite bottleneck. Many youth/amateur players have no email and admins cannot manage hundreds of invites by hand.
3. Unify the duplicate role-pick logic that currently lives in both `app/(auth)/sign-in.tsx` (INTENT_OPTIONS) and `app/register/index.tsx` (ROLE_CARDS, hardcoded English).
4. Establish a post-onboarding home that surfaces what the user owes the team (RSVP, approvals, kid's RSVP) before pretty match crests.
5. Restyle events and match-detail to match the new design language without rebuilding their data plumbing — both already consume the existing fussball.de integration.
6. Reach light/dark parity on every new screen.

## 2. Constraints (locked)

- **Countries:** Germany and Austria only.
- **Auth:** Phone OTP for every role. Email becomes a "linked address" later in profile settings, not a primary credential.
- **GDPR Article 8:** Under-16s cannot create their own account. They are added by a parent as a sub-profile.
- **Data source for fixtures, league tables, opponent crests:** fussball.de (DE) and ÖFB (AT). Already wired through `/integrations/fussball/team-links` and `/teams/:id/fixtures`. No scraping of competitors.
- **Design tokens:** `apps/mobile/src/theme/` — neutral surface defined by club colors, club-adaptive `primary`. DM Sans display, Geist Mono for data/numbers. Splash screen (green football on `#FAFAF8`) stays.
- **Locales:** Start with `de` and `en`. Other existing locales (`fr`, `it`, `pt`) inherit fallbacks, not part of this revamp.
- **PR strategy:** One PR behind `anstoss.newOnboarding`. Existing flow stays alive. Flag flips per club or globally.
- **Branch hygiene:** Never push to `feat/revamp-release` until the build runs in the iOS simulator and the human confirms — `feat/revamp-release` auto-deploys to TestFlight via EAS, and the team is on a free build quota.

---

## 3. Architecture

### 3.1 Flow shape

Every role shares the same head:

```
Welcome → Phone (DE/AT) → 6-digit SMS code → First name → Birthday → Role pick
```

After role pick, the path branches:

| Role | Branch |
|---|---|
| I'm starting a club | Club basics (one form) → Build first roster → Get team code → Owner home |
| I coach a team | Enter team code → Confirm club + team → Claim "Coach" slot → Coach home |
| I play | Enter team code → Confirm club + team → Pick name on roster → Player home |
| My child plays | Enter team code → Confirm club + team → Pick child(ren) (loop) → Parent home |
| Looking for a club | Position → Preferred league level → City + radius → Optional bio → Free-agent home |

The "tour" lives **after** the role-specific home is reached, as dismissible cards on the home screen — not as a wizard step. This replaces the current `/onboarding.tsx` forced-screen-takeover.

### 3.2 Component decomposition

New screens (under feature flag):

- `app/(auth)/welcome.tsx` — full-bleed photo hero (goal post + net + ball, Ken Burns slow zoom), single primary CTA "Get started", secondary "I already have an account"
- `app/(auth)/phone.tsx` — DE/AT phone input
- `app/(auth)/code.tsx` — 6-cell OTP input
- `app/(auth)/name.tsx` — first name only
- `app/(auth)/dob.tsx` — date of birth (gates under-16 → parent-managed branch)
- `app/(auth)/role.tsx` — 5-card picker (canonical replacement for the current dual locations)
- `app/(auth)/club-create.tsx` — owner branch, single form with live preview (badge auto-derives from name initials, color swatches inline, first-team field on the same screen)
- `app/(auth)/team-code.tsx` — coach/player/parent branch, 5-cell code input
- `app/(auth)/roster-claim.tsx` — pick your name (player) / claim coach slot (coach) / pick child(ren) (parent)
- `app/(auth)/free-agent-profile.tsx` — position, league level, city + radius, optional bio
- `app/(auth)/done.tsx` — single confirmation screen routing to the role-aware home

New shared primitives:

- `WizardStep` — full-screen step shell: back chevron + progress bar + question + hint + body + sticky CTA
- `OtpCellInput` — 6-cell phone code input
- `TeamCodeInput` — 5-cell team code input
- `RoleCard` — used on `role.tsx`
- `RosterRow` — used on `roster-claim.tsx`
- `KenBurnsImage` — slow zoom + crossfade for the welcome hero
- `ActionCard` — the "what you owe the team" card on home; club-primary background, white CTAs, compact body

Reused / restyled:

- `app/(tabs)/index.tsx` — keeps role dispatcher, but the inner Home components (AdminHome, CoachHome, PlayerHome, ParentHome, FreeAgentHome) are rewritten to the new structure
- `app/(tabs)/events.tsx` — restyled to upcoming/past toggle + flat list (matches + training + socials), each row tapping into match-detail or training-detail
- `app/match-detail.tsx` — restyled with crest hero + 4-tab strip (Info · News · Table · Facts). Data plumbing unchanged.
- `app/(tabs)/more.tsx` — restyled to editorial rows (no card surfaces, hairline dividers, title + tiny sub) with sections Account · Club · App

Removed (after flag flip is permanent):

- `app/onboarding.tsx` — forced post-signup wizard, replaced by dismissible home cards
- `app/register/index.tsx` and `app/register/*` — duplicate role-pick + sub-flows now consolidated into `app/(auth)/`

### 3.3 Data flow

Auth (Clerk → phone provider): phone OTP needs a Clerk path or a phone-first replacement. **Decision:** Use Clerk's phone code path if available on the current plan; otherwise a separate auth-provider decision is captured as a sub-task. The screens above are auth-provider-agnostic; `useAuth()` exposes the same surface.

Roster + team-code: new backend fields (called out below) are required. The mobile screens consume them via existing `api()` helper.

Match data: unchanged. `app/match-detail.tsx` continues to call `api<ImportedFixture[]>(\`/teams/${teamId}/fixtures?scope=all&limit=50\`)`.

Home action card data: per-role queries.
- Player: next-fixture RSVP status (`/teams/:id/fixtures/:id/rsvp`)
- Owner/Admin: pending join requests (new endpoint, see §6)
- Parent: kid's next-fixture RSVP status, scoped to managed sub-profiles
- Coach: roster gaps + RSVP rollup
- Free-agent: nearest matching club (free-agent matching service, post-MVP — empty state for now)

### 3.4 Backend deltas (minimum required)

1. **`Team.joinCode`** — short alphanumeric, unique, regenerable. Replaces per-player invites for join.
2. **`RosterSlot`** — `{ teamId, name, dob, position, claimedByUserId? }`. Admin pre-populates the team roster; players claim their slot via `roster-claim.tsx`.
3. **`JoinRequest`** — `{ teamId, userId, slotId?, status }`. Owner/Admin reviews via the home action card.
4. **Phone-OTP path in Clerk** (or replacement) — separate ticket if Clerk's plan blocks this.
5. **Parent-managed sub-profile model** — `User.managedBy`, where the parent's account owns the under-16 profile.
6. **`ContributionScheme`** — `{ teamId or clubId, amountCents, cadence, currency, startsAt }` (see §4.10)
7. **`MemberMandate`** — `{ userId, schemeId, sepaMandateId, status }` (see §4.10)
8. **`Contribution`** — `{ memberMandateId, periodStart, periodEnd, amountCents, status, stripePaymentIntentId? }` (see §4.10)

These are referenced again in the implementation plan; the design above assumes they exist.

---

## 4. Surface-by-surface design

### 4.1 Welcome — `app/(auth)/welcome.tsx`

Full-bleed photo: realistic goal-post + net + ball, in Anstoss neutrals (no electric Pre-Match yellow). Slow Ken Burns zoom + crossfade between two stills, looping. Logo top-center. Two CTAs: primary "Get started", secondary "I already have an account". No copy beyond a one-line tagline above the CTA.

### 4.2 Wizard rhythm — every step from phone through role pick

Full-screen step shape: back chevron + thin progress bar at top, large question (DM Sans, ~22px, weight 800), one-line hint, one input or one set of role cards, sticky black CTA pinned to the safe-area bottom. One concept per screen. Locale-aware. Light + dark.

### 4.3 Role pick — `app/(auth)/role.tsx`

Five cards in a vertical stack:

1. ⚽ I play
2. 📋 I coach
3. ⭐ I'm starting a club  *(maps to OWNER on the resulting membership)*
4. ❤ My child plays
5. 🔍 Looking for a club

Each card: icon + title + one-line body. Active state = filled icon background + 2px inset shadow ring. The 5-card taxonomy matches `RegistrationRole` so no enum migration is needed.

### 4.4 Owner branch — `app/(auth)/club-create.tsx`

One screen, one form, live preview:
- Badge circle at top — auto-derives from name initials, updates as the user types
- Color swatch row inline (5 default colors; customizable post-onboarding)
- Name field (e.g., "FC Köpenick 1908")
- City field (DE/AT autocomplete)
- First team field (e.g., "U17 Männlich") — required so the roster-build flow has somewhere to land
- CTA: "Create [club name]"

After submit: navigate to roster-build (build first team's roster: names + DOBs + positions). Then "Get team code to share" screen with copyable code + QR. Then owner home.

### 4.5 Coach / Player / Parent branch

All three start with `team-code.tsx` (5 alphanumeric cells). On valid code, show a confirmation card "Join FC Köpenick 1908 · U17 Männlich?" → confirm → go to `roster-claim.tsx`:

- **Player:** roster list of unclaimed slots, picks own name, taps "Claim [name]"
- **Coach:** picks the unfilled "Coach" / "Assistant Coach" slot
- **Parent:** picks one or more children, with a "Add another child" loop tile

If the player is under 16 and tries to self-register: hard stop screen pointing them to "Ask a parent to add you" with a copyable hand-off code.

### 4.6 Free-agent branch — `app/(auth)/free-agent-profile.tsx`

Four micro-steps: position → preferred league level → city + radius → optional short bio. Lands on free-agent home (which is mostly empty state in v1 — matching service is post-MVP).

### 4.7 Home — `app/(tabs)/index.tsx` and role-specific Home components

Role-aware. Top: greeting row (small crest + "Hi, [first name]" + subtitle "Club · Team · Position/Role").

**Action card** (top of fold, club-primary background):
- Player: "Are you in for Saturday?" → In / Can't, with confirmed count subtitle
- Coach: "RSVP rollup: 12/18 confirmed" → tap to open team-events
- Owner/Admin: "N join requests waiting" → tap to review queue
- Parent: "[Kid's name] needs RSVP for Saturday" → answer on kid's behalf
- Free-agent: empty state with "Update profile" CTA

**Below the action card, role-conditional surfaces:**
- Match context card (subdued — fixture row with both crests + kickoff + venue, taps into match-detail)
- 3-tile quick row (League Table · Roster · Invite for Owner/Admin/Coach; Calendar · Roster · Profile for Player/Parent)
- Newsfeed snippet (last 1–2 club news rows)

When there is no pending action, the action card collapses into the match hero from option A — i.e. "Mix" behavior. Implementation: render `<NextActionCard />`; if it returns null, render `<MatchHeroCard />` instead.

### 4.8 Events — `app/(tabs)/events.tsx`

Header: "Events · [team name]". Toggle: Upcoming / Past. Flat list of rows: date column (day + month abbr) · title · subtitle (league / venue / kickoff or training / location) · RSVP pill (IN green · OUT red · ? gray). Match rows tap into match-detail. Training and social rows tap into a lightweight detail sheet (same pattern, different data).

### 4.9 Match detail — `app/match-detail.tsx`

Top bar: back chevron + meta breadcrumb ("Bezirksliga · Apr 27") + share icon.
Crest hero: club-primary background, both crests, score (post-match) or "vs" (pre-match), kickoff time + venue.
Tab strip: **Info · News · Table · Facts**.
- Info: kickoff details, referee, address, "Open in fussball.de" CTA
- News: club news tagged to this fixture (own DB)
- Table: 3–5-row league snippet centered on us, from fussball.de
- Facts: head-to-head, last meeting, league position delta — from fussball.de when available, hidden tab when not.

Light + dark parity. All data lives behind the existing fussball.de plumbing.

### 4.10 Contributions / Mitgliedsbeiträge

Amateur clubs in DE/AT live on monthly or annual member dues, almost always collected via SEPA direct debit. The revamp adds a first-class contributions surface for both members and admins, sitting on top of the existing Stripe Connect + SEPA plumbing called out in `CLAUDE.md` (Sprint 2 payments).

**Member-facing:**

- `app/(tabs)/more.tsx` → new "Contributions" row under the **Account** section: title "Contributions", sub "[€X / month · next charge May 1]" or "Setup needed" if no mandate yet
- `app/contributions/index.tsx` (new) — editorial-style screen: top card shows current balance (paid up / amount due / next charge date), then sectioned history (date · description · amount · status pill PAID/PENDING/FAILED), then payment-method row ("SEPA · DE89 ··· 4923 — change") with a "Download invoice" affordance per row
- Light + dark parity, same DM Sans + hairline rule treatment as the More tab

**Onboarding moment:**

- Right after `roster-claim.tsx` succeeds (player/parent branch), if the team has a contribution scheme attached, surface a single screen `app/(auth)/sepa-mandate.tsx` with: amount + cadence summary, IBAN field, name-on-account field, mandate consent checkbox (German legal text), CTA "Authorise SEPA mandate". Fully skippable with "I'll set this up later" → routes to home with a persistent banner until completed
- Owner branch (`club-create.tsx`): no SEPA step here. Owners configure contribution schemes in admin settings post-onboarding (out of scope for v1 onboarding revamp; row exists but launches into the existing admin settings flow)
- Coach branch and free-agent branch: no contribution step
- Under-16: parent's payment method covers the kid's contributions; no separate flow

**Admin-facing (in scope only as a navigation row, not redesigned in this spec):**

- `app/(tabs)/more.tsx` → new "Contribution schemes" row under the **Club** section, visible only to OWNER/ADMIN; routes to existing admin settings (Sprint 2 work)
- Home action card variant: "X members past due" → tap to existing dunning queue. Shows only when there are past-due members.

**Backend deltas added by this section:**

6. **`ContributionScheme`** — `{ teamId or clubId, amountCents, cadence: MONTHLY|ANNUAL, currency, startsAt }`
7. **`MemberMandate`** — `{ userId, schemeId, sepaMandateId, status: PENDING|ACTIVE|REVOKED|FAILED }`
8. **`Contribution`** — `{ memberMandateId, periodStart, periodEnd, amountCents, status: PAID|PENDING|FAILED|REFUNDED, stripePaymentIntentId? }`

These piggyback on the existing Stripe Connect setup. The mobile screens consume them via `api()`; no new infra.

**Light/dark parity:** The same neutral surface + club-primary accent pattern. Status pills use semantic colors (PAID green, PENDING gray, FAILED red) at low chroma so they sit in both themes.

**Open item deferred:** Admin-side scheme creation UI (the actual form for "set the team's monthly dues") stays in the existing admin web/settings tooling for v1 of this revamp. The mobile-side admin redesign is a follow-up ticket.

### 4.11 More tab — `app/(tabs)/more.tsx`

Avatar + name + subtitle (club · team · role) at top. Three editorial sections, each preceded by a small uppercase header (`Account` · `Club` · `App`). Inside each section, rows are flat: title (15px, weight 700) + tiny sub (11px, opacity 0.6) + chevron. Hairline dividers only — no card surfaces. Light + dark parity.

- Account: Profile · Phone & login · Notifications · **Contributions**
- Club: [Club name] · Switch club · **Contribution schemes** *(OWNER/ADMIN only)*
- App: Language · Appearance · Sign out

---

## 5. Error handling

- **Phone OTP failures:** rate-limit-aware retry with cooldown timer; "Resend code" disabled until 30s elapses.
- **Invalid team code:** inline error under the cells, no screen change.
- **Roster claim race (two users tap the same slot):** server is authoritative; loser sees "Already claimed by [name]" toast + roster refresh.
- **Under-16 self-registration:** hard stop, no error tone — friendly handoff to parent flow.
- **fussball.de fetch failure on home/events/match-detail:** stale-while-revalidate; show last cached state with a small "couldn't refresh" banner; never block the screen.
- **Network offline during onboarding:** queue the step locally where safe; for OTP/code-entry, block with "You're offline" sheet.

## 6. Testing

- **Mobile (Jest + RN Testing Library):** snapshot tests for each new screen in light + dark; interaction tests for OTP entry, code entry, role-card selection, roster-claim race; navigation tests covering each role branch end-to-end.
- **API (Jest):** new endpoints — `POST /teams/:id/join-code` (regenerate), `GET /teams/by-code/:code`, `POST /teams/:id/roster-slots/:slotId/claim`, `GET /clubs/:id/join-requests`, `POST /join-requests/:id/{accept|reject}`. Tenant-scoping middleware coverage required.
- **Manual:** every screen tested in iOS simulator (iPhone 13 mini and 15 Pro Max sizes) before any push to `feat/revamp-release`.

## 7. Rollout

1. Build behind `anstoss.newOnboarding` in a single PR.
2. Land in `Ui-fixes` first; cherry-pick safe commits.
3. Smoke-test in simulator + on TestFlight via a separate non-release branch.
4. Flag-on per club (start with internal test club), then per-cohort, then global.
5. Once stable, delete the legacy `app/onboarding.tsx`, `app/register/*`, and the INTENT_OPTIONS block in `app/(auth)/sign-in.tsx`.

## 8. Open items deferred from this spec

- Phone-OTP provider decision (Clerk path vs replacement) — separate ticket, blocks implementation but not the design.
- Free-agent matching service — post-MVP, screens in v1 only collect the profile.
- Austria fussball.de equivalent (ÖFB) — `ExternalTeamLink.provider` already supports an enum slot; concrete adapter is a separate ticket.

---
