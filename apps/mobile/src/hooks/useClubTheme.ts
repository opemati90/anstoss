import { useState, useEffect, useCallback } from 'react'
import { useColorScheme } from 'react-native'
import {
  ClubConfig,
  ClubTheme,
  buildClubTheme,
  FALLBACK_THEME,
  FALLBACK_THEME_DARK,
} from '../theme/club-theme'
import { staleWhileRevalidate } from '../utils/cache'
import { api } from '../api/client'

/**
 * Hook: provides the current club's theme with stale-while-revalidate.
 *
 * 1. Renders immediately with fallback theme
 * 2. Loads club config from cache (instant)
 * 3. Fetches fresh config from API in background
 * 4. Re-renders when fresh config arrives
 *
 * Usage:
 *   const { theme, club, loading } = useClubTheme(clubId)
 */
export function useClubTheme(clubId: string | null) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const [club, setClub] = useState<ClubConfig | null>(null)
  const [loading, setLoading] = useState(!!clubId)

  const fetchClubConfig = useCallback(async (): Promise<ClubConfig> => {
    return api<ClubConfig>(`/clubs/${clubId}`)
  }, [clubId])

  useEffect(() => {
    if (!clubId) {
      setClub(null)
      setLoading(false)
      return
    }

    setLoading(true)

    staleWhileRevalidate<ClubConfig>(
      `club:${clubId}`,
      fetchClubConfig,
    )
      .then(setClub)
      .catch(() => {
        // Fallback theme handles missing club
        setClub(null)
      })
      .finally(() => setLoading(false))
  }, [clubId, fetchClubConfig])

  const theme: ClubTheme = club
    ? buildClubTheme(club, isDark)
    : isDark
      ? FALLBACK_THEME_DARK
      : FALLBACK_THEME

  return { theme, club, loading, isDark }
}
