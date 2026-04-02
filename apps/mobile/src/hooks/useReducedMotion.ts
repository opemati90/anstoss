import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * Returns true when the user has enabled "Reduce Motion" in system settings.
 * Per DESIGN.md: disable all transitions except opacity when enabled.
 */
export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion)
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    )
    return () => subscription.remove()
  }, [])

  return reduceMotion
}
