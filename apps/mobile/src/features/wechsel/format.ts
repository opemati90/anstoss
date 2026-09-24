import type { TFunction } from 'i18next'
import {
  LEAGUE_LEVELS,
  PlayerPosition,
  nextWechselperiode,
  trialStage,
  wechselperiode,
  type LeagueLevel,
  type TrialInvite,
  type TrialStage,
} from '@anstoss/shared'
import i18n from '../../i18n'

const LOCALES: Record<string, string> = {
  de: 'de-DE',
  en: 'en-GB',
  fr: 'fr-FR',
  it: 'it-IT',
  pt: 'pt-PT',
  tr: 'tr-TR',
}

export function currentLocale(): string {
  const lang = (i18n.resolvedLanguage || i18n.language || 'de').split('-')[0]
  return LOCALES[lang] ?? 'de-DE'
}

function toDate(value: string | Date) {
  return typeof value === 'string' ? new Date(value) : value
}

/** "Di., 29.09." / "Tue 29 Sept" — weekday + day + month. */
export function formatSessionDay(value: string | Date) {
  return new Intl.DateTimeFormat(currentLocale(), {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(toDate(value))
}

export function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat(currentLocale(), {
    hour: '2-digit', hourCycle: 'h23',
    minute: '2-digit',
  }).format(toDate(value))
}

export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat(currentLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(toDate(value))
}

/** Long form for a big "next session" block: "Dienstag, 29. September". */
export function formatLongDay(value: string | Date) {
  return new Intl.DateTimeFormat(currentLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(toDate(value))
}

/** Date-only ISO (YYYY-MM-DD) in local time, for API date fields. */
export function toIsoDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parse YYYY-MM-DD as a local calendar date (not UTC midnight). */
export function fromIsoDate(value: string) {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export const POSITIONS = [
  PlayerPosition.GK,
  PlayerPosition.DEF,
  PlayerPosition.MID,
  PlayerPosition.FWD,
] as const
export type PositionKey = (typeof POSITIONS)[number]

export function positionLabel(t: TFunction, position: string | null | undefined) {
  if (!position) return null
  return t(`spielerprofil.position.${position}`)
}

export function positionShort(t: TFunction, position: string | null | undefined) {
  if (!position) return null
  return t(`spielerprofil.positionShort.${position}`)
}

export function footLabel(t: TFunction, foot: string | null | undefined) {
  if (!foot) return null
  return t(`spielerprofil.foot.${foot}`)
}

export function leagueLabel(t: TFunction, league: string | null | undefined) {
  if (!league) return null
  if ((LEAGUE_LEVELS as readonly string[]).includes(league)) {
    return t(`spielerprofil.league.${league as LeagueLevel}`)
  }
  return league
}

export const LEAGUE_OPTIONS = LEAGUE_LEVELS

export const STAGES: TrialStage[] = ['REQUESTED', 'INVITED', 'SCHEDULED', 'DECISION', 'DONE']

export function stageOf(invite: TrialInvite, now = new Date()): TrialStage {
  return trialStage(invite, now)
}

export function stageLabel(t: TFunction, stage: TrialStage) {
  return t(`probetraining.stage.${stage}`)
}

export type StageTone = 'neutral' | 'success' | 'warning' | 'error' | 'info'

/** Chip wording + tone for one trial, including how a closed one ended. */
export function statusChip(
  t: TFunction,
  invite: TrialInvite,
  now = new Date(),
): { label: string; tone: StageTone } {
  const stage = stageOf(invite, now)
  if (stage === 'DONE') {
    const tone: StageTone = invite.status === 'JOINED' ? 'success' : 'neutral'
    return { label: t(`probetraining.outcome.${invite.status}`), tone }
  }
  if (invite.status === 'OFFERED') {
    return { label: t('probetraining.outcome.OFFERED'), tone: 'success' }
  }
  const tone: StageTone = stage === 'REQUESTED' || stage === 'INVITED' ? 'warning' : 'info'
  return { label: stageLabel(t, stage), tone }
}

/** One-line player summary: "24 · Mittelfeld · rechts". */
export function playerMeta(
  t: TFunction,
  player: {
    age?: number | null
    isMinor?: boolean
    position?: string | null
    preferredFoot?: string | null
  },
) {
  return [
    ageLabel(t, player, 'short'),
    positionLabel(t, player.position),
    footLabel(t, player.preferredFoot),
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Age as shown to others: a 16–17-year-old is "U18" (no exact age, review
 * fix H2); adults show their age.
 */
export function ageLabel(
  t: TFunction,
  player: { age?: number | null; isMinor?: boolean },
  form: 'short' | 'long' = 'long',
) {
  if (player.isMinor) return t('spielerprofil.ageU18')
  if (!player.age) return null
  return form === 'short'
    ? t('spielerprofil.ageShort', { count: player.age })
    : t('spielerprofil.ageYears', { count: player.age })
}

/** "PLZ-Gebiet 14" — the region shown instead of a player's postcode. */
export function regionLabel(t: TFunction, postalRegion: string | null | undefined) {
  return postalRegion ? t('spielerprofil.regionValue', { region: postalRegion }) : null
}

/** Age from a DOB string, or null. */
export function ageFromDob(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null
  const birth = new Date(dateOfBirth)
  if (Number.isNaN(birth.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1
  return age
}

/**
 * Orientation only (review fix L1): which Wechselperiode a date falls into on
 * the Berlin calendar. What counts is the filing date of the Passantrag in
 * DFBnet, which the copy says.
 */
export function wechselperiodeHint(t: TFunction, date: Date) {
  const current = wechselperiode(date)
  if (current) {
    return t('wechsel.periodInside', {
      period: t(`wechsel.period.${current}`),
    })
  }
  const next = nextWechselperiode(date)
  return t('wechsel.periodOutside', {
    period: t(`wechsel.period.${next.period}`),
    date: formatDate(next.start),
  })
}
