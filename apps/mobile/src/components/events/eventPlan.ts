/**
 * Date defaults and the weekly plan preview for the create sheet. Local time
 * (the device is in Europe/Berlin for our clubs); the server re-derives the
 * same dates in Europe/Berlin.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export function atTime(base: Date, hours: number, minutes: number): Date {
  const next = new Date(base)
  next.setHours(hours, minutes, 0, 0)
  return next
}

/** Next Sunday (or today if Sunday and still ahead) at 15:00. */
export function defaultKickoff(now = new Date()): Date {
  const next = atTime(now, 15, 0)
  const add = (7 - next.getDay()) % 7
  next.setDate(next.getDate() + add)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 7)
  return next
}

/** Tomorrow at 19:00: a date that is never in the past or at midnight. */
export function defaultTrainingDate(now = new Date()): Date {
  const next = atTime(now, 19, 0)
  if (next.getTime() <= now.getTime() + 60 * 60 * 1000) next.setDate(next.getDate() + 1)
  return next
}

export function seasonEnd(now = new Date()): Date {
  const year = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()
  return new Date(year, 5, 30, 23, 59, 0, 0)
}

/** Last training before the Winterpause (mid-December), while it is ahead. */
export function winterBreak(now = new Date()): Date | null {
  if (now.getMonth() < 6) return null
  const date = new Date(now.getFullYear(), 11, 15, 23, 59, 0, 0)
  return date.getTime() > now.getTime() + 7 * DAY_MS ? date : null
}

/** Occurrences of a weekly plan (local time), mirroring the server rule. */
export function planDates(
  from: Date,
  until: Date,
  weekdays: number[],
  intervalWeeks: 1 | 2,
  hours: number,
  minutes: number,
  now = new Date(),
): Date[] {
  if (weekdays.length === 0) return []
  const start = new Date(from)
  start.setHours(0, 0, 0, 0)
  const monday = new Date(start)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const out: Date[] = []
  for (let week = 0; week < 60; week += intervalWeeks) {
    for (const day of [...weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))) {
      const date = new Date(monday)
      date.setDate(monday.getDate() + week * 7 + ((day + 6) % 7))
      date.setHours(hours, minutes, 0, 0)
      if (date.getTime() < start.getTime() || date.getTime() <= now.getTime()) continue
      if (date.getTime() > until.getTime()) return out
      out.push(date)
    }
  }
  return out
}
