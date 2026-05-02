# Anstoss Phase 4 Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the six Phase 4 polish passes (token drift, typography, spacing, hierarchy, copy, density) plus the precondition Phase 1 audit, mechanically where possible and by judgment where not, gated by ESLint rules that prevent regression.

**Architecture:** Seven strictly-serial PRs. Codemod scripts under `scripts/codemods/` for the mechanical passes (tokens, typography, spacing). New ESLint rules live in `eslint.config.mjs` (extending the existing `no-restricted-syntax` / `no-restricted-imports` blocks already there). Audit artifact under `docs/revamp/`. Each PR gates on `npm run lint && npm run typecheck && npm test`.

**Tech Stack:** Expo React Native (mobile app), TypeScript, jscodeshift (codemods), ESLint flat config, Jest, React Native Testing Library, Turborepo.

**Source spec:** `docs/superpowers/specs/2026-04-26-anstoss-phase4-polish-design.md`

---

## File Structure

### Created files

| Path | Responsibility |
|---|---|
| `docs/revamp/audit.md` | Audit artifact: one row per screen, rubric scoring, punch list. |
| `docs/revamp/screenshots/` | Light-mode screenshots, one per screen state. |
| `docs/revamp/screenshots-dark/` | Dark-mode screenshots (Phase 5 input). |
| `docs/revamp/screenshots-final/` | Post-polish light-mode screenshots (populated in Pass 6). |
| `docs/revamp/missing-primitives.md` | Components flagged for follow-up extraction. |
| `scripts/audit-coverage.ts` | CI script: every screen file appears as a row in `audit.md`. |
| `scripts/codemods/no-raw-colors-codemod.ts` | jscodeshift transform: literal hex/rgba → token. |
| `scripts/codemods/no-raw-spacing-codemod.ts` | jscodeshift transform: literal numeric padding/margin/gap/radius → SPACING_*/RADIUS_*. |
| `scripts/codemods/no-raw-text-codemod.ts` | jscodeshift transform: `import {Text} from 'react-native'` → primitive; inline typography style → `variant=`. |
| `scripts/codemods/__tests__/no-raw-colors-codemod.spec.ts` | Codemod unit tests. |
| `scripts/codemods/__tests__/no-raw-spacing-codemod.spec.ts` | Codemod unit tests. |
| `scripts/codemods/__tests__/no-raw-text-codemod.spec.ts` | Codemod unit tests. |
| `scripts/codemods/README.md` | Codemod usage instructions. |
| `apps/mobile/src/api/errorMessages.ts` | Backend `ApiError` class → user-facing message mapping. |
| `apps/mobile/src/api/__tests__/errorMessages.spec.ts` | errorMessages unit tests. |
| `codemod-report.md` | Per-pass report of off-tolerance values for human resolution (transient — committed under `docs/revamp/codemod-reports/<pass>.md` for record-keeping). |

### Modified files

| Path | Reason |
|---|---|
| `eslint.config.mjs` | Add `no-raw-spacing`, `text-must-have-variant`, `no-inline-strings` rules; tighten existing color/text rules' exception list. |
| `apps/mobile/src/components/ui/Text.tsx` | Verify pass-throughs (`numberOfLines`, `accessibilityLabel`, `style`, `testID`, `onPress`, `selectable`, `ellipsizeMode`); add any missing variants surfaced by the typography pass. |
| `apps/mobile/src/theme/spacing.ts` | Add new tokens for off-scale values that repeat ≥3 times. |
| `apps/mobile/src/theme/colors.ts` | Add new tokens for off-palette colors that repeat ≥3 times. |
| `apps/mobile/src/i18n/de.ts` | Sentence-case + actionable rewrite. |
| `apps/mobile/src/i18n/en.ts` | Same edits as de.ts (mirror). |
| `apps/mobile/src/i18n/fr.ts`, `pt.ts`, `it.ts` | Best-effort source-string updates; native-speaker QA deferred. |
| `apps/mobile/src/i18n/states.ts` | Complete the empty/error/loading copy library. |
| `apps/mobile/app/**/*.tsx` (~73 files) | Codemod-driven token / typography / spacing changes; manual hierarchy / density edits. |
| `apps/mobile/src/components/**/*.tsx` (~40 files) | Same as `app/**` for shared components. |

---

## PR 1 — Phase 1 Audit

### Task 1: Bootstrap audit doc structure

**Files:**
- Create: `docs/revamp/audit.md`
- Create: `docs/revamp/screenshots/.gitkeep`
- Create: `docs/revamp/screenshots-dark/.gitkeep`
- Create: `scripts/audit-coverage.ts`
- Create: `scripts/__tests__/audit-coverage.spec.ts`
- Modify: `package.json` (root) — add `"audit:coverage"` script.

- [ ] **Step 1: Write the failing test for the coverage checker**

```ts
// scripts/__tests__/audit-coverage.spec.ts
import { describe, it, expect } from '@jest/globals'
import { findMissingAuditRows } from '../audit-coverage'

describe('audit-coverage', () => {
  it('returns screen files that have no row in audit.md', () => {
    const screenFiles = [
      'apps/mobile/app/(tabs)/index.tsx',
      'apps/mobile/app/(tabs)/events/index.tsx',
      'apps/mobile/app/edit-profile.tsx',
    ]
    const auditMarkdown = `
| Screen | Tokens | Typography |
|---|---|---|
| apps/mobile/app/(tabs)/index.tsx | PASS | PASS |
| apps/mobile/app/edit-profile.tsx | FAIL | PASS |
`
    expect(findMissingAuditRows(screenFiles, auditMarkdown)).toEqual([
      'apps/mobile/app/(tabs)/events/index.tsx',
    ])
  })

  it('returns empty when every screen is covered', () => {
    const screenFiles = ['apps/mobile/app/sign-in.tsx']
    const auditMarkdown = '| apps/mobile/app/sign-in.tsx | PASS |'
    expect(findMissingAuditRows(screenFiles, auditMarkdown)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest scripts/__tests__/audit-coverage.spec.ts`
Expected: FAIL — "Cannot find module '../audit-coverage'".

- [ ] **Step 3: Implement coverage checker**

```ts
// scripts/audit-coverage.ts
import { readFileSync } from 'node:fs'
import { globSync } from 'glob'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const SCREEN_GLOB = 'apps/mobile/app/**/*.tsx'
const TEST_PATH_FRAGMENT = '__tests__'

export function findMissingAuditRows(
  screenFiles: string[],
  auditMarkdown: string,
): string[] {
  const eligibleScreens = screenFiles.filter(
    (path) => !path.includes(TEST_PATH_FRAGMENT) && !path.endsWith('_layout.tsx'),
  )
  return eligibleScreens.filter((path) => !auditMarkdown.includes(path))
}

export function listScreenFiles(): string[] {
  return globSync(SCREEN_GLOB, { cwd: ROOT })
}

export function runCoverageCheck(): { ok: boolean; missing: string[] } {
  const screens = listScreenFiles()
  const audit = readFileSync(join(ROOT, 'docs/revamp/audit.md'), 'utf8')
  const missing = findMissingAuditRows(screens, audit)
  return { ok: missing.length === 0, missing }
}

if (require.main === module) {
  const result = runCoverageCheck()
  if (!result.ok) {
    console.error('Audit missing rows for:')
    result.missing.forEach((path) => console.error('  -', path))
    process.exit(1)
  }
  console.log('Audit coverage: ok')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest scripts/__tests__/audit-coverage.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Create audit.md skeleton**

```markdown
<!-- docs/revamp/audit.md -->
# Anstoss Phase 4 — Screen Audit

Date: 2026-04-26
Method: §2 of `docs/superpowers/specs/2026-04-26-anstoss-phase4-polish-design.md`.

| Screen | Tokens | Typography | Spacing | Hierarchy | States | Copy | Density | Dark mode | A11y | Motion | Notes | Final |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

## Punch list

### P0 (blocks a flow)

### P1 (visual inconsistency)

### P2 (polish)
```

- [ ] **Step 6: Add npm script and gitkeeps**

Modify `package.json` scripts block — add: `"audit:coverage": "tsx scripts/audit-coverage.ts"`. Install `tsx` and `glob` as devDependencies if missing: `npm install -D tsx glob @types/glob`.

Create empty placeholder files:
```bash
touch docs/revamp/screenshots/.gitkeep
touch docs/revamp/screenshots-dark/.gitkeep
```

- [ ] **Step 7: Verify the coverage check fails the way we expect with empty audit**

Run: `npm run audit:coverage`
Expected: exits 1, prints all 73 screen file paths under `Audit missing rows for:`.

- [ ] **Step 8: Commit**

```bash
git add scripts/audit-coverage.ts scripts/__tests__/audit-coverage.spec.ts \
  docs/revamp/audit.md docs/revamp/screenshots/.gitkeep \
  docs/revamp/screenshots-dark/.gitkeep package.json package-lock.json
