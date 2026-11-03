import { TrialInviteStatus, type TrialStage } from '../types/marketplace'
import { LAUNCH_FEATURES } from '../constants/launch-features'

/**
 * Wechselperioden for German amateur football (DFB Spielordnung):
 *   Sommer: 1 July – 31 August
 *   Winter: 1 – 31 January
 * Outside these windows a player can usually only change clubs with the
 * old club's consent and a Wartefrist. The app shows this as orientation
 * only: what counts is the filing date of the Passantrag in DFBnet (the
 * system of record) and the Landesverband's own rules.
 *
 * Dates are evaluated on the Europe/Berlin calendar (the federation's
 * calendar), whatever the device or server time zone is.
 */
export type Wechselperiode = 'SOMMER' | 'WINTER'

const BERLIN_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Year / month (0-based) / day of a moment on the Europe/Berlin calendar. */
export function berlinCalendarDate(date: Date): { year: number; month: number; day: number } {
  const parts = BERLIN_PARTS.formatToParts(date)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return { year: get('year'), month: get('month') - 1, day: get('day') }
}

/** A Berlin calendar day as a Date at 12:00 UTC (same calendar day across Europe). */
function berlinDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 12))
}

export function wechselperiode(date: Date | string): Wechselperiode | null {
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return null
  const { month } = berlinCalendarDate(d) // 0 = January
  if (month === 0) return 'WINTER'
  if (month === 6 || month === 7) return 'SOMMER'
  return null
}

/**
 * The period a date falls into, or the next one that starts after it.
 * `start`/`end` are Berlin calendar days (end is the last day inclusive).
 */
export function nextWechselperiode(date: Date | string): {
  period: Wechselperiode
  start: Date
  end: Date
  current: boolean
} {
  const d = typeof date === 'string' ? new Date(date) : date
  const { year, month } = berlinCalendarDate(d)
  const current = wechselperiode(d)
  if (current === 'WINTER') {
    return { period: 'WINTER', start: berlinDay(year, 0, 1), end: berlinDay(year, 0, 31), current: true }
  }
  if (current === 'SOMMER') {
    return { period: 'SOMMER', start: berlinDay(year, 6, 1), end: berlinDay(year, 7, 31), current: true }
  }
  // Feb–Jun → Sommer of the same year; Sep–Dec → Winter of next year.
  if (month < 6) {
    return { period: 'SOMMER', start: berlinDay(year, 6, 1), end: berlinDay(year, 7, 31), current: false }
  }
  return {
    period: 'WINTER',
    start: berlinDay(year + 1, 0, 1),
    end: berlinDay(year + 1, 0, 31),
    current: false,
  }
}

// ─── Minors in the Wechselbörse (safeguarding, 2026-09-24) ─────────────
//
//  - under 16: no free-agent profile, no free-agent role. A child changes
//    clubs through their parents, who contact the new club.
//  - 16–17: profile is CLUB_ONLY (coaches/admins only), no photos/videos,
//    shown as "U18" instead of an exact age, region instead of postcode.
//  - Under-18 Aufnahmeantrag: a guardian gives the membership + SEPA
//    consent through the parental-consent flow.

/** Minimum age to hold a free-agent profile or the FREE_AGENT role. */
export const FREE_AGENT_MIN_AGE = LAUNCH_FEATURES.youthParticipation ? 16 : LAUNCH_FEATURES.minimumAccountAge
/** Below this age a free agent is a minor (U18 rules apply). */
export const FREE_AGENT_ADULT_AGE = 18

/**
 * Coarse region of a German postcode (its Leitregion, the first two
 * digits). Shown instead of the full PLZ to anyone but the owner.
 */
export function postalRegion(postalCode: string | null | undefined): string | null {
  const plz = postalCode?.trim() ?? ''
  return /^\d{5}$/.test(plz) ? plz.slice(0, 2) : null
}

/**
 * Upper age bound of a youth team ("U17", "B-Jugend", "A-Junioren (U19)"),
 * `'youth'` for a youth team without a readable bound, or null for an adult
 * team (Herren, Damen, Ü32, U21/U23 development squads).
 */
