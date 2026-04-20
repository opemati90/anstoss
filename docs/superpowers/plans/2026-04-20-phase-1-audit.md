# Phase 1 — Audit Runbook

> **Note:** This is a runbook, not a TDD implementation plan. No code is produced in this phase. The deliverable is `docs/revamp/audit.md` + screenshots. Subsequent phases consume the punch list produced here.

**Goal:** Produce a prioritized, deduplicated punch list of every design, UX, and accessibility issue in the Anstoss mobile app, scored against a fixed rubric, with `file:line` callouts where applicable.

**Spec reference:** `docs/superpowers/specs/2026-04-20-anstoss-revamp-design.md` § 2.

---

## Pre-flight

- [ ] **Step 1:** Boot the app in the Expo iOS simulator on iPhone 15 Pro.

```bash
cd apps/mobile
npx expo start --ios
```

- [ ] **Step 2:** Confirm a test user seeded for each registration path exists.

```bash
cd apps/api && npx prisma db seed
```

Expected: seed logs show users for `CLUB_ADMIN`, `COACH`, `PLAYER`, `PARENT`, `FREE_AGENT`.

- [ ] **Step 3:** Create the screenshots directory.

```bash
mkdir -p docs/revamp/screenshots
```

- [ ] **Step 4:** Scaffold `docs/revamp/audit.md` with the rubric and an empty table. See template below.

```markdown
# Anstoss Revamp Audit

Scored 2026-04-20 against the rubric below. `PASS` / `FAIL` / `N/A`.

## Rubric
| Axis | Check |
|---|---|
| Tokens | No raw hex/px/fontSize in component files |
| Typography | Every `<Text>` uses a `TextStyles` variant |
| Spacing | Padding/margin on scale (xxs…xxxl) |
| Hierarchy | Primary action identifiable in 2s |
| States | Loading + empty + error all present |
| Dark mode | Renders correctly via `useColors()`, no light-mode leakage |
| A11y | Touch targets ≥44×44, `accessibilityLabel` on icon-only buttons, AA contrast |
| Copy | Sentence case, no jargon, actionable errors |
| Motion | CTAs have haptic + scale pulse, no scroll-driven animation |
| Density | SCREEN_PADDING=24 respected, breathes |

## Screens
| Screen | Path | Tokens | Typography | Spacing | Hierarchy | States | Dark | A11y | Copy | Motion | Density | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

## Prioritized backlog
### P0 (blocks a flow)
### P1 (visual inconsistency)
### P2 (polish)
```

---

## Screen walk — per-role passes

Run five passes, one per registration role. Each role sees a different subset of screens.

### Pass 1 — `CLUB_ADMIN` (Sportlicher Leiter path)

- [ ] **Step 5:** Sign in as the seeded `CLUB_ADMIN` user. Walk and capture each screen in order. For each, take a screenshot (Cmd+S in simulator, save to `docs/revamp/screenshots/{role}-{screen}.png`), then score the row in `audit.md`.

Screens to walk (from `apps/mobile/app/`):

- `(auth)/sign-in.tsx`
- `onboarding.tsx`
- `club-setup.tsx`
- `(tabs)/index.tsx` (home)
- `admin-dashboard.tsx`
- `admin-members.tsx`
- `admin-billing.tsx`
- `admin-contribution-plan.tsx`
- `club-staff.tsx`
- `club-stats.tsx`
- `create-event.tsx`
- `event-detail.tsx`
- `event-attendance.tsx`
- `team-management.tsx`
- `pending-requests.tsx`
- `dm-list.tsx`, `dm-chat.tsx`, `dm-new.tsx`
- `edit-profile.tsx`
- `notification-settings.tsx`
- `(tabs)/more/index.tsx`

- [ ] **Step 6:** Commit intermediate progress.

```bash
git add docs/revamp/
git commit -m "audit(club-admin): capture screens and score rubric"
```

### Pass 2 — `COACH`

- [ ] **Step 7:** Sign out, sign in as seeded `COACH`. Walk screens applicable to coach:

- `(auth)/sign-in.tsx`, `onboarding.tsx` (coach path)
- `invite.tsx`, `join.tsx`, `join-club.tsx`
- `(tabs)/index.tsx` (home — coach variant)
- `(tabs)/events/*.tsx`
- `(tabs)/roster/*.tsx`
- `my-team.tsx`
- `team-matches.tsx`
- `league-table.tsx`
- `match-detail.tsx`
- `create-event.tsx`
- `event-detail.tsx`, `event-attendance.tsx`
- `dm-*.tsx`
- `edit-profile.tsx`