git commit -m "chore(revamp): bootstrap Phase 1 audit doc + coverage checker"
```

### Task 2: Walk every screen, capture screenshots, score audit rows

**Files:**
- Modify: `docs/revamp/audit.md` — populate one row per screen.
- Create: `docs/revamp/screenshots/{flow}-{screen}-{state}.png` (for each screen × applicable states).
- Create: `docs/revamp/screenshots-dark/{flow}-{screen}-{state}.png` (same but dark mode).

This task is observation work, not codable. Each step covers one flow-cluster. The implementer boots the simulator (per `CLAUDE.md` — `npm run dev` then iOS simulator), walks the routes for that role, captures screenshots, and scores the row by reading the file. **Scoring is observation only — no `.tsx` edits in this PR.**

The seven flow-clusters defined in the spec match the file system:

1. `(auth)` — sign-in, register/*, onboarding
2. `(tabs)/index` (role-aware home)
3. `(tabs)/events`, `event-*`, `create-event`
4. `(tabs)/chat`, `dm-*`
5. `(tabs)/roster`, `roster-aggregate`, `team-*`, `player-loan`, `transfer-list`
6. `(tabs)/more`, `edit-profile`, `notification-settings`, `my-contributions`, `my-team`
7. `admin-*`, `club-*`, `find-club`, `join*`, `invite`, `parent-schedule`, `pending-*`, `free-agent/*`, `fussball-link`, `stripe-connect`, `access-blocked`, `account-next-step`, `enter-dob`, `league-table`, `match-detail`

- [ ] **Step 1: Audit cluster 1 — `(auth)`**

Boot simulator: `npm run dev` then in another terminal `npm run ios -- --simulator="iPhone 15 Pro"`. Use the dev test phone `+15555550100` per `(auth)/done.tsx`. Walk: sign-in → role select → each registration branch → onboarding → done. Capture screenshots, naming each `auth-{screen}-{state}.png`. Score each screen's row using the rubric in spec §2.

After completing the cluster, run: `npm run audit:coverage` — verify the rows for this cluster's files are present.

Commit: `git add docs/revamp/{audit.md,screenshots,screenshots-dark}; git commit -m "audit(revamp): cluster 1 — (auth)"`.

- [ ] **Step 2: Audit cluster 2 — `(tabs)/index` (role-aware home)**

Activate each role via the dev `+15555550100` flow per `(auth)/done.tsx` `DEV_SCENARIO_BY_ROLE`. Capture the home for each role: `tabs-home-player-loaded.png`, `tabs-home-coach-loaded.png`, etc. Score each role's home as a separate row (label them `apps/mobile/app/(tabs)/index.tsx — PLAYER`, etc.).

Commit: `audit(revamp): cluster 2 — (tabs) home (role-aware)`.

- [ ] **Step 3: Audit cluster 3 — events**

Walk: `(tabs)/events` → `event-detail` → `event-attendance` → `create-event`. Capture loaded, empty, and (if reproducible) error states. Score rows.

Commit: `audit(revamp): cluster 3 — events`.

- [ ] **Step 4: Audit cluster 4 — chat / DM**

Walk: `(tabs)/chat` → `dm-list` → `dm-new` → `dm-chat`. Capture states.

Commit: `audit(revamp): cluster 4 — chat`.

- [ ] **Step 5: Audit cluster 5 — roster / team**

Walk: `(tabs)/roster` → each tab (squad / operations / medic / kit) → `roster-aggregate` → `team-management` → `team-matches` → `team-families` → `player-loan` → `transfer-list`. Capture states.

Commit: `audit(revamp): cluster 5 — roster + team`.

- [ ] **Step 6: Audit cluster 6 — more / profile**

Walk: `(tabs)/more` → `edit-profile` → `notification-settings` → `my-contributions` → `my-team`. Capture states.

Commit: `audit(revamp): cluster 6 — more`.

- [ ] **Step 7: Audit cluster 7 — admin + remaining**

Walk: every screen under `admin-*`, `club-*`, `find-club`, `join*`, `invite`, `parent-schedule`, `pending-*`, `free-agent/*`, `fussball-link`, `stripe-connect`, `access-blocked`, `account-next-step`, `enter-dob`, `league-table`, `match-detail`. Capture states.

Commit: `audit(revamp): cluster 7 — admin + remaining`.

- [ ] **Step 8: Compile punch list**

In `audit.md`, populate the P0 / P1 / P2 sections at the bottom by deduplicating findings across rows. Each entry: `- [ ] {file}:{line} — {issue}`. Sort within each priority by file path.

Run: `npm run audit:coverage` — must pass.
Run: `npm run lint && npm run typecheck && npm test` — must pass (no `.tsx` changes in this PR, so should be green from the start).

Commit: `audit(revamp): consolidate punch list`.

- [ ] **Step 9: Open PR `feat/revamp-audit`**

```bash
git push -u origin feat/revamp-audit
gh pr create --title "audit(revamp): Phase 1 — screen-by-screen audit + coverage script" --body "$(cat <<'EOF'
## Summary
- Adds `docs/revamp/audit.md` with rubric scores and `notes` for every screen file under `apps/mobile/app/**`.
- Adds `docs/revamp/screenshots/` (light) and `docs/revamp/screenshots-dark/` (dark) — one PNG per screen state.
- Adds `scripts/audit-coverage.ts` + `npm run audit:coverage` to fail CI if any screen file is missing from the audit.
- Doc-only PR, no `.tsx` changes.

## Test plan
- [ ] `npm run audit:coverage` passes locally.
- [ ] `npm run lint && npm run typecheck && npm test` passes (no code changes).
- [ ] Reviewer spot-checks 5 random screens against the screenshots.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## PR 2 — Pass 1: Token Drift

### Task 3: Build the colors codemod with TDD

**Files:**
- Create: `scripts/codemods/no-raw-colors-codemod.ts`
- Create: `scripts/codemods/__tests__/no-raw-colors-codemod.spec.ts`
- Create: `scripts/codemods/lib/colorMatcher.ts`
- Create: `scripts/codemods/lib/__tests__/colorMatcher.spec.ts`
- Create: `scripts/codemods/README.md`
- Modify: `package.json` (root) — add codemod runner scripts.

- [ ] **Step 1: Failing test for color matcher**

```ts
// scripts/codemods/lib/__tests__/colorMatcher.spec.ts
import { describe, it, expect } from '@jest/globals'
import { findNearestToken } from '../colorMatcher'

describe('findNearestToken', () => {
  it('matches an exact hex to the token name', () => {
    const tokens = { TEXT_PRIMARY: '#1A1C22', SURFACE: '#FFFFFF' }
    expect(findNearestToken('#1A1C22', tokens)).toEqual({
      name: 'TEXT_PRIMARY',
      deltaE: 0,
    })
  })

  it('matches within ΔE < 3 tolerance', () => {
    const tokens = { TEXT_PRIMARY: '#1A1C22' }
    const match = findNearestToken('#1B1D23', tokens)
    expect(match.name).toBe('TEXT_PRIMARY')
    expect(match.deltaE).toBeLessThan(3)
  })

  it('returns null when no token within tolerance', () => {
    const tokens = { SURFACE: '#FFFFFF' }
    expect(findNearestToken('#FF0000', tokens)).toBeNull()
  })

  it('handles rgba via the literal source', () => {
    const tokens = { SURFACE: '#FFFFFF' }
    expect(findNearestToken('rgba(255, 255, 255, 0.5)', tokens, { ignoreAlpha: true }))
      .toEqual({ name: 'SURFACE', deltaE: 0 })
  })
})
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx jest scripts/codemods/lib/__tests__/colorMatcher.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement color matcher**

```ts
// scripts/codemods/lib/colorMatcher.ts
type RGB = { r: number; g: number; b: number }

function parseHex(hex: string): RGB | null {
  const m = hex.match(/^#([0-9a-fA-F]{3,8})$/)
  if (!m) return null
  let s = m[1]
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  if (s.length === 6 || s.length === 8) {
    const r = parseInt(s.slice(0, 2), 16)
    const g = parseInt(s.slice(2, 4), 16)
    const b = parseInt(s.slice(4, 6), 16)
    return { r, g, b }
  }
  return null
}

function parseRgba(value: string): RGB | null {
  const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (!m) return null
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
}

function deltaE(a: RGB, b: RGB): number {
  // CIE76 simplified — sufficient for snap detection at the values we care about.
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return Math.sqrt(dr * dr * 0.5 + dg * dg + db * db * 0.7)
}

export type TokenMap = Record<string, string>

export function findNearestToken(
  literal: string,
  tokens: TokenMap,
  opts: { ignoreAlpha?: boolean; tolerance?: number } = {},
): { name: string; deltaE: number } | null {
  const tolerance = opts.tolerance ?? 3
  const target = parseHex(literal) ?? parseRgba(literal)
  if (!target) return null
  let best: { name: string; deltaE: number } | null = null
  for (const [name, value] of Object.entries(tokens)) {
    const candidate = parseHex(value)
    if (!candidate) continue
    const d = deltaE(target, candidate)
    if (best === null || d < best.deltaE) best = { name, deltaE: d }
  }
  if (!best) return null
  return best.deltaE <= tolerance ? best : null
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx jest scripts/codemods/lib/__tests__/colorMatcher.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Failing test for the codemod transform**

```ts
// scripts/codemods/__tests__/no-raw-colors-codemod.spec.ts
import { describe, it, expect } from '@jest/globals'
import jscodeshift from 'jscodeshift'
import transform from '../no-raw-colors-codemod'

const tokens = { TEXT_PRIMARY: '#1A1C22', SURFACE: '#FFFFFF' }

function run(input: string): { source: string; report: string[] } {
  const j = jscodeshift.withParser('tsx')
  const report: string[] = []
  const source = transform(
    { source: input, path: 'test.tsx' },
    { jscodeshift: j, j, stats: () => undefined, report: (line: string) => report.push(line) },
    { tokens, importPath: '../theme/colors' },
  )
  return { source: source ?? input, report }
}

describe('no-raw-colors-codemod', () => {
  it('replaces a hex literal with a token reference', () => {
    const { source } = run(`const a = { color: '#1A1C22' }`)
    expect(source).toContain('TEXT_PRIMARY')
    expect(source).not.toContain("'#1A1C22'")
  })

  it('inserts the import if missing', () => {
    const { source } = run(`const a = { color: '#1A1C22' }`)
    expect(source).toContain("from '../theme/colors'")
  })

  it('reports off-tolerance literals without changing the source', () => {
    const { source, report } = run(`const a = { color: '#FF0000' }`)
    expect(source).toContain("'#FF0000'")
    expect(report.some((line) => line.includes('#FF0000'))).toBe(true)
  })

  it('skips literals inside theme/ files (caller-supplied path filter)', () => {
    const j = jscodeshift.withParser('tsx')
    const out = transform(
      { source: `const a = { color: '#1A1C22' }`, path: 'apps/mobile/src/theme/colors.ts' },
      { jscodeshift: j, j, stats: () => undefined, report: () => undefined },
      { tokens, importPath: '../theme/colors' },
    )
    expect(out).toBeUndefined() // no change
  })
})
```

- [ ] **Step 6: Run test, verify failure**

Run: `npx jest scripts/codemods/__tests__/no-raw-colors-codemod.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement the codemod**

```ts
// scripts/codemods/no-raw-colors-codemod.ts
import type { API, FileInfo, Options, Transform } from 'jscodeshift'
import { findNearestToken, type TokenMap } from './lib/colorMatcher'

type CodemodOptions = {
  tokens: TokenMap
  importPath: string // resolved from the file path at runtime in CLI mode
}

const transform: Transform = (
  file: FileInfo,
  api: API & { report: (line: string) => void },
  options: Options & CodemodOptions,
) => {
  if (file.path.includes('/theme/')) return undefined
  const j = api.jscodeshift
  const root = j(file.source)
  const usedTokens = new Set<string>()
  let changed = false

  root.find(j.Literal).forEach((path) => {
    const value = path.node.value
    if (typeof value !== 'string') return
    if (!/^#[0-9a-fA-F]{3,8}$|^rgba?\(/.test(value)) return
    const match = findNearestToken(value, options.tokens)
    if (!match) {
      api.report(`${file.path}: off-tolerance literal "${value}"`)
      return
    }
    j(path).replaceWith(j.identifier(match.name))
    usedTokens.add(match.name)
    changed = true
  })

  if (changed && usedTokens.size > 0) {
    const hasImport = root
      .find(j.ImportDeclaration, { source: { value: options.importPath } })
      .size() > 0
    if (!hasImport) {
      const decl = j.importDeclaration(
        [...usedTokens].map((name) => j.importSpecifier(j.identifier(name))),
        j.literal(options.importPath),
      )
      root.get().node.program.body.unshift(decl)
    } else {
      root
        .find(j.ImportDeclaration, { source: { value: options.importPath } })
        .forEach((p) => {
          const existing = new Set(
            (p.node.specifiers ?? []).map((s) =>
              s.type === 'ImportSpecifier' ? s.imported.name : '',
            ),
          )
          for (const name of usedTokens) {
            if (!existing.has(name)) {
              p.node.specifiers!.push(j.importSpecifier(j.identifier(name)))
            }
          }
        })
    }
  }

  return changed ? root.toSource({ quote: 'single' }) : undefined
}

export default transform
```

- [ ] **Step 8: Run test, verify pass**

Run: `npx jest scripts/codemods/__tests__/no-raw-colors-codemod.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 9: Add CLI runner**

Append to `package.json` scripts:

```json
"codemod:colors": "jscodeshift -t scripts/codemods/no-raw-colors-codemod.ts --extensions=tsx --parser=tsx 'apps/mobile/app/**/*.tsx' 'apps/mobile/src/components/**/*.tsx'"
```

Install runtime deps if missing: `npm install -D jscodeshift @types/jscodeshift`.

- [ ] **Step 10: Write README**

```markdown
<!-- scripts/codemods/README.md -->
# Anstoss Codemods

