import type { TFunction } from 'i18next'

/** Local calendar day of an ISO timestamp, e.g. "2026-9-24". */
export function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/**
 * Label for the day pill between messages: "Heute", "Gestern", the weekday
 * within the last week, otherwise a short date ("Mo., 21. Sep.").
 */
export function daySeparatorLabel(
  iso: string,
  locale: string,
  t: TFunction,
  now: Date = new Date(),
): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (diff <= 0) return t('chatHub.time.today')
  if (diff === 1) return t('chatHub.time.yesterday')
  if (diff < 7) return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date)
  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date)
}
