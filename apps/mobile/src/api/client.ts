import { Alert } from 'react-native'
import { getRuntimeConfig } from '../config/runtime'
import * as Application from 'expo-application'
import { getE2ESession, handleE2EApiRequest } from '../e2e/session'
import i18n from '../i18n'

const runtimeConfig = getRuntimeConfig()
const API_URL = runtimeConfig.apiUrl || 'http://localhost:3001'
const APP_VERSION = Application.nativeApplicationVersion || '0.0.0'
const REQUEST_TIMEOUT_MS = 12000

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
 * Sign-out handler — set by AuthProvider once Clerk is ready.
 * Called automatically on 401 responses to force sign-out.
 * Uses the same setter pattern as the token getter to avoid circular deps.
 */
let _signOutHandler: (() => Promise<void>) | null = null
let _signingOut = false
let _suspendAuthExpiryHandling = false

export function setSignOutHandler(fn: (() => Promise<void>) | null) {
  _signOutHandler = fn
  _signingOut = false
}

export function setAuthExpiryHandlingSuspended(suspended: boolean) {
  _suspendAuthExpiryHandling = suspended
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
  const e2eResponse = handleE2EApiRequest(path, { method, body })

  if (e2eResponse.handled) {
    if (!e2eResponse.ok) {
      throw new ApiError(
        e2eResponse.message || `API error ${e2eResponse.status}`,
        e2eResponse.status,
        e2eResponse.code,
      )
    }

    return e2eResponse.body as T
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response

  try {
    const acceptLanguage = i18n.resolvedLanguage || i18n.language || 'de'
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-App-Version': APP_VERSION,
        'Accept-Language': acceptLanguage,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      signal: controller.signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(
        `Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`,
        504,
        'timeout',
      )
    }
    throw new ApiError(
      'Network request failed. Please check your connection.',
      0,
      'network_error',
    )
  }

  clearTimeout(timeoutId)

  // Check for update signals before consuming the body.
  // Clone so the checker can independently read the 426 body.
  if (_responseChecker) {
    _responseChecker(res.clone())
  }

  const rawBody = res.status === 204 ? '' : await res.text()
  const parsedBody = parseResponseText(rawBody)

  if (!res.ok) {
    // Global 401 handling: sign the user out when the token is invalid/expired.
    // Guard with _signingOut flag to prevent cascading sign-out calls from
    // concurrent requests that all receive 401.
    if (
      res.status === 401 &&
      !_suspendAuthExpiryHandling &&
      !getE2ESession() &&
      _signOutHandler &&
      !_signingOut
    ) {
      _signingOut = true
      Alert.alert(
        i18n.t('common.errorTitle'),
        i18n.t('auth.sessionExpired'),
      )
      try {
        await _signOutHandler()
      } catch (err) {
        if (__DEV__) {
          console.warn('[api] Auto sign-out on 401 failed:', err)
        }
      } finally {
        _signingOut = false
      }
    }

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

export { API_URL }
