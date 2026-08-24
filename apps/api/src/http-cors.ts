const PRODUCTION_HTTP_ORIGINS = new Set([
  'https://anstoss.io',
  'https://app.anstoss.io',
  'https://admin.anstoss.io',
])

const ANSTOSS_APP_ORIGIN = /^https:\/\/[a-z0-9-]+\.anstoss\.app$/i
const LOCAL_HTTP_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/

export function isHttpOriginAllowed(
  origin: string | undefined,
  environment = process.env.NODE_ENV,
): boolean {
  // Native clients, server-to-server requests, and same-origin requests do not
  // send an Origin header.
  if (!origin) return true

  if (PRODUCTION_HTTP_ORIGINS.has(origin) || ANSTOSS_APP_ORIGIN.test(origin)) {
    return true
  }

  return environment !== 'production' && LOCAL_HTTP_ORIGIN.test(origin)
}
