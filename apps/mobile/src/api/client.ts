const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'

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

async function getToken(): Promise<string | null> {
  if (!_getToken) return null
  try {
    return await _getToken()
  } catch {
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

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message || `API error ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export { API_URL, getToken }
