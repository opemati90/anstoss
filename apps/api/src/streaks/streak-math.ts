/**
 * Pure helpers for consecutive-week streak math. Kept separate from the
 * service so the fiddly week-bucketing + run logic is unit-testable without a
 * database.
 */

/**
 * ISO-8601 week key `YYYY-Www` in UTC (weeks start Monday; the Thursday of the
 * week decides the year, so e.g. 2025-12-30 is `2026-W01`). Two dates produce
 * the same key iff they fall in the same calendar week.
 */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7 // Sunday → 7
  d.setUTCDate(d.getUTCDate() + 4 - day) // shift to the week's Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Distinct values in first-seen order. */
export function distinctInOrder(keys: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const k of keys) {
    if (!seen.has(k)) {
      seen.add(k)
      out.push(k)
    }
  }
  return out
}

/**
 * Given the chronological list of weeks that COUNT (e.g. weeks the team had at
 * least one event) and the set of weeks the user HIT (attended / won MOTM),
 * return the trailing current streak and the longest run.
 *
 * Only counted weeks appear in `timelineWeeks`, so a gap with no events (a
 * winter break, an international week) never breaks a streak — a streak is
 * only broken by a counted week the user missed.
 *
 * `timelineWeeks` MUST be ascending and de-duplicated.
 */
export function weekStreaks(
  timelineWeeks: string[],
  hitWeeks: Set<string>,
): { current: number; longest: number } {
  let longest = 0
  let run = 0
  for (const w of timelineWeeks) {
    if (hitWeeks.has(w)) {
      run += 1
      if (run > longest) longest = run
    } else {
      run = 0
    }
  }

  let current = 0
  for (let i = timelineWeeks.length - 1; i >= 0; i -= 1) {
    if (hitWeeks.has(timelineWeeks[i])) current += 1
    else break
  }

  return { current, longest }
}