- [ ] **Step 8:** Commit.

```bash
git add docs/revamp/
git commit -m "audit(coach): capture screens and score rubric"
```

### Pass 3 — `PLAYER`

- [ ] **Step 9:** Sign in as seeded `PLAYER`. Walk:

- `(auth)/sign-in.tsx`, `onboarding.tsx` (player path)
- `invite.tsx`, `join.tsx`, `join-club.tsx`, `enter-dob.tsx`
- `access-blocked.tsx` (if DOB <16)
- `pending-approval.tsx`
- `(tabs)/index.tsx` (home — player)
- `(tabs)/events/*.tsx` (player view)
- `my-contributions.tsx`
- `my-team.tsx`
- `player-loan.tsx` (if surfaced)
- `fussball-link.tsx`
- `dm-*.tsx`
- `edit-profile.tsx`

- [ ] **Step 10:** Commit.

```bash
git add docs/revamp/
git commit -m "audit(player): capture screens and score rubric"
```

### Pass 4 — `PARENT`

- [ ] **Step 11:** Sign in as seeded `PARENT`. Walk:

- `(auth)/sign-in.tsx`, `onboarding.tsx` (parent path)
- `join.tsx`, `team-families.tsx`, `parent-schedule.tsx`
- `(tabs)/index.tsx` (home — parent)
- `event-detail.tsx` (parent-of-player view)
- `dm-*.tsx`
- `edit-profile.tsx`

- [ ] **Step 12:** Commit.

```bash
git add docs/revamp/
git commit -m "audit(parent): capture screens and score rubric"
```

### Pass 5 — `FREE_AGENT`

- [ ] **Step 13:** Sign in as seeded `FREE_AGENT`. Walk:

- `(auth)/sign-in.tsx`, `onboarding.tsx` (free-agent path)
- `free-agent/profile.tsx`
- `free-agent/[id].tsx`
- `transfer-list.tsx`
- `(tabs)/index.tsx` (home — free agent)
- `dm-*.tsx`
- `edit-profile.tsx`

- [ ] **Step 14:** Commit.

```bash
git add docs/revamp/
git commit -m "audit(free-agent): capture screens and score rubric"
```

---

## Consolidation

- [ ] **Step 15:** Sweep `audit.md`. Deduplicate issues that repeat across screens (e.g., "missing empty state" on every list screen = one backlog entry with a screens-affected list, not N entries).

- [ ] **Step 16:** Prioritize into P0 / P1 / P2 at the bottom of `audit.md`:
- **P0:** blocks a flow (e.g., onboarding can't select role, free-agent can't save profile).
- **P1:** visual inconsistency that breaks hierarchy (e.g., two primary CTAs on one screen, wrong radius on a card).
- **P2:** polish (copy casing, subtle spacing, minor shadow differences).

- [ ] **Step 17:** Cross-reference the backlog to phase owners. For each line item write `→ Phase 2` / `→ Phase 3a` / `→ Phase 3b` / `→ Phase 3c` / `→ Phase 3d` / `→ Phase 4` / `→ Phase 5`. This is what downstream plans consume.

- [ ] **Step 18:** Final commit.

```bash
git add docs/revamp/audit.md
git commit -m "audit: consolidate, prioritize, assign phase owners"
```

- [ ] **Step 19:** Open PR: `feat/revamp-audit` → `main`.

```bash
gh pr create --title "Phase 1: Revamp audit + prioritized backlog" --body "$(cat <<'EOF'
## Summary
- Scored every screen against the 10-axis rubric from the revamp spec
- Screenshots captured per role for light-mode baseline
- Backlog prioritized P0/P1/P2 and assigned to phase owners (Phase 2 / 3a-d / 4 / 5)

## Test plan
- [ ] Review audit.md with the team
- [ ] Confirm phase assignments match the spec's dependency graph

See `docs/superpowers/specs/2026-04-20-anstoss-revamp-design.md` for context.
EOF
)"
```

---

## Done criteria

- `docs/revamp/audit.md` exists and has every screen scored.
- `docs/revamp/screenshots/` contains at least one image per role-unique screen.
- Prioritized backlog at the bottom of `audit.md` is deduplicated and phase-assigned.
- PR merged to `main`.
