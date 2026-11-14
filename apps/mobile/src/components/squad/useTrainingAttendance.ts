import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'

type FeedEvent = { id: string; date: string; cancelledAt?: string | null }
type AttendanceReport = { checkIns?: Array<{ userId: string }> }

export type TrainingAttendance = {
  /** The last `count` past trainings, newest first. */
  trainings: Array<{ id: string; date: string }>
  /**
   * Per member, oldest → newest: true only for a recorded check-in.
   * Unknown/missing records are null, never inferred absences or RSVPs.
   */
  byUser: Record<string, Array<boolean | null>>
}

/**
 * Training attendance for the Kader rows (last 4) and the member profile
 * (last 8), from the existing staff-only attendance report. RSVP is intent,
 * not attendance. Non-managers do not call the protected report endpoint.
 */
export function useTrainingAttendance(
  clubId: string | null,
  teamId: string | null,
  count: number,
  canManageAttendance = false,
): { attendance: TrainingAttendance | null; reload: () => void } {
  const scope = canManageAttendance && clubId && teamId ? `${clubId}:${teamId}:${count}` : null
  const [snapshot, setSnapshot] = useState<{
    scope: string
    attendance: TrainingAttendance
  } | null>(null)
  const seq = useRef(0)

  const load = useCallback(async () => {
    const current = ++seq.current
    if (!scope || !clubId || !teamId) {
      setSnapshot(null)
      return
    }
    try {
      const params = new URLSearchParams({
        teamId,
        scope: 'past',
        type: 'TRAINING',
        limit: String(count),
      })
      const feed = await api<FeedEvent[]>(`/clubs/${clubId}/events?${params.toString()}`)
      const trainings = (Array.isArray(feed) ? feed : [])
        .filter((event) => !event.cancelledAt && new Date(event.date).getTime() < Date.now())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, count)
      const details = await Promise.all(
        trainings.map((event) =>
          api<AttendanceReport>(`/clubs/${clubId}/events/${event.id}/attendance`).catch(() => null),
        ),
      )
      if (seq.current !== current) return
      const byUser: TrainingAttendance['byUser'] = {}
      // Oldest first, so the bars read left → right like a timeline.
      const ordered = [...details].reverse()
      ordered.forEach((detail, index) => {
        for (const checkIn of detail?.checkIns ?? []) {
          const id = checkIn.userId
          if (!id) continue
          const row =
            byUser[id] ?? (byUser[id] = Array.from({ length: ordered.length }, () => null))
          row[index] = true
        }
      })
      setSnapshot({
        scope,
        attendance: { trainings: trainings.map(({ id, date }) => ({ id, date })), byUser },
      })
    } catch {
      if (seq.current === current) setSnapshot(null)
    }
  }, [clubId, teamId, count, scope])

  useEffect(() => {
    void load()
    return () => {
      seq.current += 1
    }
  }, [load])

  return {
    attendance: snapshot?.scope === scope ? snapshot.attendance : null,
    reload: () => void load(),
  }
}

/** Missing trainings are unknown, not absences; no evidence means no bars. */
export function attendanceFor(
  attendance: TrainingAttendance | null,
  userId: string,
  count: number,
): Array<boolean | null> | null {
  if (!attendance || attendance.trainings.length === 0) return null
  const row = attendance.byUser[userId] ?? []
  if (!row.some((value) => value !== null)) return null
  const padded = Array.from({ length: attendance.trainings.length }, (_, i) => row[i] ?? null)
  // Fewer trainings than slots: the empty slots sit on the left (oldest).
  return [
    ...Array.from({ length: Math.max(0, count - padded.length) }, () => null),
    ...padded,
  ].slice(-count)
}