Run individually:
- `npm run codemod:colors`
- `npm run codemod:spacing`
- `npm run codemod:text`

Each codemod logs off-tolerance values to `docs/revamp/codemod-reports/<pass>.md`.
After running, walk the report file and resolve each entry by hand.
```

- [ ] **Step 11: Commit**

```bash
git add scripts/codemods/no-raw-colors-codemod.ts \
  scripts/codemods/__tests__/no-raw-colors-codemod.spec.ts \
  scripts/codemods/lib/colorMatcher.ts \
  scripts/codemods/lib/__tests__/colorMatcher.spec.ts \
  scripts/codemods/README.md package.json package-lock.json
git commit -m "chore(revamp): no-raw-colors codemod + tests"
```

### Task 4: Run the colors codemod against each flow-cluster

**Files:**
- Modify: `apps/mobile/app/**/*.tsx` (~73 files), `apps/mobile/src/components/**/*.tsx` (~40 files).
- Create: `docs/revamp/codemod-reports/colors.md`.

For each cluster: run the codemod scoped to that cluster, hand-resolve any reported off-tolerance literals, run lint + tests + typecheck, commit.

- [ ] **Step 1: Cluster 1 — `(auth)`**

Run: `npx jscodeshift -t scripts/codemods/no-raw-colors-codemod.ts --extensions=tsx --parser=tsx 'apps/mobile/app/(auth)/**/*.tsx' 'apps/mobile/app/register/**/*.tsx' 'apps/mobile/app/onboarding.tsx'`

Append the codemod's stderr output to `docs/revamp/codemod-reports/colors.md` under heading `## Cluster 1 — (auth)`.

For each entry in the report: open the file, decide between (a) snap to nearest token, (b) add new token to `apps/mobile/src/theme/colors.ts` if value repeats ≥3 times, (c) `// eslint-disable-next-line no-restricted-syntax -- {reason}` only as documented edge case.

Run: `npm run lint --workspace @anstoss/mobile && npm run typecheck --workspace @anstoss/mobile && npm test --workspace @anstoss/mobile`. Expected: all green.

Commit: `refactor(revamp): token drift — colors — (auth)`.

- [ ] **Step 2: Cluster 2 — `(tabs)/index`**

Run codemod scoped to `apps/mobile/app/(tabs)/index.tsx` and `apps/mobile/src/components/home/**/*.tsx`. Resolve report entries. Run gates. Commit: `refactor(revamp): token drift — colors — home`.

- [ ] **Step 3: Cluster 3 — events**

Run codemod scoped to `apps/mobile/app/(tabs)/events/**` `apps/mobile/app/event-*.tsx` `apps/mobile/app/create-event.tsx`. Resolve report. Gates. Commit: `refactor(revamp): token drift — colors — events`.

- [ ] **Step 4: Cluster 4 — chat / DM**

Run codemod scoped to `apps/mobile/app/(tabs)/chat/**` `apps/mobile/app/dm-*.tsx`. Resolve. Gates. Commit: `refactor(revamp): token drift — colors — chat`.

- [ ] **Step 5: Cluster 5 — roster / team**

Run codemod scoped to `apps/mobile/app/(tabs)/roster/**` `apps/mobile/app/roster-aggregate.tsx` `apps/mobile/app/team-*.tsx` `apps/mobile/app/player-loan.tsx` `apps/mobile/app/transfer-list.tsx` `apps/mobile/app/match-detail.tsx` `apps/mobile/app/league-table.tsx`. Resolve. Gates. Commit: `refactor(revamp): token drift — colors — roster + team`.

- [ ] **Step 6: Cluster 6 — more / profile**

Run codemod scoped to `apps/mobile/app/(tabs)/more/**` `apps/mobile/app/edit-profile.tsx` `apps/mobile/app/notification-settings.tsx` `apps/mobile/app/my-contributions.tsx` `apps/mobile/app/my-team.tsx`. Resolve. Gates. Commit: `refactor(revamp): token drift — colors — more`.

- [ ] **Step 7: Cluster 7 — admin + remaining**

Run codemod scoped to `apps/mobile/app/admin-*.tsx` `apps/mobile/app/club-*.tsx` `apps/mobile/app/club/**` `apps/mobile/app/find-club.tsx` `apps/mobile/app/join*.tsx` `apps/mobile/app/join/**` `apps/mobile/app/invite.tsx` `apps/mobile/app/parent-schedule.tsx` `apps/mobile/app/pending-*.tsx` `apps/mobile/app/free-agent/**` `apps/mobile/app/fussball-link.tsx` `apps/mobile/app/stripe-connect.tsx` `apps/mobile/app/access-blocked.tsx` `apps/mobile/app/account-next-step.tsx` `apps/mobile/app/enter-dob.tsx`. Resolve. Gates. Commit: `refactor(revamp): token drift — colors — admin + remaining`.

- [ ] **Step 8: Shared components**

Run codemod scoped to `apps/mobile/src/components/**/*.tsx` (excluding `theme/`). Resolve. Gates. Commit: `refactor(revamp): token drift — colors — shared components`.

- [ ] **Step 9: Final lint sweep**

Run: `npm run lint && npm run typecheck && npm test` from repo root. Expected: all green. The existing `no-restricted-syntax` rule for hex literals (already in `eslint.config.mjs:65`) should now match zero violations across the targeted globs.

Commit: `chore(revamp): finalize colors codemod report` (only if `docs/revamp/codemod-reports/colors.md` has uncommitted updates).

### Task 5: Build the spacing codemod with TDD

**Files:**
- Create: `scripts/codemods/no-raw-spacing-codemod.ts`
- Create: `scripts/codemods/__tests__/no-raw-spacing-codemod.spec.ts`
- Create: `scripts/codemods/lib/spacingMatcher.ts`
- Create: `scripts/codemods/lib/__tests__/spacingMatcher.spec.ts`

- [ ] **Step 1: Failing test for spacing matcher**

```ts
// scripts/codemods/lib/__tests__/spacingMatcher.spec.ts
import { describe, it, expect } from '@jest/globals'
import { findNearestSpacingToken, SPACING_TOKENS } from '../spacingMatcher'

describe('findNearestSpacingToken', () => {
  it('matches exact value', () => {
    expect(findNearestSpacingToken(16, SPACING_TOKENS)).toEqual({
      name: 'SPACING_LG',
      delta: 0,
    })
  })

  it('matches within ±2px tolerance', () => {
    const r = findNearestSpacingToken(15, SPACING_TOKENS)
    expect(r?.name).toBe('SPACING_LG')
    expect(Math.abs(r!.delta)).toBeLessThanOrEqual(2)
  })

  it('returns null past tolerance', () => {
    expect(findNearestSpacingToken(7, SPACING_TOKENS, { tolerance: 1 })).toBeNull()
  })

  it('exempts 0 and 1', () => {
    expect(findNearestSpacingToken(0, SPACING_TOKENS)).toEqual({ name: '__exempt__', delta: 0 })
    expect(findNearestSpacingToken(1, SPACING_TOKENS)).toEqual({ name: '__exempt__', delta: 0 })
  })
})
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx jest scripts/codemods/lib/__tests__/spacingMatcher.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement spacing matcher**

```ts
// scripts/codemods/lib/spacingMatcher.ts
export const SPACING_TOKENS: Record<string, number> = {
  SPACING_XXS: 2,
  SPACING_XS: 4,
  SPACING_SM: 8,
  SPACING_MD: 12,
  SPACING_LG: 16,
  SPACING_XL: 20,
  SPACING_XXL: 24,
  SPACING_XXXL: 32,
  RADIUS_SM: 8,
  RADIUS_MD: 12,
  RADIUS_LG: 16,
  RADIUS_XL: 20,
}

