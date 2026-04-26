# Anstoss Phase 4 — Horizontal Polish Sweep — Design Spec

**Date:** 2026-04-26
**Parent spec:** `docs/superpowers/specs/2026-04-20-anstoss-revamp-design.md` (§5)
**Branch context:** `main` is the merge target; each pass is its own short-lived branch.
**Design doctrine baseline:** Renuir-derived editorial, adopted 2026-04-17 (`DESIGN.md`).

---

## 1. Goal & Scope

### Goal

Execute Phase 4 of the approved revamp spec faithfully. Produce the Phase 1 audit artifact that was skipped, then run all six polish passes (token drift, typography, spacing, hierarchy, copy, density) sequentially across all ~80 mobile screens, gated by two new lint rules that prevent regression.

### Success criteria

- `docs/revamp/audit.md` committed with rubric scores + screenshots for every screen file under `apps/mobile/app/**`.
- ESLint rules `no-raw-colors`, `no-raw-spacing`, `no-raw-text`, `text-must-have-variant`, and `no-inline-strings` active and CI-green.
- Zero raw hex / rgba / `rgb(...)` color literals in `apps/mobile/app/**` and `apps/mobile/src/components/**` (allowed only in `apps/mobile/src/theme/**`).
- Zero numeric literals ≥ 2 in `padding* | margin* | gap | rowGap | columnGap | borderRadius | top | right | bottom | left | width | height | minWidth | minHeight | maxWidth | maxHeight` in screen / shared-component files.
- Zero `import { Text } from 'react-native'` outside `theme/` and the `Text` primitive itself.
- Every JSX text node (length > 1 character) is `t(...)` — no inline strings outside test files, dev-only diagnostics, and the splash screen.
- Every screen file appears as a row in `docs/revamp/audit.md` with `PASS` on Tokens, Typography, Spacing, Hierarchy, Copy, Density. The States axis is scored but its `PASS` criterion in Phase 4 is narrower than the parent spec's full Phase 3.4 system: it means "empty / loading / error states present where applicable, with sentence-case actionable copy from the catalog and consistent composition" — not "States system fully implemented". Building any missing State primitives is deferred to a follow-up. Dark mode / A11y / Motion deferred to Phase 5.
- TestFlight build uploaded and walked manually for hierarchy / copy / density sign-off before merging the final PR.

### In scope

- All ~80 screen files under `apps/mobile/app/**`.
- All shared screen-level components under `apps/mobile/src/components/**` consumed by screens.
- Theme tokens under `apps/mobile/src/theme/**` — additions only, no removals.
- ESLint plugin `eslint-plugin-anstoss-tokens` (new package under `packages/eslint-plugin-anstoss-tokens`).
- Codemod scripts under `scripts/codemods/**` (retained for future audits).
- Copy in `apps/mobile/src/i18n/{de,en,fr,pt,it}.json` — sentence-case + actionable rewrite. Native-speaker QA for `fr/pt/it` deferred to sub-project 2 (locale expansion).
- Backend error class → user-message mapping in `apps/mobile/src/api/errorMessages.ts`.

### Out of scope

- New visual direction (Renuir doctrine stays).
- New locales (`tr`, `ar`) — deferred to sub-project 2.
- RTL support — deferred to sub-project 2.
- Chat auto-translation — deferred to sub-project 3.
- Phase 5 work: dark-mode parity, a11y audit, motion pass, performance spot-check.
- Backend changes.
- New features, new screens, new flows.
- New E2E tests.

---

## 2. Phase 1 — Audit (precondition)

### Method

Boot the Expo dev simulator. Walk every screen reachable from each role flow (`CLUB_ADMIN`, `COACH`, `PLAYER`, `PARENT`, `FREE_AGENT`). Capture one screenshot per screen state (loaded; empty; error; loading where surfaceable in normal use). Score each screen against the rubric:

| Axis | Pass criterion |
|---|---|
| Tokens | No literal hex / rgba / off-scale spacing in the file. |
| Typography | Every `Text` is the design-system primitive with a `TextStyles` variant. |
| Spacing | Every `padding* / margin* / gap / radius` value maps to a token. |
| Hierarchy | A first-time user identifies the primary action in under 2 seconds. |
| States | Loading + empty + error states all present and styled consistently. |
| Copy | Sentence case, actionable, no jargon, no inline strings. |
| Density | Screen breathes; rhythm uses `SPACING_XL` / `SPACING_LG` / `CARD_PADDING`. |
| Dark mode | (Scored, not fixed in Phase 4 — Phase 5 owns the fix.) |
| A11y | (Scored, not fixed in Phase 4 — Phase 5 owns the fix.) |
| Motion | (Scored, not fixed in Phase 4 — Phase 5 owns the fix.) |

