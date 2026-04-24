# Phase 4a — Token Drift Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the hardcoded color literals that remain in production files outside `src/theme/`, replacing each with the correct semantic token, and lock the result in with a lint rule that blocks regression. This is pass 1 of Phase 4 (Horizontal Polish Sweep) from `docs/superpowers/specs/2026-04-20-anstoss-revamp-design.md §5`.

**Architecture:** The theme system in `apps/mobile/src/theme/colors.ts` is the single source of truth; screens resolve colors through `useClubColors()` from `ClubThemeContext`. Hard-coded hex values in screens represent leaks that miss dark-mode parity and club theming. The fix is one-for-one replacement with the corresponding semantic token. An ESLint rule added at the end blocks new literals from landing.

**Tech Stack:** React Native, Expo Router, existing `src/theme/{colors,tokens}.ts`, ESLint (existing `.eslintrc.js`), Jest (no new test runtime).

**Out of scope (future passes):**
- Phase 4b: Typography pass (raw `<Text>` → variant primitives).
- Phase 4c–f: Spacing, hierarchy, copy, density.
- PRESET_COLORS (10 brand palette hexes in `app/club-setup.tsx` and `app/register/club.tsx`) — these are user-pickable club primaries, not theme colors.
- Shadow color literals inside `src/theme/tokens.ts` — the theme directory is the token sink, not a consumer.

---

## File Structure

Files modified or created:

- **Modify:** `apps/mobile/app/event-detail.tsx:295` — `thumbColor="#fff"` → token.
- **Modify:** `apps/mobile/app/admin-billing.tsx:773, 775, 1013` — two text hexes and one overlay rgba → tokens.
- **Modify:** `apps/mobile/app/admin-contribution-plan.tsx:634` — `color: '#FFFFFF'` → token.
- **Modify:** `apps/mobile/app/team-matches.tsx:386` — `shadowColor: '#000'` → `elevation.card` preset.
- **Modify:** `apps/mobile/app/create-event.tsx:697` — `'rgba(0,0,0,0.4)'` overlay → `c.surfaceOverlay`.
- **Modify:** `apps/mobile/app/(tabs)/roster/index.tsx:1450` — `'rgba(0,0,0,0.35)'` overlay → `c.surfaceOverlay`.
- **Modify:** `apps/mobile/app/dm-chat.tsx:87` — `'rgba(255,255,255,0.7)'` → themed secondary color on inverse surface.
- **Modify:** `apps/mobile/src/components/ui/SegmentedControl.tsx:105` — `shadowColor: '#000'` → `elevation.card` preset.
- **Modify:** `apps/mobile/.eslintrc.js` (or whichever eslint config lives at the mobile root) — add `no-restricted-syntax` rule blocking hex/rgba literals in `.tsx/.ts` files outside `src/theme/` and outside two documented exemptions.

No new files. No new tests. The lint rule is the regression guard.

---

## Task 0: Baseline

- [ ] **Step 1: Confirm branch**

```bash
git rev-parse --abbrev-ref HEAD
```

Expected: `feat/revamp-join`. If different, stop and ask the user.

- [ ] **Step 2: Capture pre-change lint + test counts**

```bash
cd apps/mobile && npm run lint 2>&1 | tail -5
cd apps/mobile && npx jest --forceExit --testTimeout=30000 2>&1 | tail -5
```

Record numbers so Task 9 can prove nothing regressed. Known pre-existing lint errors (do not fix): `app/register/index.tsx` unused `radius`, `src/components/ui/StatCard.tsx` unused `hairline`.

- [ ] **Step 3: Enumerate the violations**

```bash
cd apps/mobile && grep -rEn "'#[0-9A-Fa-f]{6}'|'#[0-9A-Fa-f]{3}'|'rgba\(" app src \
  --include='*.ts' --include='*.tsx' \
  | grep -v '__tests__' | grep -v 'src/theme/' | grep -v 'club-theme.ts'
```

Expected output: the 9 lines listed in File Structure plus the `rgba(${r}, ...)` lines in `withAlpha` helpers. The helpers are fine — they build runtime colors from theme values. Only the hard-coded literals are in scope.

---

## Task 1: Fix `app/event-detail.tsx` thumbColor

**Files:**
- Modify: `apps/mobile/app/event-detail.tsx:295`

- [ ] **Step 1: Read current hook**

Confirm that `useClubColors()` is already in scope at the top of `EventDetailScreen` (it is — hook is destructured as `c` earlier in the component).

- [ ] **Step 2: Replace the literal**

```diff
-              thumbColor="#fff"
+              thumbColor={c.textInverse}
```