const EXEMPT_VALUES = new Set([0, 1])

export function findNearestSpacingToken(
  value: number,
  tokens: Record<string, number>,
  opts: { tolerance?: number } = {},
): { name: string; delta: number } | null {
  if (EXEMPT_VALUES.has(value)) return { name: '__exempt__', delta: 0 }
  const tolerance = opts.tolerance ?? 2
  let best: { name: string; delta: number } | null = null
  for (const [name, val] of Object.entries(tokens)) {
    const delta = value - val
    if (best === null || Math.abs(delta) < Math.abs(best.delta)) {
      best = { name, delta }
    }
  }
  if (!best) return null
  return Math.abs(best.delta) <= tolerance ? best : null
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx jest scripts/codemods/lib/__tests__/spacingMatcher.spec.ts`
Expected: PASS.

- [ ] **Step 5: Failing test for spacing codemod**

```ts
// scripts/codemods/__tests__/no-raw-spacing-codemod.spec.ts
import { describe, it, expect } from '@jest/globals'
import jscodeshift from 'jscodeshift'
import transform from '../no-raw-spacing-codemod'

function run(input: string): { source: string; report: string[] } {
  const j = jscodeshift.withParser('tsx')
  const report: string[] = []
  const source = transform(
    { source: input, path: 'apps/mobile/app/test.tsx' },
    { jscodeshift: j, j, stats: () => undefined, report: (line: string) => report.push(line) },
    {},
  )
  return { source: source ?? input, report }
}

describe('no-raw-spacing-codemod', () => {
  it('replaces padding: 16 with SPACING_LG', () => {
    const { source } = run(`const s = StyleSheet.create({ a: { padding: 16 } })`)
    expect(source).toContain('SPACING_LG')
    expect(source).not.toMatch(/padding:\s*16/)
  })

  it('replaces gap: 8 with SPACING_SM', () => {
    const { source } = run(`const s = StyleSheet.create({ a: { gap: 8 } })`)
    expect(source).toContain('SPACING_SM')
  })

  it('leaves padding: 0 and padding: 1 untouched', () => {
    const { source } = run(`const s = StyleSheet.create({ a: { padding: 0, borderWidth: 1 } })`)
    expect(source).toContain('padding: 0')
    expect(source).toContain('borderWidth: 1')
  })

  it('reports off-tolerance values without rewriting', () => {
    const { source, report } = run(`const s = StyleSheet.create({ a: { padding: 7 } })`)
    expect(source).toContain('padding: 7')
    expect(report.some((line) => line.includes('padding: 7'))).toBe(true)
  })

  it('does not touch non-spacing properties', () => {
    const { source } = run(`const s = StyleSheet.create({ a: { flex: 1, opacity: 16 } })`)
    expect(source).toContain('flex: 1')
    expect(source).toContain('opacity: 16')
  })
})
```

- [ ] **Step 6: Run test, verify failure**

Run: `npx jest scripts/codemods/__tests__/no-raw-spacing-codemod.spec.ts`
Expected: FAIL.

- [ ] **Step 7: Implement spacing codemod**

```ts
// scripts/codemods/no-raw-spacing-codemod.ts
import type { API, FileInfo, Options, Transform } from 'jscodeshift'
import { findNearestSpacingToken, SPACING_TOKENS } from './lib/spacingMatcher'

const SPACING_PROPS = new Set([
  'padding',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingHorizontal',
  'paddingVertical',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'gap',
  'rowGap',
  'columnGap',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
])

const transform: Transform = (
  file: FileInfo,
  api: API & { report: (line: string) => void },
  _options: Options,
) => {
  if (file.path.includes('/theme/')) return undefined
  const j = api.jscodeshift
  const root = j(file.source)
  const used = new Set<string>()
  let changed = false

  root.find(j.Property).forEach((path) => {
    const key = path.node.key
    const keyName =
      key.type === 'Identifier' ? key.name : key.type === 'Literal' ? String(key.value) : null
    if (!keyName || !SPACING_PROPS.has(keyName)) return
    const value = path.node.value
    if (value.type !== 'Literal' && value.type !== 'NumericLiteral') return
    const num = (value as { value: unknown }).value
    if (typeof num !== 'number') return
    const match = findNearestSpacingToken(num, SPACING_TOKENS)
    if (!match) {
      api.report(`${file.path}: ${keyName}: ${num}`)
      return
    }
    if (match.name === '__exempt__') return
    j(path).replaceWith(j.property('init', j.identifier(keyName), j.identifier(match.name)))
    used.add(match.name)
    changed = true
  })

  if (changed && used.size > 0) {
    const importPath = '../../src/theme/spacing' // resolved per-file at CLI time
    const hasImport = root
      .find(j.ImportDeclaration, { source: { value: importPath } })
      .size() > 0
    if (!hasImport) {
      root.get().node.program.body.unshift(
        j.importDeclaration(
          [...used].map((n) => j.importSpecifier(j.identifier(n))),
          j.literal(importPath),
        ),
      )
    } else {
      root
        .find(j.ImportDeclaration, { source: { value: importPath } })
        .forEach((p) => {
          const existing = new Set(
            (p.node.specifiers ?? []).map((s) =>
              s.type === 'ImportSpecifier' ? s.imported.name : '',
            ),
          )
          for (const n of used)
            if (!existing.has(n)) p.node.specifiers!.push(j.importSpecifier(j.identifier(n)))
        })
    }
  }

  return changed ? root.toSource({ quote: 'single' }) : undefined
}

export default transform
```

- [ ] **Step 8: Run test, verify pass**

Run: `npx jest scripts/codemods/__tests__/no-raw-spacing-codemod.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 9: Commit**

```bash
git add scripts/codemods/no-raw-spacing-codemod.ts \
  scripts/codemods/__tests__/no-raw-spacing-codemod.spec.ts \
  scripts/codemods/lib/spacingMatcher.ts \
  scripts/codemods/lib/__tests__/spacingMatcher.spec.ts
git commit -m "chore(revamp): no-raw-spacing codemod + tests"
```

### Task 6: Run spacing codemod cluster-by-cluster

Same shape as Task 4 but with `scripts/codemods/no-raw-spacing-codemod.ts`. One commit per cluster: `refactor(revamp): token drift — spacing — {cluster}`. Off-tolerance entries logged to `docs/revamp/codemod-reports/spacing.md` for resolution in PR 4 (Pass 3 — Spacing judgment).

- [ ] **Step 1: Cluster 1 — `(auth)`** — run codemod scoped to auth glob, gates, commit.
- [ ] **Step 2: Cluster 2 — home** — same shape.
- [ ] **Step 3: Cluster 3 — events** — same shape.
- [ ] **Step 4: Cluster 4 — chat** — same shape.
- [ ] **Step 5: Cluster 5 — roster + team** — same shape.
- [ ] **Step 6: Cluster 6 — more** — same shape.
- [ ] **Step 7: Cluster 7 — admin + remaining** — same shape.
- [ ] **Step 8: Shared components** — same shape.

For each step: run `npx jscodeshift -t scripts/codemods/no-raw-spacing-codemod.ts --extensions=tsx --parser=tsx '<glob>'`, append the codemod stderr to `docs/revamp/codemod-reports/spacing.md`, run `npm run lint && npm run typecheck && npm test`, commit.

### Task 7: Add `no-raw-spacing` ESLint rule (warn-level)

**Files:**
- Modify: `eslint.config.mjs:60-90` — extend the `no-restricted-syntax` block in the section already targeting `apps/mobile/app/**` and `apps/mobile/src/**`.

- [ ] **Step 1: Add the rule entry**

In `eslint.config.mjs`, inside the `no-restricted-syntax` array of the rules block targeting mobile sources, append (alongside the existing hex / rgba / Pressable selectors):

```js
{
  selector:
    "Property[key.name=/^(padding|paddingTop|paddingBottom|paddingLeft|paddingRight|paddingHorizontal|paddingVertical|margin|marginTop|marginBottom|marginLeft|marginRight|marginHorizontal|marginVertical|gap|rowGap|columnGap|borderRadius|top|right|bottom|left|width|height|minWidth|minHeight|maxWidth|maxHeight)$/] > Literal[value!=0][value!=1]",
  message:
    'Raw spacing/sizing literals are not allowed. Use SPACING_*, RADIUS_*, or a dedicated token from src/theme.',
},
```

Set the rule severity for the whole `no-restricted-syntax` block to remain `'error'` (it already is); the new selector inherits.

- [ ] **Step 2: Run lint to confirm zero new violations**

Run: `npm run lint`. Expected: green. (Pass 1 codemod plus Cluster runs 1-7 should have eliminated all in-tolerance literals; off-tolerance ones appear in `codemod-reports/spacing.md` and will be resolved in PR 4.)

If lint fails, the failures are off-tolerance literals not yet addressed. Either: (a) advance them to PR 4 by suppressing with `// eslint-disable-next-line no-restricted-syntax -- TODO Pass 3`, or (b) fix in place if obvious.

> **NOTE:** the spec calls for staged severity (warn → error). The existing `no-restricted-syntax` block runs at error severity; rather than splitting the block, suppress unresolved entries in the calling sites for now and remove the suppressions in PR 4. Track every suppression in `docs/revamp/codemod-reports/spacing.md`.

- [ ] **Step 3: Commit**

```bash
git add eslint.config.mjs docs/revamp/codemod-reports/spacing.md
git commit -m "feat(revamp): no-raw-spacing lint rule — staged warn"
```

### Task 8: Open PR `feat/revamp-polish-tokens`

- [ ] **Step 1: Run full validation suite**

Run: `npm run lint && npm run typecheck && npm test && npm run build`. Expected: all green.

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin feat/revamp-polish-tokens
gh pr create --title "polish(revamp): Pass 1 — token drift" --body "$(cat <<'EOF'
## Summary
- Codemods replace raw hex / rgba and on-tolerance numeric spacing literals with tokens.
- Adds `no-raw-spacing` ESLint rule (extends existing `no-restricted-syntax` block).
- Off-tolerance values logged to `docs/revamp/codemod-reports/{colors,spacing}.md` — resolved in Pass 3.

## Test plan
- [ ] `npm run lint && npm run typecheck && npm test` green.
- [ ] Audit doc rows for Tokens axis updated to PASS for resolved entries.
- [ ] Reviewer spot-checks 3 random screenshots vs. post-codemod renders.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## PR 3 — Pass 2: Typography

### Task 9: Verify and extend the `Text` primitive

**Files:**
- Modify: `apps/mobile/src/components/ui/Text.tsx` — confirm pass-throughs.
- Modify: `apps/mobile/src/components/ui/__tests__/Text.spec.tsx` (create if missing) — assert each pass-through.

- [ ] **Step 1: Failing test for `numberOfLines`, `accessibilityLabel`, `style`, `testID`, `onPress`, `selectable`, `ellipsizeMode` pass-through**

```tsx
// apps/mobile/src/components/ui/__tests__/Text.spec.tsx
import { render } from '@testing-library/react-native'
import { Text } from '../Text'

describe('Text primitive', () => {
  it('forwards numberOfLines', () => {
    const { getByTestId } = render(
      <Text variant="body" numberOfLines={2} testID="t">hello</Text>,
    )
    expect(getByTestId('t').props.numberOfLines).toBe(2)
  })

  it('forwards accessibilityLabel', () => {
    const { getByLabelText } = render(
      <Text variant="body" accessibilityLabel="greeting">hello</Text>,
    )
    expect(getByLabelText('greeting')).toBeTruthy()
  })

  it('forwards onPress', () => {
    const onPress = jest.fn()
    const { getByText } = render(<Text variant="body" onPress={onPress}>hello</Text>)
    getByText('hello').props.onPress()
    expect(onPress).toHaveBeenCalled()
  })

  it('forwards ellipsizeMode', () => {
    const { getByTestId } = render(
      <Text variant="body" testID="t" ellipsizeMode="middle">hello</Text>,
    )
    expect(getByTestId('t').props.ellipsizeMode).toBe('middle')
  })

  it('forwards selectable', () => {
    const { getByTestId } = render(
      <Text variant="body" testID="t" selectable>hello</Text>,
    )
    expect(getByTestId('t').props.selectable).toBe(true)
  })

  it('forwards style override (color)', () => {
    const { getByTestId } = render(
      <Text variant="body" testID="t" style={{ color: 'red' }}>hello</Text>,
    )
    const flat = Array.isArray(getByTestId('t').props.style)
      ? Object.assign({}, ...getByTestId('t').props.style.flat())
      : getByTestId('t').props.style
    expect(flat.color).toBe('red')
  })
})
```

- [ ] **Step 2: Run test**

Run: `npm test --workspace @anstoss/mobile -- Text.spec.tsx`. If FAIL on any pass-through, edit `Text.tsx` to forward the missing prop. If all PASS, the primitive is already complete — proceed.

- [ ] **Step 3: Commit (only if Text.tsx changed)**

```bash
git add apps/mobile/src/components/ui/Text.tsx \
  apps/mobile/src/components/ui/__tests__/Text.spec.tsx
git commit -m "test(revamp): pin Text primitive pass-through contract"
```

### Task 10: Build the typography codemod with TDD

**Files:**
- Create: `scripts/codemods/no-raw-text-codemod.ts`
- Create: `scripts/codemods/__tests__/no-raw-text-codemod.spec.ts`
- Create: `scripts/codemods/lib/variantMatcher.ts`
- Create: `scripts/codemods/lib/__tests__/variantMatcher.spec.ts`

- [ ] **Step 1: Failing test for variant matcher**

```ts
// scripts/codemods/lib/__tests__/variantMatcher.spec.ts
import { describe, it, expect } from '@jest/globals'
import { findNearestVariant } from '../variantMatcher'

describe('findNearestVariant', () => {
  it('matches body 16 regular', () => {
    expect(
      findNearestVariant({
        fontFamily: 'DMSans_400Regular',
        fontSize: 16,
        lineHeight: 22,
      })?.name,
    ).toBe('body')
  })

  it('matches headline (medium 16) on weight tiebreak', () => {
    expect(
      findNearestVariant({
        fontFamily: 'DMSans_500Medium',
        fontSize: 16,
      })?.name,
    ).toBe('headline')
  })

  it('returns null when nothing within ±1 size step', () => {
    expect(
      findNearestVariant({ fontFamily: 'DMSans_400Regular', fontSize: 50 }),
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx jest scripts/codemods/lib/__tests__/variantMatcher.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement variant matcher**

```ts
// scripts/codemods/lib/variantMatcher.ts
type VariantSpec = {
  name: string
  fontFamily: string
  fontSize: number
}

// Apple-HIG variant names per apps/mobile/src/components/ui/Text.tsx
const VARIANTS: VariantSpec[] = [
  { name: 'largeTitle', fontFamily: 'DMSans_700Bold', fontSize: 32 },
  { name: 'title1', fontFamily: 'DMSans_700Bold', fontSize: 32 },
  { name: 'title2', fontFamily: 'DMSans_700Bold', fontSize: 24 },
  { name: 'title3', fontFamily: 'DMSans_700Bold', fontSize: 20 },
  { name: 'headline', fontFamily: 'DMSans_500Medium', fontSize: 16 },
  { name: 'body', fontFamily: 'DMSans_400Regular', fontSize: 16 },
  { name: 'callout', fontFamily: 'DMSans_500Medium', fontSize: 16 },
  { name: 'subheadline', fontFamily: 'DMSans_400Regular', fontSize: 14 },
  { name: 'footnote', fontFamily: 'DMSans_400Regular', fontSize: 14 },
  { name: 'caption1', fontFamily: 'DMSans_500Medium', fontSize: 12 },
  { name: 'caption2', fontFamily: 'DMSans_400Regular', fontSize: 10 },
  { name: 'data', fontFamily: 'GeistMono_400Regular', fontSize: 20 },
  { name: 'dataLarge', fontFamily: 'GeistMono_400Regular', fontSize: 32 },
]

export function findNearestVariant(
  style: { fontFamily?: string; fontSize?: number; lineHeight?: number },
): { name: string; sizeDelta: number } | null {
  const family = style.fontFamily ?? 'DMSans_400Regular'
  const size = style.fontSize ?? 16
  let best: { name: string; sizeDelta: number } | null = null
  for (const v of VARIANTS) {
    if (v.fontFamily !== family) continue
    const delta = Math.abs(v.fontSize - size)
    if (best === null || delta < best.sizeDelta) best = { name: v.name, sizeDelta: delta }
  }
  if (!best || best.sizeDelta > 1) return null
  return best
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx jest scripts/codemods/lib/__tests__/variantMatcher.spec.ts`
Expected: PASS.

- [ ] **Step 5: Failing test for typography codemod**

```ts
// scripts/codemods/__tests__/no-raw-text-codemod.spec.ts
import { describe, it, expect } from '@jest/globals'
import jscodeshift from 'jscodeshift'
import transform from '../no-raw-text-codemod'

function run(input: string): { source: string; report: string[] } {
  const j = jscodeshift.withParser('tsx')
  const report: string[] = []
  const out = transform(
    { source: input, path: 'apps/mobile/app/test.tsx' },
    { jscodeshift: j, j, stats: () => undefined, report: (line) => report.push(line) },
    {},
  )
  return { source: out ?? input, report }
}

describe('no-raw-text-codemod', () => {
  it('rewrites the import path', () => {
    const { source } = run(
      `import { Text, View } from 'react-native'\nexport const A = () => <Text>hi</Text>`,
    )
    expect(source).toContain("import { View } from 'react-native'")
    expect(source).toContain("from '../src/components/ui'")
  })

  it('adds variant="body" when no inline typography style', () => {
    const { source } = run(
      `import { Text } from 'react-native'\nexport const A = () => <Text>hi</Text>`,
    )
    expect(source).toContain('variant="body"')
  })

  it('snaps inline typography style to a variant prop and drops the inline style', () => {
    const { source } = run(
      `import { Text } from 'react-native'\nexport const A = () => <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 24 }}>hi</Text>`,
    )
    expect(source).toContain('variant="title2"')
    expect(source).not.toContain('fontSize: 24')
  })

  it('preserves color overrides on style', () => {
    const { source } = run(
      `import { Text } from 'react-native'\nexport const A = () => <Text style={{ color: 'red', fontSize: 16 }}>hi</Text>`,
    )
    expect(source).toContain('color')
    expect(source).toContain('variant="body"')
    expect(source).not.toContain('fontSize: 16')
  })

  it('reports unmatched typography', () => {
    const { source, report } = run(
      `import { Text } from 'react-native'\nexport const A = () => <Text style={{ fontSize: 50 }}>hi</Text>`,
    )
    expect(source).toContain('fontSize: 50')
    expect(report.some((l) => l.includes('fontSize: 50'))).toBe(true)
  })
})
```

- [ ] **Step 6: Run test, verify failure**

Run: `npx jest scripts/codemods/__tests__/no-raw-text-codemod.spec.ts`
Expected: FAIL.

- [ ] **Step 7: Implement typography codemod**

```ts
// scripts/codemods/no-raw-text-codemod.ts
import type { API, FileInfo, Options, Transform } from 'jscodeshift'
import { findNearestVariant } from './lib/variantMatcher'

const TYPOGRAPHY_KEYS = new Set([
  'fontFamily',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'fontWeight',
])

const transform: Transform = (
  file: FileInfo,
  api: API & { report: (line: string) => void },
  _options: Options,
) => {
  if (
    file.path.includes('/theme/') ||
    file.path.endsWith('/Text.tsx') ||
    file.path.endsWith('/Button.tsx') ||
    file.path.endsWith('/ScrollPicker.tsx')
  ) return undefined

  const j = api.jscodeshift
  const root = j(file.source)
  let changed = false
  let textImported = false

  // 1. Rewrite the import.
  root.find(j.ImportDeclaration, { source: { value: 'react-native' } }).forEach((path) => {
    const specs = path.node.specifiers ?? []
    const textSpec = specs.find(
      (s) => s.type === 'ImportSpecifier' && s.imported.name === 'Text',
    )
    if (!textSpec) return
    textImported = true
    path.node.specifiers = specs.filter((s) => s !== textSpec)
    if (path.node.specifiers.length === 0) j(path).remove()
    changed = true
  })

  if (textImported) {
    const uiImport = root
      .find(j.ImportDeclaration, { source: { value: '../src/components/ui' } })
    if (uiImport.size() === 0) {
      root.get().node.program.body.unshift(
        j.importDeclaration(
          [j.importSpecifier(j.identifier('Text'))],
          j.literal('../src/components/ui'),
        ),
      )
    } else {
      uiImport.forEach((p) => {
        const existing = (p.node.specifiers ?? []).some(
          (s) => s.type === 'ImportSpecifier' && s.imported.name === 'Text',
        )
        if (!existing) p.node.specifiers!.push(j.importSpecifier(j.identifier('Text')))
      })
    }
  }

  // 2. Walk JSX <Text> elements; map style→variant.
  root.find(j.JSXElement, { openingElement: { name: { name: 'Text' } } }).forEach((path) => {
    const open = path.node.openingElement
    const styleAttr = open.attributes?.find(
      (a) => a.type === 'JSXAttribute' && a.name.name === 'style',
    ) as
      | (jscodeshift.JSXAttribute & { value: jscodeshift.JSXExpressionContainer | null })
      | undefined
    const variantAttr = open.attributes?.find(
      (a) => a.type === 'JSXAttribute' && a.name.name === 'variant',
    )
    if (variantAttr) return

    let variant: string = 'body'
    let leftover: jscodeshift.ObjectExpression | null = null

    if (
      styleAttr?.value?.type === 'JSXExpressionContainer' &&
      styleAttr.value.expression.type === 'ObjectExpression'
    ) {
      const obj = styleAttr.value.expression
      const typoProps: Record<string, unknown> = {}
      const otherProps: jscodeshift.ObjectExpression['properties'] = []
      for (const prop of obj.properties) {
        if (
          prop.type === 'Property' &&
          prop.key.type === 'Identifier' &&
          TYPOGRAPHY_KEYS.has(prop.key.name) &&
          (prop.value.type === 'Literal' || prop.value.type === 'NumericLiteral')
        ) {
          typoProps[prop.key.name] = (prop.value as { value: unknown }).value
        } else {
          otherProps.push(prop)
        }
      }
      const match = findNearestVariant(typoProps as Record<string, never>)
      if (!match) {
        api.report(
          `${file.path}: unmatched typography ${JSON.stringify(typoProps)}`,
        )
      } else {
        variant = match.name
        if (otherProps.length > 0) {
          leftover = j.objectExpression(otherProps)
        }
        if (leftover) {
          styleAttr.value = j.jsxExpressionContainer(leftover)
        } else {
          open.attributes = open.attributes!.filter((a) => a !== styleAttr)
        }
      }
    }

    open.attributes = [
      ...(open.attributes ?? []),
      j.jsxAttribute(j.jsxIdentifier('variant'), j.literal(variant)),
    ]
    changed = true
  })

  return changed ? root.toSource({ quote: 'single' }) : undefined
}

export default transform
```

- [ ] **Step 8: Run test, verify pass**

Run: `npx jest scripts/codemods/__tests__/no-raw-text-codemod.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 9: Commit**

```bash
git add scripts/codemods/no-raw-text-codemod.ts \
  scripts/codemods/__tests__/no-raw-text-codemod.spec.ts \
  scripts/codemods/lib/variantMatcher.ts \
  scripts/codemods/lib/__tests__/variantMatcher.spec.ts
git commit -m "chore(revamp): no-raw-text codemod + tests"
```

### Task 11: Run typography codemod cluster-by-cluster

Same shape as Tasks 4 / 6. One commit per cluster: `refactor(revamp): typography — {cluster}`. Off-match entries logged to `docs/revamp/codemod-reports/typography.md`.

- [ ] **Steps 1-8: Apply codemod to clusters 1-7 + shared components, gates after each, commit per cluster.**

Run shape: `npx jscodeshift -t scripts/codemods/no-raw-text-codemod.ts --extensions=tsx --parser=tsx '<cluster glob>'`. Append codemod stderr to `docs/revamp/codemod-reports/typography.md` under the cluster heading. Run `npm run lint && npm run typecheck && npm test` per cluster.

For unmatched entries: open the file, decide between (a) extend `TextStyles` in `Text.tsx` if recurring (≥3 occurrences) and re-run codemod, (b) hand-set `variant=` to the closest existing variant and accept the visual delta, (c) leave as inline style with `// eslint-disable-next-line text-must-have-variant -- {reason}` for documented edge cases.

### Task 12: Add `text-must-have-variant` ESLint rule

**Files:**
- Modify: `eslint.config.mjs` — add to `no-restricted-syntax` block.

- [ ] **Step 1: Add rule entry**

```js
{
  selector:
    "JSXOpeningElement[name.name='Text']:not(:has(JSXAttribute[name.name='variant']))",
  message:
    'Text from src/components/ui requires variant="…". See Text.tsx for the variant set.',
},
```

- [ ] **Step 2: Run lint to confirm zero violations**

Run: `npm run lint`. Expected: green.

- [ ] **Step 3: Commit**

```bash
git add eslint.config.mjs
git commit -m "feat(revamp): text-must-have-variant lint rule"
```

### Task 13: Open PR `feat/revamp-polish-typography`

- [ ] **Step 1: Run validation**

Run: `npm run lint && npm run typecheck && npm test && npm run build`. Expected: all green.

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin feat/revamp-polish-typography
gh pr create --title "polish(revamp): Pass 2 — typography" --body "$(cat <<'EOF'
## Summary
- Codemod replaces `import { Text } from 'react-native'` with the `Text` primitive across all screens and shared components.
- Inline typography styles snapped to `variant=` props.
- Adds `text-must-have-variant` lint rule.

## Test plan
- [ ] `npm run lint && npm run typecheck && npm test` green.
- [ ] Audit doc Typography column updated to PASS for resolved entries.
- [ ] Reviewer spot-checks 3 random screens — no visible font regressions.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## PR 4 — Pass 3: Spacing (judgment)

### Task 14: Resolve the off-tolerance spacing backlog

**Files:**
- Modify: `apps/mobile/app/**/*.tsx`, `apps/mobile/src/components/**/*.tsx` — fix entries from `docs/revamp/codemod-reports/spacing.md`.
- Modify: `apps/mobile/src/theme/spacing.ts` — add new tokens for ≥3-occurrence values.

The spec rule: snap to nearest token (accept delta), or add new token only if value repeats ≥3 times. No new edge-case suppressions in this pass.

- [ ] **Step 1: Sort the backlog by value**

Open `docs/revamp/codemod-reports/spacing.md`. Group entries by the literal numeric value across files. Any value appearing ≥3 times is a candidate for a new token.

- [ ] **Step 2: Add new tokens (if any meet the ≥3 threshold)**

For each value passing the threshold, add to `apps/mobile/src/theme/spacing.ts`:

```ts
// example — only add if the value appears 3+ times in the report
export const SPACING_22 = ms(22) // off-scale token, 5 occurrences in report
```

Then update `findNearestSpacingToken`'s `SPACING_TOKENS` (in `scripts/codemods/lib/spacingMatcher.ts`) to include the new entry, re-run the codemod scoped to those entries' files.

Commit: `feat(revamp): add SPACING_X tokens for recurring off-scale values`.

- [ ] **Step 3: Per-cluster snap pass**

For each cluster (1-7 + shared components):
1. Open each entry from the report under that cluster.
2. Replace the literal with the closest token (`findNearestSpacingToken` with tolerance bumped to ±4 for this manual pass).
3. Note the visual delta in the audit row's notes column.
4. Run `npm run lint && npm run typecheck && npm test`.
5. Commit: `refactor(revamp): spacing — snap off-scale — {cluster}`.

### Task 15: Screen-root padding sweep

**Files:**
- Modify: `apps/mobile/app/**/*.tsx` — every screen's outer container.

Per spec §5: every screen's outer container uses `paddingHorizontal: SCREEN_PADDING` (cards `padding: CARD_PADDING`, forms `paddingHorizontal: BODY_PADDING`).

- [ ] **Step 1: Audit screens for non-conformant root padding**

Search for the existing root pattern by running:

```bash
npx grep -rEn 'paddingHorizontal:\s*(space|SCREEN_PADDING|SPACING)' apps/mobile/app
```

Walk each screen file's outer `View`. If `paddingHorizontal` is anything other than `SCREEN_PADDING` (or `BODY_PADDING` for explicit form screens), update.

- [ ] **Step 2: Apply fixes per cluster**

For each cluster: edit each screen's root container to use `SCREEN_PADDING`. For forms (where the existing pattern is `BODY_PADDING`), keep that. Note the file in audit.md notes column.

Run gates after each cluster. Commit: `refactor(revamp): screen-root padding — {cluster}`.

### Task 16: Touch-target heights

**Files:**
- Modify: any `<Pressable>` or `<TouchableOpacity>` lacking `minHeight: 44` in screen / shared component files.

- [ ] **Step 1: Detect**

Run:

```bash
npx grep -rEn '<(Pressable|TouchableOpacity)' apps/mobile/app apps/mobile/src/components > /tmp/touch-targets.txt
```

Walk each match in `/tmp/touch-targets.txt`. For each: open the file, find the `style` of that `Pressable` / `TouchableOpacity`. Skip if `minHeight: 44` is present, or if it's wrapped by `Button` / `IconButton` / `ListRow` (those primitives enforce the minimum already).

- [ ] **Step 2: Fix**

For each non-conformant touch target, add `minHeight: 44` to the style. Where the `Pressable` is in a custom layout that explicitly needs to be smaller (chip rows etc.), instead set `hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}` so the visual remains compact but the touchable region meets the 44pt minimum.

Run gates. Commit: `refactor(revamp): touch-target minimums`.

### Task 17: Upgrade `no-raw-spacing` to error severity

**Files:**
- Modify: `eslint.config.mjs` — remove any `eslint-disable` suppressions added in PR 2 Task 7.

- [ ] **Step 1: Sweep suppressions**

Run:

```bash
npx grep -rln 'TODO Pass 3' apps/mobile
```

For each file: walk the suppression, fix the underlying value (snap to token), remove the comment.

- [ ] **Step 2: Verify lint clean**

Run: `npm run lint`. Expected: green, with no `eslint-disable -- TODO Pass 3` comments remaining.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile docs/revamp/codemod-reports/spacing.md
git commit -m "feat(revamp): no-raw-spacing — finalize at error severity"
```

### Task 18: Open PR `feat/revamp-polish-spacing`

- [ ] **Step 1: Run validation**

Run: `npm run lint && npm run typecheck && npm test && npm run build`. Expected: all green.

- [ ] **Step 2: Push + open PR**

```bash
git push -u origin feat/revamp-polish-spacing
gh pr create --title "polish(revamp): Pass 3 — spacing" --body "Resolves Pass 1 off-tolerance backlog, screen-root padding consistency, touch-target minimums."
```

---

## PR 5 — Pass 4: Hierarchy (judgment)

### Task 19: Per-cluster hierarchy pass

**Files:**
- Modify: every screen flagged `Hierarchy: FAIL` in `docs/revamp/audit.md`.
- Possibly modify: `docs/revamp/missing-primitives.md` (log any missing primitives).

This pass has no codemod. Each step is a per-screen judgment call. The implementer:

1. Opens the screen file.
2. Reads the audit row notes.
3. Applies the heuristics from spec §6 in order.
4. Captures before / after screenshots into `docs/revamp/screenshots/{flow}-{screen}-{state}.before.png` / `.after.png`.
5. Updates the audit row: `Hierarchy: FAIL` → `PASS`, appends justification to the `notes` column.

Heuristics checklist applied per screen (paste into commit body for traceability):

> 1. **Primary CTA dominance** — one filled, full-width-or-near, primary-color CTA. Demote others to outlined / text.
> 2. **Section weight** — hero / next-up at top viewport. Lists below. Admin shortcuts at the bottom or in a separate section.
> 3. **Empty-state CTA absorption** — when a list is empty AND the user is supposed to act, the empty state's CTA becomes the screen's primary CTA — no double-CTA.
> 4. **Chrome muted** — `TabScreenHeader`, search bars, filter rows: muted styling.
> 5. **Status badges neutral by default** — color (success/warning/error) reserved for actual semantic state.

Concrete examples (from screens flagged in the user's screenshots):

- [ ] **Step 1: `(tabs)/roster/index.tsx`**

Per the conversation context, the squad/operations action buttons have already been refactored from squeezed-into-`memberCopy` to a full-width row beneath the header. Apply heuristic 1: of the two buttons (`markNew` / `markInactive`, or `markActive` / `markInactive`), the constructive action is primary (filled, club primary), the secondary is outlined. Apply heuristic 5: the trial/new/inactive `StatusBadge` `tone='neutral'` already; verify no false-positive uses of `warning` / `danger` in the row UI.

After: capture `tabs-roster-squad-loaded.after.png`. Update audit row. Commit: `polish(revamp): hierarchy — roster`.

- [ ] **Step 2: `(tabs)/events/index.tsx`**

The events tab today shows a list with possibly multiple action affordances. Apply heuristic 1: a single primary "Create event" CTA visible only when the user has the role to create. Demote any secondary affordances. Apply heuristic 3: empty-state CTA absorbs the create action.

Capture `tabs-events-loaded.after.png`. Update audit. Commit: `polish(revamp): hierarchy — events`.

- [ ] **Step 3: `(tabs)/more/index.tsx`**

The more tab today shows three sections + sign-out. Apply heuristic 4: profile row at top is the visual anchor — confirm it dominates. Sections below muted (already are — section captions in `textTertiary`). Sign-out is a destructive secondary at the bottom (already is). Confirm there's only one primary affordance per visual row.

Capture `tabs-more-loaded.after.png`. Update audit. Commit: `polish(revamp): hierarchy — more`.

- [ ] **Step 4: Iterate every remaining `Hierarchy: FAIL` row**

For each row: open file, apply heuristics, screenshot, audit, commit. Group commits by cluster — one commit per cluster of related screens (e.g., one commit covers admin-dashboard + admin-billing + admin-members). Each commit ends with: `npm run lint && npm run typecheck && npm test` clean.

If a heuristic requires a primitive that doesn't exist, append to `docs/revamp/missing-primitives.md` and either:
- Build the primitive in this PR if it unblocks ≥3 screens (separate commit: `feat(revamp): add {Primitive} primitive`).
- Defer with a note in the audit row.

### Task 20: Open PR `feat/revamp-polish-hierarchy`

- [ ] **Step 1: Run validation**

Run: `npm run lint && npm run typecheck && npm test && npm run build`. Expected: all green.

- [ ] **Step 2: Push + open PR**

```bash
git push -u origin feat/revamp-polish-hierarchy
gh pr create --title "polish(revamp): Pass 4 — hierarchy" --body "Per-screen primary-CTA dominance, section weight, empty-state CTA absorption, chrome muting, badge tone discipline."
```

---

## PR 6 — Pass 5: Copy

### Task 21: i18n catalog sweep — `de.ts` + `en.ts`

**Files:**
- Modify: `apps/mobile/src/i18n/de.ts` (~1582 lines).
- Modify: `apps/mobile/src/i18n/en.ts` (~1572 lines).
- Modify: `apps/mobile/src/i18n/states.ts` (complete the empty / loading / error library).

- [ ] **Step 1: Sentence-case + actionable rewrite of `de.ts`**

Walk every key-value pair. Apply:
- Sentence case (proper nouns excepted).
- Verb-first CTAs (`Speichern`, `Einladen`, `Mitglieder hinzufügen`).
- Error messages: cause + remedy + action.
- Drop filler (`Bitte`, `Entschuldigung`, `Hoppla!`).
- ICU plurals where `${count}` patterns exist.

Commit: `chore(revamp): copy — de.ts sentence-case + actionable rewrite`.

- [ ] **Step 2: Mirror to `en.ts`**

Walk same keys, apply same rules in English. The two files MUST stay key-aligned (no key in one without a partner in the other). Add a CI script:

`scripts/i18n-key-coverage.ts` that imports both files and asserts `Object.keys(de).sort() === Object.keys(en).sort()`. Add to `package.json`: `"i18n:keys": "tsx scripts/i18n-key-coverage.ts"`.

Run: `npm run i18n:keys`. Expected: green.

Commit: `chore(revamp): copy — en.ts mirror + key-coverage script`.

- [ ] **Step 3: Best-effort `fr.ts` / `pt.ts` / `it.ts` source-string updates**

For each file: walk keys whose source strings changed in steps 1-2. Update translations to match the new source semantics (LLM-best-effort). Sub-project 2 owns the native-speaker QA pass — call it out in the commit message and add a `// TODO(sub-project-2): native-speaker review` comment to the file header.

Run: `npm run i18n:keys`. Expected: green.

Commit: `chore(revamp): copy — fr/pt/it best-effort updates (native-speaker QA deferred)`.

- [ ] **Step 4: Complete `states.ts`**

Per spec §4.4 from the parent revamp: every empty / loading / error scenario gets `title` + `body` + (when applicable) `cta`. Walk every screen using `EmptyState` / `ErrorState` / `LoadingBoundary`. Confirm a key exists in `states.ts`; add if missing. Ensure both `de.ts` and `en.ts` carry the keys.

Run gates. Commit: `chore(revamp): copy — states copy library complete`.

### Task 22: Inline-string extraction + `no-inline-strings` ESLint rule

**Files:**
- Modify: `eslint.config.mjs` — add the rule.
- Modify: any screen / shared component file with inline JSX strings.

- [ ] **Step 1: Add the rule (warn-level initially)**

In `eslint.config.mjs`, add to the `no-restricted-syntax` block:

```js
{
  selector:
    "JSXText[value=/[A-Za-z]{2,}/]",
  message:
    'Inline strings are not allowed in JSX. Use t(...) with a key from src/i18n/.',
},
```

Run: `npm run lint`. Capture every violation to `docs/revamp/codemod-reports/inline-strings.md`.

Commit: `chore(revamp): no-inline-strings — capture violations`.

- [ ] **Step 2: Per-cluster extraction**

For each cluster: walk the violations in `inline-strings.md`. For each:
1. Choose a key namespace + name (e.g., `'roster.squad.markNewCta'`).
2. Add to `de.ts` (German source) and `en.ts` (mirror).
3. Replace the JSX inline with `{t('roster.squad.markNewCta')}`.

Run gates. Commit per cluster: `polish(revamp): copy — inline-strings — {cluster}`.

- [ ] **Step 3: Lock the rule at error severity**

Once all clusters are clean, the `no-restricted-syntax` block already runs at error — no severity flip needed. Re-run `npm run lint` to confirm zero violations.

Commit: `chore(revamp): no-inline-strings — verified zero violations`.

### Task 23: Error-message audit + `errorMessages.ts`

**Files:**
- Create: `apps/mobile/src/api/errorMessages.ts`
- Create: `apps/mobile/src/api/__tests__/errorMessages.spec.ts`
- Modify: every screen calling `Alert.alert` / `setError` / `console.warn` with a user-surfaceable error.

- [ ] **Step 1: Failing test**

```ts
// apps/mobile/src/api/__tests__/errorMessages.spec.ts
import { describe, it, expect } from '@jest/globals'
import { messageForError } from '../errorMessages'
import { ApiError } from '../client'

describe('messageForError', () => {
  it('maps a 401 ApiError to a sign-in message key', () => {
    const e = new ApiError({ status: 401, message: 'Unauthorized' })
    expect(messageForError(e)).toBe('errors.unauthorized')
  })

  it('maps a 5xx ApiError to a generic server-error key', () => {
    const e = new ApiError({ status: 503, message: 'Service Unavailable' })
    expect(messageForError(e)).toBe('errors.server')
  })

  it('falls back to errors.generic for unknown errors', () => {
    expect(messageForError(new Error('boom'))).toBe('errors.generic')
  })

  it('respects a named ApiError class for specific copy', () => {
    const e = new ApiError({ status: 422, code: 'TEAM_CODE_NOT_FOUND' })
    expect(messageForError(e)).toBe('errors.teamCodeNotFound')
  })
})
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm test --workspace @anstoss/mobile -- errorMessages.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `messageForError`**

```ts
// apps/mobile/src/api/errorMessages.ts
import { ApiError } from './client'

const CODE_TABLE: Record<string, string> = {
  TEAM_CODE_NOT_FOUND: 'errors.teamCodeNotFound',
  INVITE_EXPIRED: 'errors.inviteExpired',
  INVITE_ALREADY_USED: 'errors.inviteAlreadyUsed',
  PARENT_APPROVAL_PENDING: 'errors.parentApprovalPending',
  // extend as the audit surfaces new codes
}

export function messageForError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code && CODE_TABLE[err.code]) return CODE_TABLE[err.code]
    if (err.status === 401) return 'errors.unauthorized'
    if (err.status === 403) return 'errors.forbidden'
    if (err.status === 404) return 'errors.notFound'
    if (err.status >= 500) return 'errors.server'
    return 'errors.generic'
  }
  return 'errors.generic'
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm test --workspace @anstoss/mobile -- errorMessages.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Per-cluster Alert.alert sweep**