### Output artifacts

- `docs/revamp/audit.md` — one row per screen, columns for each axis scored `PASS` / `FAIL` / `N/A`, plus a `notes` column with `file:line` callouts and a `final-state` column populated as passes resolve rows.
- `docs/revamp/screenshots/` — one PNG per screen state. Naming: `{flow}-{screen}-{state}.png` (e.g., `tabs-roster-squad-loaded.png`, `auth-sign-in-loading.png`).
- `docs/revamp/screenshots-dark/` — same set in dark mode (Phase 5 input; not fixed here).
- `docs/revamp/screenshots-final/` — populated by Pass 6 with the final post-polish state.
- Bottom of `audit.md` — deduplicated punch list, P0 / P1 / P2.

### Coverage gate

A CI script (`scripts/audit-coverage.ts`) diffs the row list in `audit.md` against the screen file list under `apps/mobile/app/**`. Missing rows fail the build. Lives in `feat/revamp-audit` and onward.

### Scope discipline

Audit is observation only. No fixes during audit. Every issue becomes a punch-list entry; fixes land in Passes 1-6.

### Deliverable

One PR: `feat/revamp-audit`. Doc + screenshots + coverage script. Doc-only otherwise (no `.tsx` changes).

---

## 3. Pass 1 — Token Drift

### Goal

Zero hardcoded color and dimension literals in screen and shared-component files. All references go through tokens.

### Targets

- Color literals: `#RRGGBB`, `#RGB`, `#RRGGBBAA`, `rgba(...)`, `rgb(...)` → `useClubColors()` slot or named export from `theme/colors.ts`.
- Dimension literals in `width`, `height`, `padding*`, `margin*`, `borderRadius`, `gap`, `fontSize`, `lineHeight`, `borderWidth` → nearest `SPACING_*`, `RADIUS_*`, `FONT_SIZE_*`, or `hairline`. Numbers `0` and `1` (used for borders, opacities, flex) are exempt.
- `iconSize` literals → `ICON_SM | ICON_MD | ICON_LG | ICON_XL | ICON_XXL`.

### Method

1. Codemod `scripts/codemods/no-raw-colors-codemod.ts` (jscodeshift) walks every `.tsx` under `apps/mobile/app/**` and `apps/mobile/src/components/**`. For each color literal: find the nearest matching token in `theme/colors.ts`. If none matches within ΔE < 3 (CIE76), log to `codemod-report.md` for human resolution.
2. Codemod `scripts/codemods/no-raw-spacing-codemod.ts` for spacing: find nearest `SPACING_*` within ±2px tolerance. If outside tolerance, log for human judgment.
3. Manual pass on every entry in `codemod-report.md`. Outcomes:
   - **Snap to nearest token** — accept the visual delta, note the `before → after` value in the audit row.
   - **Add a new token** — only if the value repeats 3+ times across the codebase.
   - **Accept the literal** — only as a documented edge case with `// eslint-disable-next-line no-raw-colors -- <reason>`.

### Lint rules added (end of pass)

`eslint-plugin-anstoss-tokens` ships at the end of this pass with two rules active:

