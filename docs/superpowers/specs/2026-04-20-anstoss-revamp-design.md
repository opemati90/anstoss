# Anstoss End-to-End Revamp — Design Spec

**Date:** 2026-04-20
**Branch context:** `feat/renuir-design-revamp` (21 commits landed, 5 files uncommitted)
**Design doctrine baseline:** Renuir-derived editorial, adopted 2026-04-17 (see `DESIGN.md`)
**Scope classification:** Depth 2, full stack (mobile + API), Approach 3 (foundation → known-debt → horizontal sweep)

---

## 1. Scope & Non-Goals

### In scope

- Mobile app (`apps/mobile`): all ~40 screens across auth, tabs, admin, events, DMs, club setup, onboarding, roster, team management, parent, and free-agent flows.
- API (`apps/api`): role-model audit and gap fixes, role-aware onboarding and join endpoints, free-agent profile endpoint completeness, invite-role propagation.
- Shared (`packages/shared`): role enums aligned with Prisma, new Zod schemas for onboarding/invite/profile payloads.
- Cross-cutting: empty/error/loading states system, dark-mode parity, accessibility pass (WCAG AA), motion compliance per `DESIGN.md`.

### Non-goals (explicitly out)

- New aesthetic direction. The Renuir doctrine (DESIGN.md, 2026-04-17) stays.
- Splash screen. Kept as-is per user feedback memory (green football on `#FAFAF8`).
- Multi-team architecture (Sprint 2 territory). Teams stay single-level; the role model will be forward-compatible but the team switcher is not shipped here.
- Payments / Stripe Connect. Existing flow stays intact; polish only, no restructure.
- New localization beyond the existing `i18n/` state.
- Web / admin portal. None exists; not adding one.
- E2E test expansion. Unit/integration tests for new backend code, yes; no new Detox/Maestro flows.

### Success criteria

- Zero hardcoded hex/px values in component files outside `theme/` (lint-enforced).
- Every screen has loading, empty, and error states consumed from the shared state component system.
- Every registration path (`CLUB_ADMIN`, `COACH`, `PLAYER`, `PARENT`, `FREE_AGENT`) can sign up, complete onboarding, and land on a role-appropriate home without manual DB intervention, in both light and dark mode, with VoiceOver and at 200% font scale. (`CLUB_ADMIN` becomes `OWNER` at the `MembershipRole` level post club-create.)
- WCAG AA contrast on all text in both themes.
- Branch cleanly merges to `main`; 60%+ mobile coverage, 80%+ API coverage held.
- TestFlight and Android internal-track builds uploaded and smoke-tested.

---

## 2. Phase 1 — Audit

One artifact, prioritized punch list, drives every subsequent phase. No fixes in this phase.

### Method

Walk every screen in the running app (Expo simulator or web where functional), capture a screenshot, score each against a fixed rubric. The rubric is written into the audit doc so it is reproducible.

| Axis | What's measured |
|---|---|
| Tokens | Any hardcoded hex/px/fontSize? Any raw `#RRGGBB`? |
| Typography | Does every text use a `TextStyles` variant? Any weight/size picked outside the scale? |
| Spacing | Is padding/margin on the scale? Any magic numbers? |
| Hierarchy | Can a first-time user tell what the primary action is within 2 seconds? |
| States | Loading, empty, error all present and styled? |
| Dark mode | Renders correctly via `useColors()`? No light-mode leakage? |
| A11y | Touch targets ≥44×44, icon-only buttons have `accessibilityLabel`, contrast AA? |
| Copy | Sentence case, no jargon, no lorem, error messages actionable? |
| Motion | Primary CTAs have haptic + scale pulse? No scroll-driven animation? |
| Density | Screen breathes (SCREEN_PADDING=24 respected), or cramped? |

### Output

- `docs/revamp/audit.md` — one table row per screen, columns for each rubric axis scored `PASS` / `FAIL` / `N/A`, plus a `notes` column with specific `file:line` callouts.
- `docs/revamp/screenshots/` — one image per screen, committed for diffability.
- Deduplicated issue list at the bottom of `audit.md`, prioritized P0 (blocks a flow) / P1 (visual inconsistency) / P2 (polish).

### Scope discipline

Audit stops at observation. No refactoring during audit. Every finding becomes a punch-list entry; fixes land in Phase 3 or Phase 4.

### Rough size