Rationale: `thumbColor` on `Switch` is the pill color in "on" state. `textInverse` is `#FFFFFF` in light and `#1A1A18` in dark — the dark-mode value is intentionally the surface color so the switch thumb reads correctly against the club primary track in dark mode.

- [ ] **Step 3: Re-run lint + the event-detail tests**

```bash
cd apps/mobile && npx jest app/__tests__/ --forceExit --testTimeout=30000 -t 'event' 2>&1 | tail -10
```

Expected: no new failures.

- [ ] **Step 4: Commit**

```bash
git add app/event-detail.tsx
git commit -m "style(mobile): replace hardcoded thumbColor with textInverse token"
```

---

## Task 2: Fix `app/admin-billing.tsx` text + overlay colors

**Files:**
- Modify: `apps/mobile/app/admin-billing.tsx:773,775,1013`

- [ ] **Step 1: Inspect the existing color function at line 770–780**

The two hexes `'#6B6B66'` and `'#1A1A18'` are returned from a helper that picks text color by payment state. Light-mode `textTertiary = '#9CA3AF'` and `textPrimary = '#1A1C22'`. The hex `'#6B6B66'` is close enough to `textSecondary` (`'#5F626C'`) that adopting `textSecondary` is the right call. `'#1A1A18'` is the dark-mode `surface` — but in this helper it's being used as a text color in light mode, so the correct target is `textPrimary`.

- [ ] **Step 2: Replace both text hexes**

