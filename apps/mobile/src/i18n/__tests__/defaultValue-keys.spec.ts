import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import de from '../de'

/**
 * Guard against the "English leak" class of bug: a `t('key', { defaultValue:
 * 'English' })` call whose key is MISSING from the locale files renders the
 * English defaultValue in EVERY language (defaultValue wins over fallbackLng).
 * The locale-parity test can't catch it because the key is absent from the
 * German reference too. This test asserts every such key exists in the
 * (deep-merged) German locale, which is the source of truth all others mirror.
 */
function flatten(o: unknown, prefix = '', out: Set<string> = new Set()) {
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out)
    else out.add(key)
  }
  return out
}

const MOBILE_ROOT = join(__dirname, '..', '..', '..')

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.maestro', '__tests__', 'generated'].includes(entry)) continue
    const f = join(dir, entry)
    if (statSync(f).isDirectory()) walk(f, acc)
    else if (f.endsWith('.tsx') || f.endsWith('.ts')) acc.push(f)
  }
  return acc
}

describe('i18n defaultValue keys exist in the German locale', () => {
  it('every t(key, { defaultValue }) call has a matching key in de', () => {
    const deKeys = flatten(de)
    const files = [
      ...walk(join(MOBILE_ROOT, 'app')),
      ...walk(join(MOBILE_ROOT, 'src')),
    ]
    const re =
      /t\(\s*(['"])([A-Za-z0-9_.]+)\1\s*,\s*\{[\s\S]*?defaultValue:\s*(['"])(?:\\.|(?!\3)[\s\S])*?\3/g

    const missing = new Set<string>()
    for (const file of files) {
      const txt = readFileSync(file, 'utf8')
      let m: RegExpExecArray | null
      while ((m = re.exec(txt)) !== null) {
        const key = m[2]
        if (!deKeys.has(key)) missing.add(key)
      }
    }

    expect([...missing].sort()).toEqual([])
  })
})