~40 screens × ~3 min observation ≈ 2 hours active work. Deliverable: one markdown file + screenshots. **1–2 working days.**

---

## 3. Phase 2 — Backend Foundation

**Revised posture (correction to prior memory):** The role enums already exist in the schema — `RegistrationRole` (PLAYER, PARENT, COACH, CLUB_ADMIN, FREE_AGENT), `MembershipRole` (OWNER, ADMIN, COACH, PLAYER, PARENT), `TeamRole` (HEAD_COACH, ASSISTANT_COACH, PLAYER, PARENT), `ClubOperationalRole`. `RegistrationRole` is already referenced across 18 files including onboarding, join-club, account-next-step, and free-agent surfaces. This phase is an audit-and-gap-fill, not a rewrite.

### 3.1 Role-flow trace

Trace every path: signup → `RegistrationRole` choice → JIT user creation from Clerk JWT → first club interaction (create or join) → `MembershipRole` assignment → `TeamRole` assignment. Document what happens for each of the 5 `RegistrationRole` values. Commit as `docs/revamp/role-flow.md`.

### 3.2 Gap fixes (likely, confirmed during 3.1)

- Auto-assignment logic for OWNER + HEAD_COACH on club creation — verify it fires only for `CLUB_ADMIN` registrations, not all paths.
- Free-agent profile endpoints in `marketplace` module — confirm CRUD completeness, visibility rules, discovery and search.
- Coach invite path — does an invite payload distinguish player vs coach at redemption? If not, add `TeamRole` to the invite and thread through `invites.service.ts` + `invites.controller.ts`.
- Parent-to-child linking via `PARENT_APPROVAL` invite kind — verify the approval flow is sound.

### 3.3 Shared schema cleanup

In `packages/shared`: align Zod schemas with current Prisma enums, add onboarding payload schemas if missing, add free-agent profile update schemas. Canonical schemas consumed by client and server.

### 3.4 Tests

Any new endpoint or schema change gets a service spec and a controller spec. Preserve the 80%+ API coverage target. Integration tests hit real Postgres via the test container, not mocks.

### 3.5 Migrations

Additive only. No destructive changes to enum values. If an enum value needs to go away, mark it deprecated in the schema comment, migrate consumers first, drop in a follow-up revamp.

### 3.6 Deliverable

One PR per surface:

- `backend/role-audit-docs`
- `backend/invite-role-propagation`
- `backend/free-agent-gaps`
- `backend/schema-alignment`

Each small, each mergeable alone, each gated on tests.

### Rough size

**3–5 working days** depending on gap count from 3.1.

---

## 4. Phase 3 — Flow Rework

The core UX work. Four workstreams, each a PR series.

### 4.1 Onboarding — role-aware, Sportlicher Leiter first-class

**Entry:** immediately after Clerk magic-link completes, before any tabs render.

**Step 1 — Role selection.** Single screen, five options rendered as full-width selectable cards (radius `card`, `primary` border when selected, subtle illustration per role). Copy is plain-language:

| Card copy | Maps to |
|---|---|
| "I'm starting a club" | `CLUB_ADMIN` |
| "I'm joining a club" | `PLAYER` (actual role chosen at join step) |
| "I'm coaching" | `COACH` |
| "I'm looking for a club" | `FREE_AGENT` |
| "My child plays" | `PARENT` |

**Step 2 — Branched path.**

- `CLUB_ADMIN`: club create wizard — name, badge upload (`BadgeUploadPicker`), primary color picker with live contrast validation, welcome text (≤500 chars). Auto-assigns OWNER `MembershipRole` on success.
- `PLAYER` / `COACH`: enter invite code OR search clubs. Invite resolves to a club preview card → accept → role/team already encoded in the invite. Search → request to join → pending-approval state.
- `FREE_AGENT`: profile builder — position (MultiSelect), experience years, location, availability for trials (toggle), short bio. Lands on a discoverable profile.
- `PARENT`: enter child's invite code OR request approval from a coach. `PARENT_APPROVAL` invite kind is backend-ready; just needs a clean UI.

**Step 3 — Profile finalization.** Shared across all paths: photo, display name, DOB (age-gate <16 per GDPR Art. 8, Germany). Existing `enter-dob.tsx` becomes a sub-step, not a standalone screen.

**Progress indicator.** Thin bar at top, 1/3 · 2/3 · 3/3. Back button goes to previous step, never past step 1.

### 4.2 Join flow

Three entry points, one pattern: **preview → confirm → result.**

