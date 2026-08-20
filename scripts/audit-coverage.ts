import { readFileSync } from 'node:fs'
import { sync as globSync } from 'glob'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const SCREEN_GLOB = 'apps/mobile/app/**/*.tsx'
const TEST_PATH_FRAGMENT = '__tests__'
const EXCLUDED_SUFFIXES = ['_layout.tsx', '/e2e.tsx']

export function findMissingAuditRows(screenFiles: string[], auditMarkdown: string): string[] {
  const eligibleScreens = screenFiles.filter(
    (path) =>
      !path.includes(TEST_PATH_FRAGMENT) &&
      !EXCLUDED_SUFFIXES.some((suffix) => path.endsWith(suffix)),
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
