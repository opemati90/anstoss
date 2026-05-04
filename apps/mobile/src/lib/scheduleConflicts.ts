export type Kid = {
  userId: string
  name: string
  teamName: string
}

export type ChildEvent = {
  id: string
  kidId: string
  title: string
  /** ISO start */
  date: string
  /** Duration in minutes — defaults to 90 if absent */
  durationMin?: number
  location?: string | null
  rsvp: 'YES' | 'MAYBE' | 'NO' | 'PENDING'
}

export type ConflictPair = {
  /** Stable id derived from the two event ids */
  id: string
  a: ChildEvent
  b: ChildEvent
  /** Number of minutes the two events overlap */
  overlapMin: number
  /** Days from now until the earlier event */
  daysAway: number
}

function endOf(ev: ChildEvent): number {
  const start = new Date(ev.date).getTime()
  const minutes = ev.durationMin ?? 90
  return start + minutes * 60_000
}

function overlapMinutes(a: ChildEvent, b: ChildEvent): number {
  const aStart = new Date(a.date).getTime()
  const bStart = new Date(b.date).getTime()
  const aEnd = endOf(a)
  const bEnd = endOf(b)
  const start = Math.max(aStart, bStart)
  const end = Math.min(aEnd, bEnd)
  return Math.max(0, Math.floor((end - start) / 60_000))
}

/**
 * Find every pair of events from *different* kids that overlap in
 * time. Pairs where either kid has already RSVP'd 'NO' are filtered
 * out — that conflict is already resolved.
 */
export function findConflicts(events: ChildEvent[]): ConflictPair[] {
  const conflicts: ConflictPair[] = []
  const sorted = events
    .slice()
    .filter((ev) => ev.rsvp !== 'NO')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const now = Date.now()

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]
      const b = sorted[j]
      if (a.kidId === b.kidId) continue
      const overlap = overlapMinutes(a, b)
      if (overlap <= 0) continue
      const earlier = new Date(a.date).getTime()
      const daysAway = Math.max(
        0,
        Math.round((earlier - now) / (24 * 60 * 60_000)),
      )
      conflicts.push({
        id: `${a.id}__${b.id}`,
        a,
        b,
        overlapMin: overlap,
        daysAway,
      })
    }
  }

  return conflicts
}