- **Invite deep link** (`anstoss.app/join?code=…`): resolve → preview card (club badge, name, city, your encoded role and team) → accept → land in club. Errors: expired, already used, wrong account — each gets a specific action (resend, sign in as correct user).
- **Search**: search field (pill, `surfaceSunken`), result list (`ListRow` with badge + name + city + member count). Tap → club detail preview → "Request to join" → pending state screen with clear "You'll be notified when [club] approves you" copy.
- **Manual code**: single input, on submit resolves to the same preview as invite deep link.

Pending-approval screen gets a real empty state (not a blank page) with estimated time and an option to ping the club admin.

### 4.3 Home — role-aware hierarchy

One `app/(tabs)/index.tsx` that branches at the top on `MembershipRole` + `RegistrationRole` and renders a role-appropriate layout. Shared components, different composition.

| Role | Primary hero | Second block | Third block |
|---|---|---|---|
| OWNER / CLUB_ADMIN | Dashboard snapshot (members, pending requests, dues outstanding) | Recent activity feed | Quick actions (invite, create event) |
| COACH | Next match card (big, Geist Mono kick-off time) | This week's events | Team roster snapshot |
| PLAYER | Next event RSVP card (hero, full-width) | Team chat latest | Announcements |
| PARENT | Child's next event | Child's team announcements | Child-switcher if multiple children |
| FREE_AGENT | Profile completeness % card | Recent trial invites | Nearby clubs searching for your position |

**Shared chrome:** club header (badge + club name), notification bell with badge count, role label chip (`caption` uppercase).

**Feature flag:** the new role-aware home is behind a flag; fallback to the current screen if the new branch throws. Removed after one release.

### 4.4 States system

Primitives already exist (`EmptyState`, `ErrorState`, `Skeleton`). What's missing is consistent usage and canonical copy.

- **Copy library** at `apps/mobile/src/i18n/states.ts`. One entry per empty/error scenario. Sentence case. Actionable. Example:
  - `events.empty.title = "No events yet"`
  - `events.empty.body = "Coaches will post training sessions and matches here."`
  - `events.empty.cta = "Create the first event"` (admin only)
- **LoadingBoundary** wrapper composing async data + skeleton. Every list screen consumes it. Replaces ad-hoc `isLoading ? <Spinner /> : …`.
- **ErrorBoundary** at the screen level with `ErrorState` + retry wired to the query's refetch.
- **Driven by audit output**: every `FAIL` on the States axis in Phase 1 becomes a line item here.

### 4.5 Cross-flow concerns

- **Keyboard.** Every form-bearing screen uses `KeyboardAvoidingView` + dismiss-on-backdrop-tap. Standardized via a `FormScreen` wrapper.
- **Back behavior.** Step-based flows (onboarding, create-event, club-setup) use a progress-bar back that respects the step, not the navigator stack. Non-step screens use standard navigator back.
- **Sentence case.** Already in-flight per commit `54c70f0`. The polish sweep (Phase 4) finishes it.
- **Error messaging.** Never surface raw API errors. Map via shared error class → user-message table.

### Rough size

Onboarding + join ~5 days. Home rework ~3 days. States system ~2 days. **~10 working days total.**

---

## 5. Phase 4 — Horizontal Polish Sweep

The audit punch list drives every fix. This section is the method, not the individual fixes.

### Batching — by axis, not by screen

Going screen-by-screen tempts scope creep. Going axis-by-axis keeps fixes consistent and PRs reviewable.

1. **Token drift pass** — every hardcoded hex/px replaced with the right token across all screens. One PR, codemod-sized diff, zero behavioral change. Lint rule added to block regression (`no-restricted-syntax` on literal color strings in component files).
2. **Typography pass** — every raw `<Text>` replaced with `<Text variant="…">` primitive. Lint rule on raw RN `Text` imports from screens.
3. **Spacing pass** — off-scale margin/padding snapped to nearest scale step. Where snapping changes meaningful layout, the audit notes flag it for human judgment.
4. **Hierarchy pass** — the judgment pass. For each screen flagged `FAIL` on Hierarchy: re-weight the primary action, reduce visual noise, confirm primary CTA is obvious in 2 seconds.
5. **Copy pass** — sentence case, actionable error messages, scrubbed jargon. Runs against the i18n catalog and inline strings.
6. **Density pass** — SCREEN_PADDING / CARD_PADDING respected, sections breathe. Close-out visual check on every screen.

