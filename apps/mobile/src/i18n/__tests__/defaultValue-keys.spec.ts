import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import de from '../de'

/**
 * Guard against the "English leak" class of bug: an i18n key referenced in code
 * that's MISSING from the locale files renders the inline English defaultValue
 * (or the bare key) in EVERY language — defaultValue wins over fallbackLng, and
 * locale-parity can't catch it because the key is absent from German too.
 *
 * This scans for ANY 'namespace.key' string literal whose top-level namespace
 * is a real German namespace — covering both t('key', {defaultValue}) AND
 * dynamic-key usages like t(chip.label, …) / t(apiErrorKey(e)) where the key is
 * defined as a string literal nearby — and asserts each resolves in the
 * deep-merged German locale. (The earlier defaultValue-only regex missed the
 * dynamic-key leaks; this is the comprehensive replacement.)
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

// Dotted string literals that look like i18n keys but aren't (SF Symbol icon
// names etc.). Extend if a genuine non-i18n false positive appears.
const NON_I18N = /\.(fill|circle|slash|badge|left|right|up|down|stack|fill\.badge)$/

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.maestro', '__tests__', 'generated'].includes(entry)) continue
    const f = join(dir, entry)
    if (statSync(f).isDirectory()) walk(f, acc)
    else if (f.endsWith('.tsx') || f.endsWith('.ts')) acc.push(f)
  }
  return acc
}

describe('i18n referenced keys exist in the German locale', () => {
  it('every namespaced key string referenced in code resolves in de', () => {
    const deKeys = flatten(de)
    const topNamespaces = new Set([...deKeys].map((k) => k.split('.')[0]))
    const files = [
      ...walk(join(MOBILE_ROOT, 'app')),
      ...walk(join(MOBILE_ROOT, 'src')),
    ]
    const keyRe = /['"]([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+)+)['"]/g

    const referenced = new Set<string>()
    for (const file of files) {
      const txt = readFileSync(file, 'utf8')
      let m: RegExpExecArray | null
      while ((m = keyRe.exec(txt)) !== null) {
        const key = m[1]
        if (topNamespaces.has(key.split('.')[0])) referenced.add(key)
      }
    }

    const missing = [...referenced]
      .filter((k) => !deKeys.has(k) && !NON_I18N.test(k))
      .sort()

    expect(missing).toEqual([])
  })
})
