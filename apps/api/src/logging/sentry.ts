/**
 * Sentry initialization for the API.
 *
 * Call this BEFORE NestJS bootstrap (in main.ts).
 * DSN from SENTRY_DSN environment variable.
 * Disabled when SENTRY_DSN is not set (local dev).
 */
export function initSentry() {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sentry = require('@sentry/node')
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend(event: Record<string, unknown>) {
        // Strip any PII that might leak into error reports
      const request = event.request as Record<string, unknown> | undefined
      if (request?.headers) {
        const headers = request.headers as Record<string, unknown>
        delete headers['authorization']
        delete headers['cookie']
      }
      return event
    },
  })
}

/**
 * Attach user context to Sentry scope.
 * Call from auth guard after identifying the user.
 */
export function setSentryUser(userId: string, clubId?: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/node')
    Sentry.setUser({ id: userId })
    if (clubId) {
      Sentry.setTag('clubId', clubId)
    }
  } catch {
    // Sentry not available — no-op
  }
}
