/**
 * Haptic feedback helpers — wrap expo-haptics with named intents so
 * call sites read like "Haptics.tap()" instead of fiddling with the
 * underlying enum values.
 *
 * All calls are safe no-ops on platforms without haptic support and
 * silently swallow failures so a bad device never crashes a tap.
 */
import * as ExpoHaptics from 'expo-haptics'
import { AccessibilityInfo } from 'react-native'

let reduceMotionEnabled = false
let reduceMotionSubscription: { remove: () => void } | null = null

// Listener is attached lazily on first haptic call so tests that never trigger
// haptics don't leak an AccessibilityInfo subscription past teardown.
function ensureReduceMotionWatcher() {
  if (reduceMotionSubscription) return
  reduceMotionSubscription = AccessibilityInfo.addEventListener(
    'reduceMotionChanged',
    (enabled) => {
      reduceMotionEnabled = enabled
    },
  )
  void AccessibilityInfo.isReduceMotionEnabled()
    .then((enabled) => {
      reduceMotionEnabled = enabled
    })
    .catch(() => {})
}

export function __resetReduceMotionWatcherForTests() {
  reduceMotionSubscription?.remove()
  reduceMotionSubscription = null
  reduceMotionEnabled = false
}

function safe<T>(fn: () => Promise<T>) {
  ensureReduceMotionWatcher()
  if (reduceMotionEnabled) return
  void fn().catch(() => {})
}

/**
 * Light tap — selection changes, toggles, chip selects.
 */
export function select() {
  safe(() => ExpoHaptics.selectionAsync())
}

/**
 * Soft impact — default button tap feel.
 */
export function tap() {
  safe(() => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light))
}

/**
 * Medium impact — commit actions (create, send, confirm).
 */
export function tapMedium() {
  safe(() => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium))
}

/**
 * Heavy impact — reserved for destructive confirmations.
 */
export function tapHeavy() {
  safe(() => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy))
}

/**
 * Success notification — RSVP yes, payment received, save complete.
 */
export function success() {
  safe(() =>
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success),
  )
}

/**
 * Warning notification — overdue, tentative state.
 */
export function warn() {
  safe(() =>
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning),
  )
}

/**
 * Error notification — failed send, validation fail, declined RSVP.
 */
export function fail() {
  safe(() =>
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error),
  )
}

export const Haptics = {
  select,
  tap,
  tapMedium,
  tapHeavy,
  success,
  warn,
  fail,
}

export default Haptics
