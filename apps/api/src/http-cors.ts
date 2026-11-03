const PRODUCTION_HTTP_ORIGINS = new Set([
  'https://anstoss.io',
  'https://app.anstoss.io',
  'https://admin.anstoss.io',
  'https://api.anstoss.io',
])

const ANSTOSS_APP_ORIGIN = /^https:\/\/[a-z0-9-]+\.anstoss\.app$/i
const LOCAL_HTTP_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/

export function isHttpOriginAllowed(
  origin: string | undefined,
  environment = process.env.NODE_ENV,
): boolean {
  // Native clients and server-to-server requests may omit Origin. Browsers
  // can send it on same-origin POST requests, so the API origin is explicit.
  if (!origin) return true

  if (PRODUCTION_HTTP_ORIGINS.has(origin) || ANSTOSS_APP_ORIGIN.test(origin)) {
    return true
  }

  return environment !== 'production' && LOCAL_HTTP_ORIGIN.test(origin)
}
