import * as Sentry from '@sentry/react-native'

/**
 * Initialize Sentry for the mobile app.
 * Call in root _layout.tsx before rendering.
 * Disabled when EXPO_PUBLIC_SENTRY_DSN is not set (local dev).
 */
export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,
    enableAutoSessionTracking: true,
  })
}

/**
 * Attach user context to Sentry scope.
 */
export function setSentryUser(userId: string, clubId?: string) {
  Sentry.setUser({ id: userId })
  if (clubId) {
    Sentry.setTag('clubId', clubId)
  }
}

export { Sentry }
