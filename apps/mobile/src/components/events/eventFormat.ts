import type { TFunction } from 'i18next'

/**
 * Formatting shared by the schedule list, the event detail and the create
 * sheet, so "Treff 13:30 · Anstoß 14:30" reads the same everywhere.
 */

export type EventLike = {
  title: string
  type: 'TRAINING' | 'MATCH' | 'OTHER'
  date: string
  meetingAt?: string | null
  opponent?: string | null
  homeAway?: 'HOME' | 'AWAY' | null
  durationMin?: number | null
  /** The title is derived (Training / match vs opponent): render it in the reader's language. */
  autoTitle?: boolean
}

type Translate = TFunction | ((key: string, options?: Record<string, unknown>) => string)

export function formatClock(value: string | Date, locale: string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

/** "Heimspiel gegen SV Babelsberg 03" / "Auswärtsspiel bei …", in the reader's language. */
export function matchTitle(
  opponent: string,
  homeAway: 'HOME' | 'AWAY' | null | undefined,
  t: Translate,
): string {
  const key = homeAway === 'AWAY' ? 'away' : homeAway === 'HOME' ? 'home' : 'neutral'
  return t(`eventFlow.matchTitle.${key}`, { opponent: opponent.trim() }) as string
}

/** Titles the app used to store in the creator's language. */
const LEGACY_TRAINING_TITLES = new Set(['Training', 'Entraînement', 'Allenamento', 'Treino', 'Antrenman'])

/**
 * What the reader sees as the event's name. A match with an opponent is
 * always "Heimspiel gegen X" in the reader's language; a derived Training
 * title is "Training" / "Antrenman"; a typed title is shown as typed.
 */
export function eventDisplayTitle(event: EventLike, t: Translate): string {
  if (event.type === 'MATCH' && event.opponent?.trim()) {
    return matchTitle(event.opponent, event.homeAway, t)
  }
  if (event.type === 'TRAINING' && (event.autoTitle || LEGACY_TRAINING_TITLES.has(event.title))) {
    return t('eventFlow.type.TRAINING') as string
  }
  return event.title
}

/**
 * The one line that tells a player when to be where:
 * match "Treff 13:30 · Anstoß 14:30", training "19:00–20:30".
 */
export function eventTimeLine(event: EventLike, locale: string, t: Translate): string {
  const start = formatClock(event.date, locale)
  const meeting = event.meetingAt ? formatClock(event.meetingAt, locale) : null
  if (event.type === 'MATCH') {
    const kickoff = t('eventFlow.time.kickoff', { time: start }) as string
    return meeting
      ? `${t('eventFlow.time.meeting', { time: meeting }) as string} · ${kickoff}`
      : kickoff
  }
  const end =
    event.durationMin && event.durationMin > 0
      ? formatClock(new Date(new Date(event.date).getTime() + event.durationMin * 60000), locale)
      : null
  const range = end ? `${start}–${end}` : start
  return meeting ? `${t('eventFlow.time.meeting', { time: meeting }) as string} · ${range}` : range
}

/** Minutes between the meeting and the start, for "13:30 · 60 min vorher". */
export function meetingLeadMinutes(event: Pick<EventLike, 'date' | 'meetingAt'>): number | null {
  if (!event.meetingAt) return null
  const diff = new Date(event.date).getTime() - new Date(event.meetingAt).getTime()
  return Number.isFinite(diff) ? Math.round(diff / 60000) : null
}

export const RSVP_REASON_KEYS = [
  'injured',
  'sick',
  'work',
  'vacation',
  'personal',
  'suspended',
  'other',
] as const
export type RsvpReasonKey = (typeof RSVP_REASON_KEYS)[number]

/** Reason chips in the Absage sheet (Sonstiges is covered by the note). */
export const ABSENCE_REASON_CHIPS: RsvpReasonKey[] = [
  'injured',
  'sick',
  'work',
  'vacation',
  'personal',
  'suspended',
]

export function reasonLabel(reason: string | null | undefined, t: Translate): string | null {
  if (!reason) return null
  const key = reason === 'injury' ? 'injured' : reason
  if (!(RSVP_REASON_KEYS as readonly string[]).includes(key)) return null
  return t(`eventFlow.reason.${key}`) as string
}

export function monthKey(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function sameLocalDay(a: string | Date, b: string | Date): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}
