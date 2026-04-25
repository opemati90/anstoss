import { ApiError } from '../api/client'

export type ApiErrorKey =
  | 'errors.api.network'
  | 'errors.api.offline'
  | 'errors.api.timeout'
  | 'errors.api.rateLimit'
  | 'errors.api.session'
  | 'errors.api.permission'
  | 'errors.api.unavailable'
  | 'errors.api.generic'

const CODE_MAP: Record<string, ApiErrorKey> = {
  timeout: 'errors.api.timeout',
  network_error: 'errors.api.network',
  CLERK_TOKEN_EXPIRED: 'errors.api.session',
  RATE_LIMIT_EXCEEDED: 'errors.api.rateLimit',
  TENANT_SCOPE_VIOLATION: 'errors.api.permission',
  TEAM_ACCESS_DENIED: 'errors.api.permission',
  NEON_CONNECTION_ERROR: 'errors.api.unavailable',
}

function keyForStatus(status: number): ApiErrorKey {
  if (status === 0) return 'errors.api.network'
  if (status === 401) return 'errors.api.session'
  if (status === 403) return 'errors.api.permission'
  if (status === 408 || status === 504) return 'errors.api.timeout'
  if (status === 429) return 'errors.api.rateLimit'
  if (status >= 500) return 'errors.api.unavailable'
  return 'errors.api.generic'
}

export function apiErrorKey(err: unknown): ApiErrorKey {
  if (err instanceof ApiError) {
    if (err.code && CODE_MAP[err.code]) return CODE_MAP[err.code]
    return keyForStatus(err.status)
  }
  return 'errors.api.generic'
}