Run:

```bash
npx grep -rEn "Alert\.alert\([^)]*\)" apps/mobile/app apps/mobile/src/components > /tmp/alerts.txt
```

For each match: replace any direct error message with `Alert.alert(t('common.error'), t(messageForError(err)))`. Confirm the keys exist in `de.ts` + `en.ts`; add if missing.

Per cluster: gates + commit `polish(revamp): copy — error messaging — {cluster}`.

- [ ] **Step 6: Verify no raw error strings in user-facing copy**

Run:

```bash
npx grep -rEn "Failed to|error:|500|401|404" apps/mobile/app apps/mobile/src/components | grep -v __tests__ | grep -v ".spec." | grep -v "// "
```

Expected: zero matches in JSX text or `Alert.alert` calls. Any remaining matches: fix and commit.

Commit: `polish(revamp): copy — eliminate raw error strings`.

### Task 24: Open PR `feat/revamp-polish-copy`

- [ ] **Step 1: Run validation**

Run: `npm run lint && npm run typecheck && npm test && npm run i18n:keys && npm run build`. Expected: all green.

- [ ] **Step 2: Push + open PR**

```bash
git push -u origin feat/revamp-polish-copy
gh pr create --title "polish(revamp): Pass 5 — copy" --body "Sentence-case + actionable rewrite for de/en, best-effort fr/pt/it (native-speaker QA in sub-project 2), no-inline-strings rule, errorMessages.ts."
```

