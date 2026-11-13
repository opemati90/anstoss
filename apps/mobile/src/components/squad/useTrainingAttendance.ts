import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'

type FeedEvent = { id: string; date: string; cancelledAt?: string | null }
type DetailEvent = {
  id: string
  rsvps?: Array<{ status: string; userId?: string; user?: { id: string } | null }>
}

export type TrainingAttendance = {
  /** The last `count` past trainings, newest first. */
  trainings: Array<{ id: string; date: string }>
  /**
   * Per member, oldest → newest: true when they said yes to that training.
   * A member missing from the map has no answer for any of them.
   */
  byUser: Record<string, boolean[]>
}

/**
 * Training attendance for the Kader rows (last 4) and the member profile
 * (last 8): the team's last past trainings and who said yes to each. There is
 * no per-player attendance endpoint yet, so this reads the event feed and the
 * event details the app already uses; a "yes" stands in for "was there".
 */
export function useTrainingAttendance(
  clubId: string | null,
  teamId: string | null,
  count: number,
): { attendance: TrainingAttendance | null; reload: () => void } {
  const [attendance, setAttendance] = useState<TrainingAttendance | null>(null)
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!clubId || !teamId) {
      setAttendance(null)
      return
    }
    const current = ++seq.current
    try {
      const params = new URLSearchParams({ teamId, scope: 'past', type: 'TRAINING', limit: String(count) })
      const feed = await api<FeedEvent[]>(`/clubs/${clubId}/events?${params.toString()}`)
      const trainings = (Array.isArray(feed) ? feed : [])
        .filter((event) => !event.cancelledAt)
        .slice(0, count)
      const details = await Promise.all(
        trainings.map((event) =>
          api<DetailEvent>(`/clubs/${clubId}/events/${event.id}`).catch(() => null),
        ),
      )
      if (seq.current !== current) return
      const byUser: Record<string, boolean[]> = {}
      // Oldest first, so the bars read left → right like a timeline.
      const ordered = [...details].reverse()
      ordered.forEach((detail, index) => {
        for (const rsvp of detail?.rsvps ?? []) {
          const id = rsvp?.userId ?? rsvp?.user?.id
          if (!id) continue
          const row = byUser[id] ?? (byUser[id] = Array.from({ length: ordered.length }, () => false))
          row[index] = rsvp.status === 'YES'
        }
      })
      setAttendance({ trainings: trainings.map(({ id, date }) => ({ id, date })), byUser })
    } catch {
      if (seq.current === current) setAttendance(null)
    }
  }, [clubId, teamId, count])

  useEffect(() => {
    void load()
  }, [load])

  return { attendance, reload: () => void load() }
}

/** The member's row, padded to `count` (missing trainings read as "no"). */
export function attendanceFor(
  attendance: TrainingAttendance | null,
  userId: string,
  count: number,
): boolean[] | null {
  if (!attendance || attendance.trainings.length === 0) return null
  const row = attendance.byUser[userId] ?? []
  const padded = Array.from({ length: attendance.trainings.length }, (_, i) => row[i] ?? false)
  // Fewer trainings than slots: the empty slots sit on the left (oldest).
  return [...Array.from({ length: Math.max(0, count - padded.length) }, () => false), ...padded]
}
