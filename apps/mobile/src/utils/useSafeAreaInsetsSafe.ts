import { useSafeAreaInsets } from 'react-native-safe-area-context'

const ZERO = { top: 0, bottom: 0, left: 0, right: 0 }

// Wraps useSafeAreaInsets so test renderers without SafeAreaProvider don't crash.
// Production trees always sit inside SafeAreaProvider via app/_layout.tsx.
export function useSafeAreaInsetsSafe() {
  try {
    return useSafeAreaInsets()
  } catch {
    return ZERO
  }
}
