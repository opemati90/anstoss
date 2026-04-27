/**
 * CLI wrapper for no-raw-colors-codemod.ts
 *
 * Usage:
 *   node --require tsx/cjs scripts/codemods/run-colors.cjs <cluster> <glob...>
 *
 * Loads the transform via tsx/cjs (so TypeScript is transparent) and runs it
 * in-process so TOKENS can be passed directly without jscodeshift's CLI option
 * parser limitations.
 */

'use strict'

const { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } = require('node:fs')
const path = require('node:path')
const jscodeshift = require('jscodeshift')
const { globSync } = require('glob')

// ---------------------------------------------------------------------------
// Token map — flat export constants from apps/mobile/src/theme/colors.ts
// (SURFACE_OVERLAY excluded — it's rgba; chatBubbleOther excluded — inline)
// ---------------------------------------------------------------------------
const TOKENS = {
  TEXT_PRIMARY: '#1A1C22',
  TEXT_SECONDARY: '#5F626C',
  TEXT_TERTIARY: '#767D8C',
  TEXT_WHITE: '#FFFFFF',
  SURFACE: '#FFFFFF',
  SURFACE_RAISED: '#FFFFFF',
  SURFACE_SUNKEN: '#F3F3F3',
  SCRIM_BASE: '#0F1116',
  BORDER_SUBTLE: '#F3F4F6',
  BORDER_DEFAULT: '#E6E7F2',
  BORDER_STRONG: '#C9CCD9',
  SUCCESS: '#15803D',
  SUCCESS_BG: '#DCFCE7',
  WARNING: '#B45309',
  WARNING_BG: '#FEF3C7',
  ERROR: '#9C4A67',
  ERROR_BG: '#FEE7E7',
  INFO: '#3B82F6',
  INFO_BG: '#E8EBFF',
  APP_BACKGROUND: '#FAFAF8',
  DEFAULT_PRIMARY: '#1A1C22',
  DEFAULT_PRIMARY_PRESSED: '#000000',
  DEFAULT_PRIMARY_50: '#F3F4F6',
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const [,, cluster, ...globs] = process.argv

if (!cluster || globs.length === 0) {
  console.error('Usage: node --require tsx/cjs run-colors.cjs <cluster> <glob...>')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Load transform (requires tsx/cjs in --require)
// ---------------------------------------------------------------------------
const transform = require('./no-raw-colors-codemod').default

// ---------------------------------------------------------------------------
// Report setup
// ---------------------------------------------------------------------------
const REPO_ROOT = path.resolve(__dirname, '../..')
const reportDir = path.join(REPO_ROOT, 'docs/revamp/codemod-reports')
if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true })
const reportPath = path.join(reportDir, 'colors.md')
if (!existsSync(reportPath)) {
  writeFileSync(reportPath, '# Colors codemod off-tolerance report\n\n')
}

// ---------------------------------------------------------------------------
// Resolve files
// ---------------------------------------------------------------------------
const files = globSync(globs, { nodir: true, cwd: REPO_ROOT })
  .map((f) => path.resolve(REPO_ROOT, f))

console.log(`\n[cluster: ${cluster}] ${files.length} files matched`)

// ---------------------------------------------------------------------------
// jscodeshift API
// ---------------------------------------------------------------------------
const j = jscodeshift.withParser('tsx')

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
let changedCount = 0
const reportLines = [`\n## Cluster — ${cluster}\n`]
let hasReportEntries = false

for (const filePath of files) {
  const source = readFileSync(filePath, 'utf8')
  const localReport = []
  const api = {
    jscodeshift: j,
    j,
    stats: () => undefined,
    report: (line) => localReport.push(line),
  }

  // Compute the relative import path from this file's directory to the tokens module
  const fileDir = path.dirname(filePath)
  const tokensAbsolute = path.join(REPO_ROOT, 'apps/mobile/src/theme/colors')
  const relImport = path.relative(fileDir, tokensAbsolute).replace(/\\/g, '/')
  const importPath = relImport.startsWith('.') ? relImport : `./${relImport}`

  try {
    const result = transform(
      { source, path: filePath },
      api,
      { tokens: TOKENS, importPath },
    )

    if (result && result !== source) {
      writeFileSync(filePath, result)
      console.log(`  changed: ${path.relative(REPO_ROOT, filePath)}`)
      changedCount++
    }

    if (localReport.length > 0) {
      hasReportEntries = true
      // Make paths relative for the report
      const rel = path.relative(REPO_ROOT, filePath)
      for (const line of localReport) {
        reportLines.push(`- ${line.replace(filePath, rel)}`)
      }
    }
  } catch (e) {
    console.error(`  ERROR transforming ${path.relative(REPO_ROOT, filePath)}: ${e.message}`)
  }
}

// ---------------------------------------------------------------------------
// Append to report
// ---------------------------------------------------------------------------
if (hasReportEntries) {
  appendFileSync(reportPath, reportLines.join('\n') + '\n')
} else {
  appendFileSync(reportPath, `\n## Cluster — ${cluster}\n\n_No off-tolerance literals found._\n`)
}

console.log(`\n[cluster: ${cluster}] ${changedCount} file(s) changed`)
process.exit(0)
