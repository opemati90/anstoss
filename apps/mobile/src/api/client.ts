const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'

// Guard: non-dev builds must have a real API URL configured
if (!__DEV__ && !process.env.EXPO_PUBLIC_API_URL) {
  throw new Error(
    'EXPO_PUBLIC_API_URL must be set for non-development builds',
  )
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type RequestOptions = {
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

/**
 * Token getter — set by AuthProvider once Clerk is ready.
 * This avoids a circular dependency between api client and auth context.
 */
let _getToken: (() => Promise<string | null>) | null = null

export function setTokenGetter(fn: () => Promise<string | null>) {
  _getToken = fn
}

/**
 * Response checker — set by useUpdateCheck to intercept 426 / X-Update-Available.
 * Uses the same setter pattern as the token getter to avoid circular deps.
 */
let _responseChecker: ((response: Response) => void) | null = null

export function setResponseChecker(fn: ((response: Response) => void) | null) {
  _responseChecker = fn
}

async function getToken(): Promise<string | null> {
  if (!_getToken) return null
  try {
    return await _getToken()
  } catch (err) {
    if (__DEV__) {
      console.warn('[api] Token fetch failed:', err)
    }
    return null
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = await getToken()
  const { method = 'GET', body, headers = {} } = options

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  // Check for update signals before consuming the body.
  // Clone so the checker can independently read the 426 body.
  if (_responseChecker) {
    _responseChecker(res.clone())
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new ApiError(
      error.message || `API error ${res.status}`,
      res.status,
      error.code,
    )
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export { API_URL, getToken }
