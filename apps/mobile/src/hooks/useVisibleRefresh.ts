import { useCallback } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'

/** Revalidate permission-bearing data on focus/resume and while visible. */
export function useVisibleRefresh(refresh: (fresh: boolean) => Promise<unknown>, enabled = true) {
  useFocusEffect(useCallback(() => {
    if (!enabled) return
    let state = AppState.currentState
    let disposed = false
    const run = (fresh: boolean) => {
      if (!disposed && state === 'active') void refresh(fresh).catch(() => undefined)
    }
    run(true)
    const subscription = AppState.addEventListener('change', next => {
      const previous = state
      state = next
      if (next === 'active' && previous !== 'active') run(true)
    })
    const timer = setInterval(() => run(false), 15_000)
    return () => {
      disposed = true
      clearInterval(timer)
      subscription.remove()
    }
  }, [refresh, enabled]))
}
