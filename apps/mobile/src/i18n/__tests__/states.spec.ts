import { statesEn } from '../states'
import { statesDe } from '../states.de'

describe('states copy library', () => {
  it('exposes all seven screen namespaces and a common namespace (EN)', () => {
    expect(Object.keys(statesEn).sort()).toEqual(
      [
        'admin_members',
        'common',
        'contributions',
        'dm',
        'errors',
        'events',
        'pending_requests',
        'team_matches',
        'transfers',
      ].sort(),
    )
  })

  it('exposes errors.api keys with matching EN and DE shapes', () => {
    const enKeys = Object.keys(statesEn.errors.api).sort()
    const deKeys = Object.keys(statesDe.errors.api).sort()
    expect(enKeys).toEqual(deKeys)
    expect(enKeys).toEqual(
      ['generic', 'network', 'offline', 'permission', 'rateLimit', 'session', 'timeout', 'title', 'unavailable'].sort(),
    )
  })

  it('every screen namespace has empty.{title,body} and error.{title,body,retry}', () => {
    const screenKeys = [
      'events',
      'pending_requests',
      'admin_members',
      'contributions',
      'team_matches',
      'transfers',
      'dm',
    ] as const
    for (const key of screenKeys) {
      const ns = statesEn[key]
      expect(typeof ns.empty.title).toBe('string')
      expect(typeof ns.empty.body).toBe('string')
      expect(typeof ns.error.title).toBe('string')
      expect(typeof ns.error.body).toBe('string')
      expect(typeof ns.error.retry).toBe('string')
    }
  })

  it('common namespace provides offline, unknownError, and retry', () => {
    expect(typeof statesEn.common.offline).toBe('string')
    expect(typeof statesEn.common.unknownError).toBe('string')
    expect(typeof statesEn.common.retry).toBe('string')
  })

  it('DE parity: every EN key is present in DE', () => {
    const walk = (enObj: unknown, deObj: unknown, path: string) => {
      if (typeof enObj === 'string') {
        expect(typeof deObj).toBe('string')
        return
      }
      expect(deObj).toBeTruthy()
      for (const k of Object.keys(enObj as Record<string, unknown>)) {
        walk(
          (enObj as Record<string, unknown>)[k],
          (deObj as Record<string, unknown>)[k],
          `${path}.${k}`,
        )
      }
    }
    walk(statesEn, statesDe, 'states')
  })
})