### Parallelism

Token, typography, and spacing passes can run in parallel — different properties. Hierarchy and copy serialized — they can conflict (moving a primary CTA affects adjacent copy).

### Commit discipline

One commit per pass per flow-cluster (e.g., "token-drift: auth + onboarding", "token-drift: events", "token-drift: admin"). Each commit passes tests + lint + typecheck. Small commits, easy revert.

### Testing

- Snapshot tests refreshed screen-by-screen as intentional changes land.
- Feature-level logic (RSVP debounce, form validation) retested where component shape changes.
- No new E2E tests.

### Cross-screen consistency mechanisms

- ESLint rule `no-raw-colors` — blocks literal hex/rgba outside `theme/`.
- ESLint rule `no-raw-text` — blocks `import { Text } from 'react-native'` in screens.
- `docs/revamp/screen-playbook.md` — canonical screen template reference.
- `docs/revamp/tokens.md` — token chart generated from `theme/` files, committed as the human-readable reference.

### Rough size

Token + typography + spacing: 2–3 days (mostly codemods). Hierarchy: 3–4 days (judgment). Copy + density: 2 days. **~7–9 working days total.**

---

## 6. Phase 5 — Cross-Cutting Audits

Run last, once flows and polish have settled.

### 6.1 Dark mode parity

**Method.** Boot in dark mode, walk every screen, capture side-by-side light/dark screenshots. Score each on:

- No light-mode color leakage (any raw `#FFFFFF`, `#1A1C22` outside token hooks = fail).
- Contrast AA held in dark. Club primary desaturates 15% as specified.
- Shadows readable (dark-mode shadows need lift via elevation, not just opacity).
- Status bar style correct (`dark-content` in light, `light-content` in dark).
- Images with transparent backgrounds (badges, avatars) still render.

**Output.** `docs/revamp/dark-mode-audit.md` + one fix PR: "dark-mode parity pass".

### 6.2 Accessibility

**Checklist per screen:**

- Contrast 4.5:1 body, 3:1 large/UI — verified by a test script that walks `theme/colors.ts` combinations.
- Touch targets ≥44×44.
- Every `IconButton` has `accessibilityLabel`.
- Every image has `accessibilityLabel` or `accessibilityRole="image"`.
- Every interactive element has the right `accessibilityRole`.
- VoiceOver/TalkBack walk of 5 key flows (signup, join, RSVP, DM, edit profile).
- Reduced-motion respect: `AccessibilityInfo.isReduceMotionEnabled()` wired into scale-pulse / spring primitives.
- Font scaling: iOS 200% system font, walk all flows, no breakage.

**Output.** `docs/revamp/a11y-audit.md` + fix PR. Lint rule added for missing `accessibilityLabel` on `Pressable` wrappers.

### 6.3 Motion pass

- Primary CTAs: 100ms scale pulse (0.95→1.0) + haptic on press.
- Bottom sheets: 300ms ease-out spring from bottom.
- Tab transitions: 150–250ms. Screen transitions: 250–400ms.
- No parallax, no scroll-driven animation.
- Modals/drawers respect reduced-motion.
- RSVP: debounced 500ms + disabled during API call.

Fixes inline; one consolidated PR if clustered. No separate doc.

### 6.4 Performance spot-check

- Cold start < 2.5s on Pixel 6a baseline.
- No dropped frames scrolling any list (events, roster, DMs).
- R2-served images pre-sized; no >2× oversize downloads.
- Re-render audit on role-aware home (memoize the role branch, not the whole screen).

Documented in `docs/revamp/perf-notes.md` only if any finding is non-trivial.

### Rough size

Dark mode ~2 days. A11y ~2 days. Motion ~1 day. Perf ~1 day. **~6 working days total.**

---

## 7. Deliverables, Sequencing, Branching

### 7.1 Branching strategy

Merge `feat/renuir-design-revamp` to `main` as a clean checkpoint (`0.1.0` version bump), then each revamp phase is a short-lived feature branch with its own PR. The 5 uncommitted files go in as a final cleanup commit before the merge.

### 7.2 Dependency graph

```
Phase 1 (Audit) ──► Phase 2 (Backend) ──► Phase 3 (Flows) ──► Phase 4 (Polish) ──► Phase 5 (Cross-cut)
       │                     │                     │
       └────────── feeds punch list into ──────────┘
```

