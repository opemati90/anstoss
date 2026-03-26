import { useEffect, useRef } from 'react'
import { useRouter } from 'expo-router'
import { useAuth } from '../context/AuthContext'

/**
 * Resets the navigation stack to the home tab whenever the active club changes.
 * Mount this in the tab layout so stale screens from the previous club are cleared.
 */
export function useClubSwitchGuard() {
  const { activeClub } = useAuth()
  const router = useRouter()
  const prevClubId = useRef(activeClub?.club.id)

  useEffect(() => {
    const currentId = activeClub?.club.id
    if (prevClubId.current && currentId && prevClubId.current !== currentId) {
      router.replace('/(tabs)')
    }
    prevClubId.current = currentId
  }, [activeClub?.club.id, router])
}
