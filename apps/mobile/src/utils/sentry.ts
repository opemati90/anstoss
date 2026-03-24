/**
 * Sentry initialization for the mobile app.
 *
 * Call this in the root _layout.tsx before rendering.
 * DSN from EXPO_PUBLIC_SENTRY_DSN environment variable.
 * Disabled when DSN is not set (local dev).
 */
type SentryModule = {
  init(config: {
    dsn: string
    environment: string
    tracesSampleRate: number
    enableAutoSessionTracking: boolean
  }): void
  setTag(key: string, value: string): void
  setUser(user: { id: string }): void
}

function loadSentry(): SentryModule | null {
  try {
    return require('@sentry/react-native') as SentryModule
  } catch {
    return null
  }
}

export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN
  if (!dsn) return

  const Sentry = loadSentry()
  if (!Sentry) return

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
  const Sentry = loadSentry()
  if (!Sentry) return

  Sentry.setUser({ id: userId })
  if (clubId) {
    Sentry.setTag('clubId', clubId)
  }
}