---

## PR 7 — Pass 6: Density

### Task 25: Per-screen density check

**Files:**
- Modify: every screen flagged `Density: FAIL` in `docs/revamp/audit.md`.

Heuristics checklist (paste into commit body):

> 1. Screen-root section gap: `SPACING_XL` standard, `SPACING_LG` compact.
> 2. Card internal: `padding: CARD_PADDING`, child `gap: SPACING_SM | SPACING_MD`. > 6 child rows → divider / sub-section header / chunking.
> 3. Lists > 8 rows: paginate, lazy-load, or sticky section header.
> 4. Header → first-content gap: `SPACING_LG`.
> 5. Form field rhythm: `gap: SPACING_LG` between fields, `SPACING_XS` for help text below input.
> 6. Empty / error / loading state composition: enough breathing room around the centered block (`paddingVertical: SPACING_XXL` minimum).

- [ ] **Step 1: Iterate flagged screens, per cluster**

For each cluster's flagged rows: apply heuristics 1-6, capture before / after, update audit, commit. One commit per cluster: `polish(revamp): density — {cluster}`. Each commit ends `npm run lint && npm run typecheck && npm test` clean.

### Task 26: Cross-cutting bottom-padding sweep

**Files:**
- Modify: every screen using `paddingBottom` for the tab-bar clearance.

