/**
 * Sentry initialization for the mobile app.
 *
 * Call this in the root _layout.tsx before rendering.
 * DSN from EXPO_PUBLIC_SENTRY_DSN environment variable.
 * Disabled when DSN is not set (local dev).
 */
export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN
  if (!dsn) return

  // Dynamic import to keep Sentry optional in dev
  import('@sentry/react-native').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: __DEV__ ? 'development' : 'production',
      tracesSampleRate: __DEV__ ? 1.0 : 0.1,
      enableAutoSessionTracking: true,
    })
  })
}

/**
 * Attach user context to Sentry scope.
 */
export function setSentryUser(userId: string, clubId?: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native')
    Sentry.setUser({ id: userId })
    if (clubId) {
      Sentry.setTag('clubId', clubId)
    }
  } catch {
    // Sentry not available — no-op
  }
}
