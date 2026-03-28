import { getRuntimeConfig } from '../config/runtime'
import * as Application from 'expo-application'

const runtimeConfig = getRuntimeConfig()
const API_URL = runtimeConfig.apiUrl || 'http://localhost:3000'
const APP_VERSION = Application.nativeApplicationVersion || '0.0.0'

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

function parseResponseText(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return undefined

  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
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
  if (!__DEV__ && !runtimeConfig.apiUrl) {
    throw new ApiError(
      'EXPO_PUBLIC_API_URL must be set for non-development builds',
      500,
      'missing_api_url',
    )
  }

  const token = await getToken()
  const { method = 'GET', body, headers = {} } = options

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-App-Version': APP_VERSION,
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

  const rawBody = res.status === 204 ? '' : await res.text()
  const parsedBody = parseResponseText(rawBody)

  if (!res.ok) {
    const outer =
      parsedBody && typeof parsedBody === 'object' ? parsedBody as Record<string, unknown> : null
    // API wraps errors as { error: { message, code } } — unwrap if present
    const nested =
      outer?.error && typeof outer.error === 'object' ? outer.error as Record<string, unknown> : null
    const error = nested ?? outer
    throw new ApiError(
      typeof error?.message === 'string'
        ? error.message
        : rawBody.trim() || res.statusText || `API error ${res.status}`,
      res.status,
      typeof error?.code === 'string' ? error.code : undefined,
    )
  }

  if (res.status === 204) return undefined as T
  if (!rawBody.trim()) return undefined as T
  return parsedBody as T
}

export { API_URL, getToken }