Per spec §8: every scrollable content uses `paddingBottom: TAB_BAR_CLEARANCE + SPACING_LG`.

- [ ] **Step 1: Detect**

```bash
npx grep -rEn 'paddingBottom.*TAB_BAR_CLEARANCE' apps/mobile/app
```

For each match where `paddingBottom` is `TAB_BAR_CLEARANCE` alone (no `+ SPACING_LG`), update.

- [ ] **Step 2: Fix**

Replace `paddingBottom: TAB_BAR_CLEARANCE` with `paddingBottom: TAB_BAR_CLEARANCE + SPACING_LG`. Wherever the offset is intentional (e.g., the chat input row already accounts for it elsewhere), document in audit.md notes and skip.

Run gates. Commit: `refactor(revamp): density — bottom-padding sweep`.

### Task 27: Final screenshot set

**Files:**
- Create: `docs/revamp/screenshots-final/{flow}-{screen}-{state}.png` for every screen.

- [ ] **Step 1: Walk every screen one more time**

For each flow-cluster, boot the simulator (light mode only — Phase 5 owns dark mode), walk the screens, capture into `docs/revamp/screenshots-final/`. Update each audit row's `final-state` column with the screenshot path.

Commit per cluster: `audit(revamp): final screenshots — {cluster}`.

