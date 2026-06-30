import de from '../de'
import en from '../en'
import fr from '../fr'
import itLocale from '../it'
import pt from '../pt'
import tr from '../tr'

// Flatten a nested translation object to dotted leaf keys.
function flatten(o: unknown, prefix = '', out: Record<string, true> = {}) {
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out)
    else out[key] = true
  }
  return out
}

// German is the fallback locale (DEFAULT_LANGUAGE / fallbackLng = 'de'), so any
// key missing from another locale renders in German. This guard fails the build
// when a locale drifts out of parity — the root cause of the EN-shows-German bug.
const reference = Object.keys(flatten(de))

describe('i18n locale parity vs German reference', () => {
  for (const [name, locale] of [
    ['en', en],
    ['fr', fr],
    ['it', itLocale],
    ['pt', pt],
    ['tr', tr],
  ] as const) {
    it(`${name} has every key in the German reference`, () => {
      const have = new Set(Object.keys(flatten(locale)))
      const missing = reference.filter((k) => !have.has(k))
      expect(missing).toEqual([])
    })
  }
})
