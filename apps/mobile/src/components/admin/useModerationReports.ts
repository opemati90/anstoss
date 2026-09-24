import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client'

export type ModerationReport = {
  id: string
  kind: 'channel' | 'direct'
  /** SPAM | ABUSE | INAPPROPRIATE | OTHER (free text tolerated). */
  reason: string
  createdAt: string
  resolvedAt: string | null
  resolution: string | null
  /** Open and older than the 24h response target. */
  overdue: boolean
  reporter: { id: string; name: string | null }
  message: {
    id: string
    content: string
    removed: boolean
    createdAt: string
    sender: { id: string; name: string | null } | null
    teamId: string | null
    channelId: string | null
    /**
     * Reported attachment as evidence: a signed URL valid for ~5 minutes, or
     * null. Re-fetch the list for a fresh URL.
     */
    attachment?: { url: string; meta: unknown } | null
  }
}

/**
 * Open-report summary for the Aufgaben inbox and the Verein tab badge.
 * Tolerant: a failure (or a club without the moderation module) reads as
 * "no reports" so it never blocks the admin's home.
 */
export function useOpenReportsSummary(clubId: string | null | undefined) {
  const [summary, setSummary] = useState<{ count: number; overdue: number }>({ count: 0, overdue: 0 })

  const reload = useCallback(async () => {
    if (!clubId) return
    try {
      const rows = await api<ModerationReport[]>(
        `/clubs/${clubId}/moderation/reports?status=open&limit=100`,
      )
      const list = Array.isArray(rows) ? rows : []
      setSummary({ count: list.length, overdue: list.filter((row) => row.overdue).length })
    } catch {
      setSummary({ count: 0, overdue: 0 })
    }
  }, [clubId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { ...summary, reload }
}