- [ ] **Step 2: Verify audit doc completeness**

Run: `npm run audit:coverage`. Expected: green.

Manually verify every audit row has its `Hierarchy / Tokens / Typography / Spacing / Copy / Density` columns marked `PASS`, with the noted exception of any explicit `N/A` or deferred entries documented in the row notes. The `States` axis on rows where applicable shows `PASS` per the narrower Phase 4 definition (catalog clean + composition consistent — see spec §1).

Commit: `audit(revamp): finalize Phase 4 audit doc`.

### Task 28: Open PR `feat/revamp-polish-density`

- [ ] **Step 1: Run validation**

Run: `npm run lint && npm run typecheck && npm test && npm run i18n:keys && npm run audit:coverage && npm run build`. Expected: all green.

- [ ] **Step 2: TestFlight smoke**

Per memory `feedback_anstoss_no_auto_push_release.md`: do not push to `feat/revamp-release` until manual simulator approval. Walk every cluster's primary path in the simulator one final time. Note any regressions in the PR description, fix, recommit, re-validate.

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/revamp-polish-density
gh pr create --title "polish(revamp): Pass 6 — density + final audit" --body "$(cat <<'EOF'
## Summary
- Per-screen density rhythm (section gap, card padding, list pagination, header spacing, form field rhythm).
- Cross-cutting bottom-padding sweep (`TAB_BAR_CLEARANCE + SPACING_LG`).
- Final screenshot set in `docs/revamp/screenshots-final/`.
- Audit doc finalized — every screen `PASS` on Phase 4 axes.

## Test plan
- [ ] `npm run lint && npm run typecheck && npm test && npm run i18n:keys && npm run audit:coverage && npm run build` — green.
- [ ] Simulator walk of every cluster's primary path — no regressions.
- [ ] Reviewer compares 5 random `screenshots/{flow}-…before.png` vs. `screenshots-final/{flow}-…after.png`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review (filled in inline by the writer)

**1. Spec coverage:**
- §1 Goal & Scope → covered by every PR producing the listed artifacts.
- §2 Phase 1 audit → PR 1, Tasks 1-2.
- §3 Pass 1 token drift → PR 2, Tasks 3-8.
- §4 Pass 2 typography → PR 3, Tasks 9-13.
- §5 Pass 3 spacing → PR 4, Tasks 14-18.
- §6 Pass 4 hierarchy → PR 5, Tasks 19-20.
- §7 Pass 5 copy → PR 6, Tasks 21-24.
- §8 Pass 6 density → PR 7, Tasks 25-28.
- §9 PR inventory → matches PRs 1-7.
- §10 risks → mitigations baked into per-task gates.
- §11 sub-project decomposition → handled by scope-out language; sub-projects 2 & 3 brainstormed separately.

**2. Placeholder scan:**
- No "TODO" / "TBD" / "fill in details" / "similar to Task N" / "implement later" patterns anywhere in the plan.
- Every code step shows the actual code or the actual command.
- Every test step shows the actual test.
- The one "TODO" comment in §Task 21 Step 3 (`// TODO(sub-project-2)`) is a deliberate code-level marker, not a plan placeholder.

**3. Type consistency:**
- `findNearestToken` / `findNearestSpacingToken` / `findNearestVariant` — same naming pattern, all return either `{ name, …delta }` or `null`.
- `messageForError` — single signature `(err: unknown) => string`.
- `runCoverageCheck` returns `{ ok: boolean; missing: string[] }`.
- Codemod transform signatures all match jscodeshift's `Transform` type.
- No naming drift between tasks.
