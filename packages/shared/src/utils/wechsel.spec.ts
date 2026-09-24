import { TrialInviteStatus } from '../types/marketplace'
import {
  nextTrialSession,
  nextWechselperiode,
  postalPrefixForRadius,
  postalRegion,
  trialAgeFit,
  trialStage,
  wechselperiode,
  youthAgeLimit,
} from './wechsel'

describe('wechselperiode', () => {
  it('maps Jul–Aug to SOMMER and January to WINTER', () => {
    expect(wechselperiode(new Date(2026, 6, 1))).toBe('SOMMER')
    expect(wechselperiode(new Date(2026, 7, 31))).toBe('SOMMER')
    expect(wechselperiode(new Date(2027, 0, 15))).toBe('WINTER')
  })

  it('returns null outside the windows', () => {
    expect(wechselperiode(new Date(2026, 8, 1))).toBeNull()
    expect(wechselperiode(new Date(2026, 5, 30))).toBeNull()
    expect(wechselperiode(new Date(2026, 1, 1))).toBeNull()
    expect(wechselperiode('not a date')).toBeNull()
  })

  it('finds the next window', () => {
    const autumn = nextWechselperiode(new Date(2026, 8, 24))
    expect(autumn.period).toBe('WINTER')
    expect(autumn.current).toBe(false)
    expect(autumn.start.getFullYear()).toBe(2027)
    const spring = nextWechselperiode(new Date(2026, 3, 10))
    expect(spring.period).toBe('SOMMER')
    expect(spring.start.getMonth()).toBe(6)
    const inside = nextWechselperiode(new Date(2026, 6, 20))
    expect(inside.current).toBe(true)
  })
})

describe('postalPrefixForRadius', () => {
  it('narrows the prefix as the radius shrinks', () => {
    expect(postalPrefixForRadius('14482', 10)).toBe('144')
    expect(postalPrefixForRadius('14482', 25)).toBe('14')
    expect(postalPrefixForRadius('14482', 100)).toBe('1')
    expect(postalPrefixForRadius('1448')).toBeNull()
  })
})

describe('trialStage', () => {
  const now = new Date('2026-09-24T12:00:00Z')
  const future = '2026-09-29T17:30:00Z'
  const past = '2026-09-20T17:30:00Z'

  it('maps open statuses to their stage', () => {
    expect(trialStage({ status: TrialInviteStatus.REQUESTED }, now)).toBe('REQUESTED')
    expect(trialStage({ status: TrialInviteStatus.PENDING }, now)).toBe('INVITED')
    expect(trialStage({ status: TrialInviteStatus.OFFERED }, now)).toBe('DECISION')
  })

  it('keeps accepted trials scheduled until the last session passes', () => {
    expect(
      trialStage({ status: TrialInviteStatus.ACCEPTED, sessions: [{ date: past }, { date: future }] }, now),
    ).toBe('SCHEDULED')
    expect(trialStage({ status: TrialInviteStatus.ACCEPTED, sessions: [{ date: past }] }, now)).toBe(
      'DECISION',
    )
    expect(
      trialStage({ status: TrialInviteStatus.ACCEPTED, sessions: [{ date: future }], rating: 4 }, now),
    ).toBe('DECISION')
  })

  it('closes terminal statuses', () => {
    for (const status of [
      TrialInviteStatus.JOINED,
      TrialInviteStatus.REJECTED,
      TrialInviteStatus.DECLINED,
      TrialInviteStatus.EXPIRED,
      TrialInviteStatus.REVOKED,
      TrialInviteStatus.WITHDRAWN,
    ]) {
      expect(trialStage({ status }, now)).toBe('DONE')
    }
  })

  it('picks the next live session', () => {
    const sessions = [
      { id: 'a', date: past, cancelledAt: null },
      { id: 'b', date: '2026-10-02T17:30:00Z', cancelledAt: null },
      { id: 'c', date: future, cancelledAt: '2026-09-23T10:00:00Z' },
    ]
    expect(nextTrialSession(sessions, now)?.id).toBe('b')
  })
})

describe('Wechselperiode on the Europe/Berlin calendar (L1)', () => {
  it('counts 31 Aug 23:30 Berlin (21:30 UTC) as Sommer and 1 Sep 00:30 Berlin as outside', () => {
    expect(wechselperiode(new Date('2026-08-31T21:30:00Z'))).toBe('SOMMER')
    expect(wechselperiode(new Date('2026-08-31T22:30:00Z'))).toBeNull()
  })

  it('opens the winter window at Berlin midnight, not UTC midnight', () => {
    // 31 Dec 23:30 UTC is already 1 January in Berlin.
    expect(wechselperiode(new Date('2026-12-31T23:30:00Z'))).toBe('WINTER')
    expect(wechselperiode(new Date('2026-12-31T22:30:00Z'))).toBeNull()
  })
})

describe('minors and youth teams', () => {
  it('reduces a PLZ to its region', () => {
    expect(postalRegion('14482')).toBe('14')
    expect(postalRegion('1448')).toBeNull()
    expect(postalRegion(null)).toBeNull()
  })

  it('reads the age bound of youth teams', () => {
    expect(youthAgeLimit('B-Jugend (U17)')).toBe(17)
    expect(youthAgeLimit('U19')).toBe(19)
    expect(youthAgeLimit('A-Junioren')).toBe(19)
    expect(youthAgeLimit('Jugend')).toBe('youth')
    expect(youthAgeLimit('Herren')).toBeNull()
    expect(youthAgeLimit('Ü32')).toBeNull()
    expect(youthAgeLimit('U23')).toBeNull()
  })

  it('keeps adults off youth teams and players inside the age class', () => {
    expect(trialAgeFit('Herren', 24)).toBe('OK')
    expect(trialAgeFit('Herren', 17)).toBe('OK')
    expect(trialAgeFit('B-Jugend (U17)', 16)).toBe('OK')
    expect(trialAgeFit('B-Jugend (U17)', 17)).toBe('TOO_OLD_FOR_TEAM')
    expect(trialAgeFit('B-Jugend (U17)', 24)).toBe('ADULT_ON_YOUTH_TEAM')
    expect(trialAgeFit('A-Jugend (U19)', 18)).toBe('OK')
    expect(trialAgeFit('Jugend', 18)).toBe('ADULT_ON_YOUTH_TEAM')
    expect(trialAgeFit('U17', null)).toBe('ADULT_ON_YOUTH_TEAM')
  })
})
