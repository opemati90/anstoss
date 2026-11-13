import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { moreSummarySchema, type MoreSummary } from '@anstoss/shared'
import { api } from '../api/client'

/**
 * The right-aligned values on Mehr (board 18): open dues, table place, new
 * free agents, team code. One cheap read per focus; a server without
 * `GET /me/summary` (or any failure) just leaves the values empty.
 */
export function useMoreSummary(clubId: string | null, teamId: string | null): MoreSummary | null {
  const [summary, setSummary] = useState<MoreSummary | null>(null)

  useFocusEffect(
    useCallback(() => {
      if (!clubId) {
        setSummary(null)
        return
      }
      let cancelled = false
      const params = new URLSearchParams({ clubId, ...(teamId ? { teamId } : {}) })
      api<unknown>(`/me/summary?${params.toString()}`)
        .then((raw) => {
          if (cancelled) return
          const parsed = moreSummarySchema.safeParse(raw)
          setSummary(parsed.success ? parsed.data : null)
        })
        .catch(() => {
          if (!cancelled) setSummary(null)
        })
      return () => {
        cancelled = true
      }
    }, [clubId, teamId]),
  )

  return summary
}