- `no-raw-colors` — bans `/#[0-9a-f]{3,8}/i`, `/rgba?\(/`, `/hsla?\(/` literals in `apps/mobile/app/**` and `apps/mobile/src/components/**`. Allowed only in `apps/mobile/src/theme/**`.
- `no-raw-spacing` — bans numeric literals ≥ 2 in `padding*`, `margin*`, `borderRadius`, `gap`, `rowGap`, `columnGap`, `top`, `right`, `bottom`, `left`, `width`, `height`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight` style properties. Severity: `warn` after Pass 1 (allows incremental fixing in Pass 3); upgraded to `error` at end of Pass 3.

### Test gate

`npm run lint && npm run typecheck && npm test`. Existing snapshot tests refreshed for any visual delta. CI green.

### Commit discipline

One commit per flow-cluster:

- `(auth)`
- `(tabs)/index`
- `(tabs)/events`
- `(tabs)/chat`
- `(tabs)/roster`
- `(tabs)/more`
- `admin-*`
- `register/*`
- `join*`
- `event-*`
- `dm-*`
- `free-agent/*`
- shared `src/components/**`

Each commit passes lint + tests + typecheck.

### Deliverable

One PR: `feat/revamp-polish-tokens`. Codemod scripts retained under `scripts/codemods/` with README.

---

## 4. Pass 2 — Typography

### Goal

Every text node uses the design-system `Text` primitive from `apps/mobile/src/components/ui` with a `TextStyles` variant. Zero raw `<Text>` from `react-native` in screen / shared-component files.

### Targets

- `import { Text } from 'react-native'` in any file under `apps/mobile/app/**` or `apps/mobile/src/components/**` (except the `Text` primitive itself) → replaced with the project `Text` primitive.
- Inline `style={{ fontFamily, fontSize, lineHeight, letterSpacing, fontWeight }}` → mapped to a `TextStyles` variant. Color-only style overrides (`{ color: c.textPrimary }`) stay; that is the dark-mode-aware override pattern.
- Variants in `TextStyles`: `display | h1 | h2 | body | bodyMedium | bodySmall | caption | micro | button | buttonSmall | input | tabLabel | tag`.

### Method

1. Codemod `scripts/codemods/no-raw-text-codemod.ts` rewrites the import and replaces inline styles with `<Text variant="…">` props.
2. Codemod resolves the variant by closest match on `(fontFamily, fontSize, lineHeight)` tuple within ±1px / one-weight-step. Mismatches log to `typography-report.md`.
3. Manual pass on report. Outcomes:
   - **Snap to variant** — accept delta, note in audit.
   - **Extend `TextStyles`** — only if a recurring shape isn't covered (≥3 occurrences threshold).
4. Verify the `Text` primitive in `src/components/ui/Text.tsx` accepts the full variant set and forwards `numberOfLines`, `accessibilityLabel`, `style`, `testID`, `onPress`, `selectable`, `ellipsizeMode`. Add any missing pass-throughs in this PR.

### Lint rules added (end of pass)

- `no-raw-text` — bans `import { Text } from 'react-native'` outside `theme/` and the `Text` primitive itself. Autofix rewrites the import to the primitive's path.
- `text-must-have-variant` — bans `<Text>` from the primitive without a `variant=` prop.

### Test gate

`npm run lint && npm run typecheck && npm test`. Existing tests that query by text continue to work because the `Text` primitive forwards children + accessibility props. Where snapshots change, refresh in the same commit.

### Commit discipline

Same flow-cluster split as Pass 1.

### Deliverable

One PR: `feat/revamp-polish-typography`. Codemod retained under `scripts/codemods/`.

---

## 5. Pass 3 — Spacing

### Goal

Every spacing / layout dimension maps to a token. No off-scale magic numbers. Screen-level layouts respect `SCREEN_PADDING` / `BODY_PADDING` / `CARD_PADDING`.

### Targets

- Numeric literals in `padding*`, `margin*`, `gap`, `rowGap`, `columnGap`, `top/right/bottom/left`, `width`, `height`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight`. Numbers `0` and `1` exempt.
- Screen-root padding: every screen's outer container uses `paddingHorizontal: SCREEN_PADDING`. Cards use `padding: CARD_PADDING`. Forms use `paddingHorizontal: BODY_PADDING`.
- Touch-target heights: `minHeight: 44` for any interactive `Pressable` / `TouchableOpacity` (44pt iOS minimum).

### Method

1. Pass 1's codemod already replaced literals within ±2px of a token. Pass 3 works through the off-tolerance backlog logged to `codemod-report.md`.
2. For each logged value: pick the nearest token, accept the visual delta, update the audit row. Add a new token to `theme/spacing.ts` only if the off-scale value repeats 3+ times.
3. Per-screen root audit: walk each screen file, confirm root container uses `SCREEN_PADDING`, cards use `CARD_PADDING`, forms use `BODY_PADDING`. Fix in this pass. Audit `Density: FAIL` rows resolved here.
4. Touch-target audit: regex sweep for `<Pressable` / `<TouchableOpacity` without `minHeight`, add `minHeight: 44` where missing. Skip files that import `Button` / `ListRow` and don't define their own pressables — those primitives already enforce.

### Lint rules updated

`no-raw-spacing` upgraded from `warn` to `error` at end of pass.

### Test gate

`npm run lint && npm run typecheck && npm test`. Snapshots refreshed where layout shifts; visual diffs reviewed in PR.

### Commit discipline

Same flow-cluster split as Passes 1-2.

### Deliverable

One PR: `feat/revamp-polish-spacing`.

---

## 6. Pass 4 — Hierarchy (judgment)

### Goal

Every screen passes the 2-second test: a first-time user identifies the primary action in under 2 seconds. Visual weight matches functional importance.

### Targets

- Every screen scored `Hierarchy: FAIL` in the audit.
- Every screen with multiple CTAs where the primary is not visually dominant.

### Heuristics applied per screen

1. **Primary CTA dominance.** One clearly dominant CTA per screen (filled, full-width-or-near, primary color). Secondary actions become text or outlined buttons. Three-CTA screens collapse to one primary + a `…` menu / `SelectionSheet`.
2. **Section weight.** Hero / next-up content takes the top viewport. Lists below. Admin / settings shortcuts at the bottom or in a separate section. Match the role-aware home pattern from Phase 3c.
3. **Empty states pull attention to the action.** When a list is empty and the user is supposed to act, the empty state's CTA replaces the screen's primary CTA — no double-CTA confusion.
4. **Navigation chrome doesn't compete.** `TabScreenHeader`, search bars, filter rows: muted styling so they don't pull weight from content.
5. **Status badges and counts use neutral tone by default.** Color (`success` / `warning` / `error`) reserved for actual state signals.

### Method

1. For each flagged screen: open file + audit row + screenshot. Apply heuristics 1-5. Capture before/after screenshots. Replace audit row's `Hierarchy: FAIL` → `PASS`, append a one-line justification.
2. Where heuristics conflict with current information density (e.g., admin dashboard intentionally surfaces five things), document the exception in audit notes — don't force a single CTA.
3. **No new components in this pass.** Use existing `Button`, `Card`, `EmptyState`, `SectionGroup`, `ListRow` primitives. If a heuristic requires a missing primitive, log to `docs/revamp/missing-primitives.md` and either build the primitive in this pass (if it unblocks ≥3 screens) or defer to a follow-up.

### Lint

None — judgment pass.

### Test gate

`npm run lint && npm run typecheck && npm test`. Snapshots refreshed for visual changes. Test files asserting specific button labels / structure updated where CTAs are demoted from filled to outlined (label stays).

### Commit discipline

One commit per flow-cluster, smaller than Passes 1-3 because each touches fewer files but with more thought per file.

### Deliverable

One PR: `feat/revamp-polish-hierarchy`. Includes audit doc rows updated to `PASS`.

---

## 7. Pass 5 — Copy

### Goal

Every user-facing string is sentence case, actionable, jargon-free. Error messages tell the user what to do. Catalog cleanup so sub-project 2 (locale expansion) inherits a clean source-of-truth in `de` and `en`.

### Targets

- All keys in `apps/mobile/src/i18n/de.json`, `en.json`, `fr.json`, `pt.json`, `it.json`.
- All inline string literals in screen / component files (JSX text and copy-shaped string props).
- Backend `ApiError` class → user-message mapping in `apps/mobile/src/api/errorMessages.ts`.

### Rules applied per string

1. **Sentence case for all UI copy.** Title case banned except in proper nouns. (`"Create Event"` → `"Create event"`; `"Anstoss"` stays.)
2. **Verb-first CTAs.** `"Continue"`, `"Save changes"`, `"Invite member"`. Noun-only labels only for navigation entries.
3. **Error messages: cause + remedy + action.** `"Couldn't load events. Check your connection and tap retry."` Not `"Network error"`. Not `"Failed to load events: 500"`.
4. **No system jargon.** No HTTP codes, API field names, Prisma model names, or backend error class names visible to users.
5. **No filler.** Drop `"Please"`, `"Sorry,"`, `"Oops!"`, lorem residue. Direct and short.
6. **Empty states have an actionable line.** `title` + `body` + `cta` where action is possible. Existing `EmptyState` primitive supports this.
7. **Number / date formatting** via `Intl.NumberFormat` / `Intl.DateTimeFormat` with the active locale. Hardcoded `${count} members` → `t('plural.members', { count })`. Raw date strings → `formatShortDate(iso, locale)`.

### Method

1. **i18n catalog sweep first.** Walk every key in `de.json`. Apply rules 1-5, fix in place. `en.json` mirrors the source-string edits. `fr / pt / it` get best-effort updates; native-speaker QA deferred to sub-project 2.
2. **Inline-string sweep.** New ESLint rule `no-inline-strings` (added at end of pass) flags any JSX text node not wrapped in `t(...)`. Fix each by extracting to `de.json` + `en.json`. Allowed exceptions: dev-only diagnostics, test files, splash screen.
3. **Error-message audit.** Open every file calling `Alert.alert`, `setError`, `console.warn` for user-surfaceable errors. Map each error path to a key in `errors.json` namespace. Backend `ApiError` class names → table mapping in `errorMessages.ts`.
4. **Plural and gender.** Every `${count} X` pattern → `t('plural.X', { count })` with proper plural keys per ICU conventions. German gender-specific copy reviewed for grammar.
5. **State copy library.** Audit notes from Phase 3.4 had partial coverage; this pass completes the *copy half* per the `apps/mobile/src/i18n/states.ts` reference from the parent spec §4.4. The composition half (where empty / error / loading states sit visually within screens) is finished in Pass 6 (Density). Building any missing State primitives is out of scope; flagged to `docs/revamp/missing-primitives.md` for follow-up.

### Lint rule added (end of pass)

- `no-inline-strings` — JSX text nodes longer than one character must be `t(...)` calls. Allowlist for testing IDs and known dev paths. No autofix — error only.

### Test gate

`npm run lint && npm run typecheck && npm test`. Existing tests that query by text use `t(...)` keys via the test i18n provider; rewrites won't affect them as long as keys stay. Where keys rename, test files updated in the same commit.

### Commit discipline

Two phases inside one PR:
1. Catalog sweep — touches `i18n/*.json` only.
2. Inline-string extraction — per flow-cluster, same split as prior passes.

### Deliverable

One PR: `feat/revamp-polish-copy`. Updated `de.json` + `en.json` + best-effort `fr / pt / it`. `errorMessages.ts` populated. Native-speaker QA for non-de/en locales deferred to sub-project 2.

---

## 8. Pass 6 — Density

### Goal

Every screen breathes. Sections separate cleanly. No cramped clusters, no overlong lists without rhythm.

### Targets

- Screen-root vertical rhythm: `gap` between top-level sections respects `SPACING_XL` (24px) on standard screens, `SPACING_LG` (16px) on compact / settings screens.
- Card internal rhythm: `padding: CARD_PADDING` outside, `gap: SPACING_SM | SPACING_MD` between rows inside. No card with > 6 child rows without an internal divider, sub-section header, or visual chunking.
- List rhythm: lists > 8 rows get pagination, lazy loading, or sticky section headers by category.
- Header → first-content gap: `SPACING_LG` after `TabScreenHeader`, never less.
- Bottom safe-area: every scrollable content uses `paddingBottom: TAB_BAR_CLEARANCE + SPACING_LG` so the last row clears the tab bar comfortably.
- Form field rhythm: vertical `gap: SPACING_LG` between labeled fields. Help text uses `SPACING_XS` from the input below.

### Method

1. Per-screen density check: walk each `Density: FAIL` audit row. Open file + screenshot, fix the rhythm, capture after-shot, mark row `PASS`. Empty / error / loading state composition (where these blocks sit within the screen, their breathing room) is resolved in this pass — finishing the visual half of the States axis whose copy half landed in Pass 5.
2. Cross-cutting fixes: where the same density bug repeats (e.g., five screens use `paddingBottom: TAB_BAR_CLEARANCE` without the `+ SPACING_LG`), do a targeted sweep across all of them in one commit.
3. **No new primitives.** Density is composition, not new components. Recurring layout patterns logged to `docs/revamp/missing-primitives.md` for follow-up — not this pass.
4. Final visual sweep: walk every screen one more time in simulator (light mode only — Phase 5 owns dark mode). Capture final screenshots into `docs/revamp/screenshots-final/`. Audit doc gets a `final-state` column referencing the new path.

### Lint

None — judgment pass.

### Test gate

`npm run lint && npm run typecheck && npm test`. Snapshots refreshed for visual changes. CI green across all prior passes' rules.

### Commit discipline

One commit per flow-cluster + one cross-cutting commit for the bottom-padding sweep.

### Deliverable

One PR: `feat/revamp-polish-density`. Includes final screenshot set + completed audit doc.

---

## 9. PR Inventory & Sequencing

| # | PR | Branch | Gates |
|---|---|---|---|
| 1 | Phase 1 audit doc + screenshots + coverage script | `feat/revamp-audit` | doc + coverage script |
| 2 | Pass 1 — token drift + `no-raw-colors` (`error`) + `no-raw-spacing` (`warn`) | `feat/revamp-polish-tokens` | lint + tests + typecheck |
| 3 | Pass 2 — typography + `no-raw-text` + `text-must-have-variant` | `feat/revamp-polish-typography` | lint + tests + typecheck |
| 4 | Pass 3 — spacing (judgment backlog from Pass 1) + `no-raw-spacing` upgraded to `error` | `feat/revamp-polish-spacing` | lint + tests + typecheck |
| 5 | Pass 4 — hierarchy | `feat/revamp-polish-hierarchy` | snapshots + tests |
| 6 | Pass 5 — copy + `no-inline-strings` + `errorMessages.ts` | `feat/revamp-polish-copy` | lint + i18n key coverage |
| 7 | Pass 6 — density + final screenshot set | `feat/revamp-polish-density` | tests + final audit doc |

### Sequencing rules

- Strictly serial. Each PR merges to `main` before the next begins.
- Each PR gated on: `npm run lint && npm run typecheck && npm test` per `CLAUDE.md` Commands section.
- Each PR includes a `docs/revamp/audit.md` update with the rows it resolves.
- Branch base: `main`. After each merge: pull `main`, branch the next.

### Branch protection

- No force-push to `main`.
- No skipping pre-commit hooks.
- Per memory `feedback_anstoss_no_auto_push_release.md`: never push to `feat/revamp-release` before manual simulator approval.

### Calendar

~1-2 days audit + ~7-9 days passes = **~9-11 working days total** (per parent spec §5 estimate plus the audit day).

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Codemod over-snaps a value, regressing a screen | Medium | Codemod report logs every snap > 0px delta; PR review walks the report alongside screenshots. Visual deltas explicitly approved row-by-row in audit doc. |
| Lint rule rollout breaks unrelated PRs in flight | High | Each lint rule lands as part of the pass that fixes its violations — repo is clean at rule-add time. Staged severity (`warn` → `error`) for `no-raw-spacing` prevents flag-day. |
| Snapshot test churn drowns review | Medium | Refresh snapshots in the same commit as the change that caused them; flow-cluster commits keep snapshot diffs scoped. Reviewer reads only the non-snapshot diff. |
| Hierarchy / copy passes drift into refactor | High | Heuristics list is closed (sections 6 / 7). Anything outside goes to the missing-primitives doc, never the current PR. |
| Audit goes stale during the 7-9 day run | Medium | Each pass updates the audit row it resolves in the same commit. No end-of-phase reconciliation. |
| Locale catalogs re-translated mid-flight by sub-project 2 | Medium | Sub-project 2 starts only after Phase 4 merges. `de.json` / `en.json` post-Phase-4 are the input to sub-project 2's translation work. |
| TestFlight build delayed by passes still in flight | Low | No PRs auto-deploy. Per memory: never push to `feat/revamp-release` until manual simulator approval. |
| Codemod scripts decay (one-time-use temptation) | Low | Scripts retained in `scripts/codemods/` with a README and re-run instructions for future audits. |

---

## 11. Sub-project Decomposition

Phase 4 polish is sub-project 1 of three brainstormed independently:

1. **Sub-project 1 (this spec)** — Phase 4 visual polish across all ~80 mobile screens. ~9-11 working days.
2. **Sub-project 2** — Locale expansion: add `tr` and `ar` (RTL), full key coverage across all 7 locales (`de / en / fr / pt / it / tr / ar`), native-speaker QA. ~4-6 working days. Brainstorm starts after sub-project 1 merges.
3. **Sub-project 3** — Chat auto-translation (X-style: messages stored in original language, translated to viewer's preferred language on render). New backend integration (DeepL / Google Cloud Translation), per-message language column, viewer-side translate-on-render with caching, per-user "preferred translation language" setting, cost monitoring. ~6-9 working days. Brainstorm starts after sub-project 2 merges.

Each gets its own spec → plan → implementation cycle. This decomposition follows the brainstorming-skill rule: when a single ask spans multiple subsystems, break it apart.

---

## 12. Appendix — Referenced Files & Memories

- `docs/superpowers/specs/2026-04-20-anstoss-revamp-design.md` — parent spec (§5 is the source for this plan).
- `DESIGN.md` — design doctrine (Renuir, 2026-04-17).
- `CLAUDE.md` — engineering rules, commands.
- `apps/mobile/src/theme/` — token source of truth (colors.ts, typography.ts, spacing.ts, scale.ts).
- User memory `feedback_match_existing_patterns.md` — match existing app patterns; do not invent ornate new ones.
- User memory `feedback_anstoss_no_auto_push_release.md` — never push to `feat/revamp-release` before manual simulator approval.
- User memory `feedback_anstoss_splash.md` — splash screen is exempt from inline-string lint.
