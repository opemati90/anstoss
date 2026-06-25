type OriginCallback = (err: Error | null, allow?: boolean) => void

const PROD_SOCKET_ORIGINS: Array<string | RegExp> = [
  'https://anstoss.io',
  'https://app.anstoss.io',
  /^https:\/\/[a-z0-9-]+\.anstoss\.app$/i,
]

export function isSocketOriginAllowed(
  origin: string | undefined,
  env: string | undefined = process.env.NODE_ENV,
) {
  if (!origin) return true
  if (env !== 'production') return true

  return PROD_SOCKET_ORIGINS.some((rule) =>
    typeof rule === 'string' ? rule === origin : rule.test(origin),
  )
}

export function getSocketCorsOptions() {
  if (process.env.NODE_ENV !== 'production') {
    return { origin: '*' }
  }

  return {
    origin(origin: string | undefined, callback: OriginCallback) {
      const allowed = isSocketOriginAllowed(origin, 'production')
      callback(allowed ? null : new Error(`Socket CORS: origin ${origin} not allowed`), allowed)
    },
  }
}
