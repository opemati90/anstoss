import { useCallback, useRef } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { subscribeNotifications } from '../lib/notificationEvents'

/** Push is best-effort. Keep a visible work queue fresh even if permission is denied. */
export function useForegroundRefresh(refresh: () => Promise<unknown>, enabled = true) {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return
      let inFlight = false
      let disposed = false
      const run = async () => {
        if (disposed || inFlight || AppState.currentState !== 'active') return
        inFlight = true
        try {
          await refreshRef.current()
        } catch {
          // The owning screen retains its last data/error state; a failed
          // background refresh must not become an unhandled rejection.
        } finally {
          inFlight = false
        }
      }
      const unsubscribe = subscribeNotifications(() => {
        void run()
      })
      const foreground = AppState.addEventListener('change', (state) => {
        if (state === 'active') void run()
      })
      const timer = setInterval(() => {
        void run()
      }, 15_000)
      return () => {
        disposed = true
        unsubscribe()
        foreground.remove()
        clearInterval(timer)
      }
    }, [enabled]),
  )
}
