import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import type { StreaksResponse } from '@anstoss/shared'
import { api, ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'

export type UseStreaksResult = {
  data: StreaksResponse | null
  loading: boolean
  refreshing: boolean
  error: Error | null
  refresh: () => void
}

const EMPTY: StreaksResponse = {
  me: {
    attendanceWeeks: 0,
    attendanceLongest: 0,
    motmWeeks: 0,
    motmLongest: 0,
    lastActivityAt: '',
  },
  leaderboard: [],
}

/**
 * Verified streak aggregates for the active club, refetched on focus.
 *
 * Gated on `activeClub` so it never fires (and never caches an empty result)
 * while the session token is still restoring — the screen stays in `loading`
 * until a club is actually selected. A 403/404 is treated as "no data yet"
 * rather than an error so brand-new members see an empty state, not a crash.
 */
export function useStreaks(): UseStreaksResult {
  const { activeClub } = useAuth()
  const [data, setData] = useState<StreaksResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = useCallback(async () => {
    if (!activeClub) {
      setData(EMPTY)
      setError(null)
      setLoading(false)
      setRefreshing(false)
      return
    }
    try {
      const result = await api<StreaksResponse>(
        `/clubs/${activeClub.club.id}/streaks`,
      )
      setData(result)
      setError(null)
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
        setData(EMPTY)
        setError(null)
      } else {
        if (__DEV__) console.warn('[useStreaks] load failed:', err)
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeClub])

  useFocusEffect(
    useCallback(() => {
      void fetchData()
    }, [fetchData]),
  )

  const refresh = useCallback(() => {
    setRefreshing(true)
    void fetchData()
  }, [fetchData])

  return { data, loading, refreshing, error, refresh }
}