export function youthAgeLimit(ageGroup: string | null | undefined): number | 'youth' | null {
  const value = ageGroup?.trim() ?? ''
  if (!value || /^ü/i.test(value)) return null
  const under = value.match(/(^|[^a-zäöü])u\s?-?(\d{1,2})\b/i)
  if (under) {
    const limit = Number(under[2])
    return limit >= 7 && limit <= 19 ? limit : null
  }
  const letter = value.match(/^([a-g])[\s-]?(jugend|junior)/i)
  if (letter) {
    const limits: Record<string, number> = { a: 19, b: 17, c: 15, d: 13, e: 11, f: 9, g: 7 }
    return limits[letter[1].toLowerCase()] ?? 'youth'
  }
  if (/(jugend|junior|bambini)/i.test(value)) return 'youth'
  return null
}

export type TrialAgeFit = 'OK' | 'ADULT_ON_YOUTH_TEAM' | 'TOO_OLD_FOR_TEAM'

/**
 * Whether a player of this age may do a Probetraining with this team.
 * Adults never trial with a youth team; a youth player must be younger than
 * the team's bound (an 18-year-old still fits A-Jugend / U19). Unknown age
 * counts as adult.
 */
export function trialAgeFit(ageGroup: string | null | undefined, age: number | null): TrialAgeFit {
  const limit = youthAgeLimit(ageGroup)
  if (limit === null) return 'OK'
  if (age === null) return 'ADULT_ON_YOUTH_TEAM'
  if (limit === 'youth') return age >= FREE_AGENT_ADULT_AGE ? 'ADULT_ON_YOUTH_TEAM' : 'OK'
  if (age >= limit) return age >= FREE_AGENT_ADULT_AGE ? 'ADULT_ON_YOUTH_TEAM' : 'TOO_OLD_FOR_TEAM'
  return 'OK'
}

/**
 * Approximate "Umkreis" search on German postcodes without geodata.
 * The leading digits of a PLZ encode the region: two digits cover a
 * Leitregion (roughly 40–60 km across), three digits a smaller area
 * around one town. Returns the prefix to match with `startsWith`.
 */
export function postalPrefixForRadius(postalCode: string, radiusKm = 25): string | null {
  const plz = postalCode.trim()
  if (!/^\d{5}$/.test(plz)) return null
  if (radiusKm <= 15) return plz.slice(0, 3)
  if (radiusKm <= 50) return plz.slice(0, 2)
  return plz.slice(0, 1)
}

type StageInput = {
  status: TrialInviteStatus | `${TrialInviteStatus}`
  sessions?: Array<{ date: string; cancelledAt?: string | null }>
  rating?: number | null
  decidedAt?: string | null
}

const DONE_STATUSES = new Set<string>([
  TrialInviteStatus.JOINED,
  TrialInviteStatus.REJECTED,
  TrialInviteStatus.DECLINED,
  TrialInviteStatus.EXPIRED,
  TrialInviteStatus.REVOKED,
  TrialInviteStatus.WITHDRAWN,
])

/**
 * Pipeline stage for a trial:
 *   Angefragt (REQUESTED) → Eingeladen (PENDING) → Termin (ACCEPTED with a
 *   session still ahead) → Entscheidung (sessions done, feedback given, or
 *   OFFERED) → Abgeschlossen (terminal statuses).
 */
export function trialStage(invite: StageInput, now: Date = new Date()): TrialStage {
  const status = String(invite.status)
  if (DONE_STATUSES.has(status)) return 'DONE'
  if (status === TrialInviteStatus.REQUESTED) return 'REQUESTED'
  if (status === TrialInviteStatus.PENDING) return 'INVITED'
  if (status === TrialInviteStatus.OFFERED) return 'DECISION'
  // ACCEPTED ("Termin zugesagt")
  if (invite.rating != null) return 'DECISION'
  const live = (invite.sessions ?? []).filter((session) => !session.cancelledAt)
  const upcoming = live.some((session) => new Date(session.date).getTime() > now.getTime())
  return upcoming || live.length === 0 ? 'SCHEDULED' : 'DECISION'
}

/** Next session that has not started and is not cancelled. */
export function nextTrialSession<T extends { date: string; cancelledAt?: string | null }>(
  sessions: T[] | undefined,
  now: Date = new Date(),
): T | null {
  const upcoming = (sessions ?? [])
    .filter((session) => !session.cancelledAt && new Date(session.date).getTime() > now.getTime())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  return upcoming[0] ?? null
}