Phase 1 gates everything. Phase 2 and Phase 3 overlap partially — backend schema work can start once the role trace (3.1) is complete, while flow UI prototyping begins. Phase 4 waits for Phase 3 (no polishing a screen about to be restructured). Phase 5 waits for Phase 4 (no dark-mode audit of unsettled screens).

### 7.3 PR inventory

| # | PR | Branch | Gates |
|---|---|---|---|
| 1 | Cleanup + Renuir migration merge | `feat/renuir-design-revamp` → main | tests + lint + typecheck |
| 2 | Audit docs + screenshots | `feat/revamp-audit` | doc-only |
| 3 | Role flow trace doc | `feat/revamp-role-trace` | doc-only |
| 4 | Backend: invite role propagation | `feat/revamp-backend-invite` | tests ≥80% on touched files |
| 5 | Backend: free-agent gap fixes | `feat/revamp-backend-fa` | tests ≥80% |
| 6 | Backend: shared schema alignment | `feat/revamp-shared-schemas` | tests ≥80% |
| 7 | Onboarding role-aware rework | `feat/revamp-onboarding` | tests + screenshots |
| 8 | Join flow rework | `feat/revamp-join` | tests + screenshots |
| 9 | Home role-aware hierarchy | `feat/revamp-home` | tests + screenshots |
| 10 | States system + LoadingBoundary/ErrorBoundary | `feat/revamp-states` | tests + screenshots |
| 11 | Polish: token drift pass | `feat/revamp-polish-tokens` | lint rule added |
| 12 | Polish: typography pass | `feat/revamp-polish-typography` | lint rule added |
| 13 | Polish: spacing + hierarchy + copy + density | `feat/revamp-polish-refinement` | screenshots |
| 14 | Dark-mode parity pass | `feat/revamp-dark-mode` | side-by-side screenshots |
| 15 | Accessibility pass | `feat/revamp-a11y` | lint rule added + audit doc |
| 16 | Motion + perf pass | `feat/revamp-motion-perf` | tests |
| 17 | Changelog + version bump to `0.2.0` | `feat/revamp-release` | all gates green |

### 7.4 Timeline

| Phase | Days (active) |
|---|---|
| 1. Audit | 1–2 |
| 2. Backend | 3–5 |
| 3. Flows | 10 |
| 4. Polish | 7–9 |
| 5. Cross-cut | 6 |
| Buffer + review cycles | 3–5 |
| **Total** | **~30–37 working days** |

Calendar ~6–8 weeks at normal review pace. Parallelizable during Phase 4 polish passes where mechanical.

### 7.5 Risks and mitigations

- **Scope drift during polish** → pass-by-axis discipline. Anything mid-pass goes in the punch list, not the current diff.
- **Backend migrations breaking live data** → additive only, tested against production-shaped seed, no enum value removal in this revamp.
- **Review bottleneck on 17 PRs** → each PR under ~500 LOC where possible; codemod-heavy PRs get a single reviewer pass.
- **Role-aware home regressions** → feature-flag with fallback to current screen on throw. Removed after one release.
- **Club primary color contrast in dark mode** → unit test with 20 common club colors; the 15% desaturation logic exercised against real inputs.

### 7.6 Final success criteria

- All 17 PRs merged to `main`; `main` tagged `v0.2.0` with the revamp changelog entry.
- CI green: tests + lint + typecheck + Expo build (iOS + Android internal track).
- Zero hardcoded hex/px in screen files (lint-enforced).
- Every role walks signup → onboarding → home → RSVP → DM end-to-end, without manual DB seeding, in both light and dark mode, with VoiceOver, at 200% font scale.
- WCAG AA contrast verified by the token audit script.
- 60%+ mobile, 80%+ API test coverage held.
- TestFlight and Android internal-track builds uploaded and smoke-tested.

---

## 8. Appendix — Referenced Files and Memories

- `DESIGN.md` — design doctrine (Renuir, 2026-04-17).
- `CLAUDE.md` — engineering rules, stack.
- `apps/api/prisma/schema.prisma` — role enums live here.
- `apps/mobile/src/theme/` — token source of truth.
- User memory `feedback_anstoss_splash.md` — splash stays.
- User memory `project_anstoss_roles.md` — sportlicher leiter is the primary persona (note: role model is more mature than that memory suggests; this spec supersedes).
- User memory `project_anstoss.md` — Sprint 2 multi-team architecture is out of scope for this revamp.