Open the file and make the helper consume the already-present `c` (from `useClubColors()`). Example shape (adapt to the actual helper's arguments):

```diff
-function pickStateColor(status: string): string {
-  if (status === 'pending') return '#6B6B66'
-  return '#1A1A18'
-}
+function pickStateColor(status: string, c: ReturnType<typeof useClubColors>): string {
+  if (status === 'pending') return c.textSecondary
+  return c.textPrimary
+}
```

Thread `c` through to the callsites (there are 1–2 inside the same file). Do NOT create a new hook — pass the existing theme object.

- [ ] **Step 3: Replace the overlay on line 1013**

```diff
-    backgroundColor: 'rgba(0,0,0,0.32)',
+    // (style field — moved to component to read c.surfaceOverlay at runtime)
```

`surfaceOverlay` lives on the theme and differs light/dark, so it cannot live in a `StyleSheet.create` block. Move the field to the inline component style adjacent to the modal/sheet:

```diff
-<View style={styles.backdrop}>
+<View style={[styles.backdrop, { backgroundColor: c.surfaceOverlay }]}>
```

And remove the `backgroundColor` key from `styles.backdrop` entirely.

- [ ] **Step 4: Run the suite**

```bash
cd apps/mobile && npx jest app/__tests__/admin-billing.spec.tsx --forceExit --testTimeout=30000 2>&1 | tail -10
```

Expected: still passes. If the test mocks `useClubColors()`, it already returns a theme object; the snapshot may shift one color value — refresh it if so.

- [ ] **Step 5: Commit**

```bash
git add app/admin-billing.tsx
git commit -m "style(mobile): adopt text + overlay tokens in admin-billing"
```

---

## Task 3: Fix `app/admin-contribution-plan.tsx` white text

**Files:**
- Modify: `apps/mobile/app/admin-contribution-plan.tsx:634`

- [ ] **Step 1: Locate the style block**

Line 634 sits inside `StyleSheet.create({...})` and reads `color: '#FFFFFF'`. It's used for text on a filled primary button. The right token is `textInverse` — but `StyleSheet.create` cannot reference hooks.

- [ ] **Step 2: Move the color out of the static stylesheet**

Pattern (match however the style is currently applied at the callsite):

```diff
-  buttonLabel: {
-    fontFamily: fonts.label,
-    color: '#FFFFFF',
-  },
+  buttonLabel: {
+    fontFamily: fonts.label,
+  },
```

At the JSX callsite:

```diff
-<Text style={styles.buttonLabel}>{label}</Text>
+<Text style={[styles.buttonLabel, { color: c.textInverse }]}>{label}</Text>
```

- [ ] **Step 3: Run the admin-contribution-plan tests**

```bash
cd apps/mobile && npx jest app/__tests__/ --forceExit --testTimeout=30000 -t 'contribution' 2>&1 | tail -10
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add app/admin-contribution-plan.tsx
git commit -m "style(mobile): adopt textInverse token in admin-contribution-plan"
```

---

## Task 4: Fix `app/team-matches.tsx` shadow

**Files:**
- Modify: `apps/mobile/app/team-matches.tsx:386`

- [ ] **Step 1: Read the surrounding style block**

Around line 386 is a card-like style with `shadowColor: '#000'` plus `shadowOffset`, `shadowOpacity`, `shadowRadius`, `elevation`. That's the shape of a manual shadow. The theme already exports `elevation.card` that packs all five fields correctly.

- [ ] **Step 2: Swap the manual shadow for the preset**

```diff
-  matchCard: {
-    backgroundColor: ...,
-    shadowColor: '#000',
-    shadowOffset: { width: 0, height: 2 },
-    shadowOpacity: 0.06,
-    shadowRadius: 6,
-    elevation: 2,
-    ...
-  },
+  matchCard: {
+    backgroundColor: ...,
+    ...elevation.card,
+    ...
+  },
```

Ensure `elevation` is imported from `../src/theme/tokens` (check existing import — most of these screens already import `elevation`).

- [ ] **Step 3: Run the team-matches tests**

```bash
cd apps/mobile && npx jest app/__tests__/team-matches --forceExit --testTimeout=30000 2>&1 | tail -10
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add app/team-matches.tsx
git commit -m "style(mobile): adopt elevation.card preset in team-matches"
```

---

## Task 5: Fix `app/create-event.tsx` backdrop

**Files:**
- Modify: `apps/mobile/app/create-event.tsx:697`

- [ ] **Step 1: Replace the literal with the theme overlay**

The line is inside a `StyleSheet.create` block for a modal/sheet backdrop. Same pattern as Task 2 Step 3 — move the color to the inline style since `surfaceOverlay` is theme-dependent.

```diff
-  backdrop: {
-    ...
-    backgroundColor: 'rgba(0,0,0,0.4)',
-  },
+  backdrop: {
+    ...
+  },
```

At the JSX callsite:

```diff
-<View style={styles.backdrop}>
+<View style={[styles.backdrop, { backgroundColor: c.surfaceOverlay }]}>
```

- [ ] **Step 2: Run the create-event tests**

```bash
cd apps/mobile && npx jest app/__tests__/create-event --forceExit --testTimeout=30000 2>&1 | tail -10
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add app/create-event.tsx
git commit -m "style(mobile): adopt surfaceOverlay token for create-event backdrop"
```

---

## Task 6: Fix `app/(tabs)/roster/index.tsx` backdrop

**Files:**
- Modify: `apps/mobile/app/(tabs)/roster/index.tsx:1450`

- [ ] **Step 1: Same pattern as Task 5**

Replace the literal `'rgba(0,0,0,0.35)'` with `c.surfaceOverlay` by moving it out of `StyleSheet.create` to inline.

- [ ] **Step 2: Run the roster tests**

```bash
cd apps/mobile && npx jest app/__tests__/roster --forceExit --testTimeout=30000 2>&1 | tail -10
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add 'app/(tabs)/roster/index.tsx'
git commit -m "style(mobile): adopt surfaceOverlay token for roster backdrop"
```

---

## Task 7: Fix `app/dm-chat.tsx` inverse text alpha

**Files:**
- Modify: `apps/mobile/app/dm-chat.tsx:87`

- [ ] **Step 1: Read the callsite**

Line 87 is inside a `Text` `color` prop on a `<Text>` primitive (not raw rgba in a style block). The primitive accepts one of the named tokens from `Text/variant-color.ts`. `'rgba(255,255,255,0.7)'` is a translucent white used for timestamps on own-message bubbles (bubble bg is the club primary).

- [ ] **Step 2: Add a new named color slot if one does not already exist**

Inspect `apps/mobile/src/components/ui/Text.tsx` — check for an `inverse` color variant. If it exists and maps to `c.textInverse`, the right call is to pass opacity through a different channel (container alpha, or adding an `inverseMuted` variant).

Concrete change: introduce an `inverseMuted` color token that resolves to `c.textInverse` with `0.7` opacity applied via `withAlpha`. Add a case for `'inverseMuted'` in the Text color resolver.

```diff
// inside Text.tsx color resolver
+    case 'inverseMuted':
+      return withAlpha(c.textInverse, 0.7)
```

Type union:

```diff
-type TextColor = 'primary' | 'secondary' | 'tertiary' | 'inverse' | 'tint' | ...
+type TextColor = 'primary' | 'secondary' | 'tertiary' | 'inverse' | 'inverseMuted' | 'tint' | ...
```

At the dm-chat callsite:

```diff
-color={isMine ? 'rgba(255,255,255,0.7)' : 'tertiary'}
+color={isMine ? 'inverseMuted' : 'tertiary'}
```

- [ ] **Step 3: Run the dm-chat tests**

```bash
cd apps/mobile && npx jest app/__tests__/dm-chat --forceExit --testTimeout=30000 2>&1 | tail -10
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add app/dm-chat.tsx src/components/ui/Text.tsx
git commit -m "style(mobile): add inverseMuted Text color and adopt it in dm-chat"
```

---

## Task 8: Fix `src/components/ui/SegmentedControl.tsx` shadow

**Files:**
- Modify: `apps/mobile/src/components/ui/SegmentedControl.tsx:105`

- [ ] **Step 1: Replace manual shadow with `elevation.subtle` or `elevation.card`**

Same pattern as Task 4.

- [ ] **Step 2: Run the segmented-control tests**

```bash
cd apps/mobile && npx jest src/components/ui --forceExit --testTimeout=30000 2>&1 | tail -10
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/SegmentedControl.tsx
git commit -m "style(mobile): adopt elevation preset in SegmentedControl"
```

---

## Task 9: Add `no-raw-colors` ESLint rule

**Files:**
- Modify: `apps/mobile/.eslintrc.js` (or whichever config file already exists)

- [ ] **Step 1: Locate the current ESLint config**

```bash
cd apps/mobile && ls .eslintrc* eslint.config.* 2>/dev/null
```

- [ ] **Step 2: Add the rule with documented exemptions**

Using `no-restricted-syntax`, target `Literal` nodes whose `value` matches `^#[0-9A-Fa-f]{3,8}$` or starts with `rgba(` / `rgb(`. Scope the rule to all `.ts` and `.tsx` files under `app/` and `src/` with an `overrides` block that disables the rule inside `src/theme/**` and inside `src/context/ClubThemeContext.tsx` (which holds the `withAlpha` helper). Example:

```js
{
  selector: "Literal[value=/^#[0-9A-Fa-f]{3,8}$/]",
  message: "Use a theme token from useClubColors() instead of a hex literal.",
},
{
  selector: "Literal[value=/^rgba?\\(/]",
  message: "Use surfaceOverlay or withAlpha() instead of an rgba literal.",
},
```

Exemptions live in the overrides block:

```js
overrides: [
  {
    files: ['src/theme/**/*.{ts,tsx}', 'src/context/ClubThemeContext.tsx'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['app/club-setup.tsx', 'app/register/club.tsx'],
    rules: {
      // PRESET_COLORS palette is intentionally raw — these are user-pickable
      // club-primary values, not theme tokens.
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: { 'no-restricted-syntax': 'off' },
  },
],
```

- [ ] **Step 3: Run lint and confirm it lands cleanly on the fleet**

```bash
cd apps/mobile && npm run lint 2>&1 | tail -20
```

Expected: the two pre-existing errors (`app/register/index.tsx` unused `radius`, `src/components/ui/StatCard.tsx` unused `hairline`) still appear, and no new `no-restricted-syntax` violations.

If any new violations surface, add them to this task list as a follow-up — do not exempt more files without justification.

- [ ] **Step 4: Re-run the full test suite**

```bash
cd apps/mobile && npx jest --forceExit --testTimeout=30000 2>&1 | tail -10
```

Expected: same number of suites/tests passing as in Task 0 Step 2.

- [ ] **Step 5: Commit**

```bash
git add .eslintrc.js
git commit -m "chore(mobile): add no-raw-colors lint rule to block token drift"
```

---

## Task 10: Push + summary

- [ ] **Step 1: Push the branch**

```bash
git push
```

- [ ] **Step 2: Update the PR description**

If PR #4 is still the active PR on `feat/revamp-join`, append a Phase 4a row to the "Phases landed" table in the PR description. The row wording should be: "4a — Token drift pass + no-raw-colors lint rule (9 literals replaced)."

---

## Self-Review Checklist (run before Task 10 Step 1)

1. **Spec coverage:** Design spec §5 calls out "token drift pass" + "ESLint rule added to block regression" — both are in-plan (Tasks 1–8 cover the literals; Task 9 covers the rule). ✅
2. **Placeholder scan:** No "TBD"/"TODO" in any task. ✅
3. **Type consistency:** `elevation.card` referenced in Task 4 and Task 8; verify the exact preset name exists in `src/theme/tokens.ts` at execution time (available presets: `elevation.subtle | .card | .raised | .strong | .hero`).
4. **`inverseMuted` naming:** Used only in Task 7. Verify it's not pre-existing in `Text.tsx` before adding.
5. **Overrides ordering:** ESLint overrides in Task 9 must appear after the root `rules` block; verify at execution.
