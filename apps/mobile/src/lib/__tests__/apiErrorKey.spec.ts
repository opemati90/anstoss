import { apiErrorKey } from '../apiErrorKey'
import { ApiError } from '../../api/client'

describe('apiErrorKey', () => {
  it('maps ApiError code "timeout" to errors.api.timeout', () => {
    expect(apiErrorKey(new ApiError('t', 504, 'timeout'))).toBe('errors.api.timeout')
  })

  it('maps ApiError code "network_error" to errors.api.network', () => {
    expect(apiErrorKey(new ApiError('n', 0, 'network_error'))).toBe('errors.api.network')
  })

  it('maps ApiError code "CLERK_TOKEN_EXPIRED" to errors.api.session', () => {
    expect(apiErrorKey(new ApiError('s', 401, 'CLERK_TOKEN_EXPIRED'))).toBe('errors.api.session')
  })

  it('maps ApiError status 401 (no code) to errors.api.session', () => {
    expect(apiErrorKey(new ApiError('s', 401))).toBe('errors.api.session')
  })

  it('maps ApiError status 403 to errors.api.permission', () => {
    expect(apiErrorKey(new ApiError('f', 403))).toBe('errors.api.permission')
  })

  it('maps ApiError status 429 to errors.api.rateLimit', () => {
    expect(apiErrorKey(new ApiError('r', 429))).toBe('errors.api.rateLimit')
  })

  it('maps ApiError status 503 to errors.api.unavailable', () => {
    expect(apiErrorKey(new ApiError('u', 503))).toBe('errors.api.unavailable')
  })

  it('maps ApiError status 504 to errors.api.timeout', () => {
    expect(apiErrorKey(new ApiError('t', 504))).toBe('errors.api.timeout')
  })

  it('maps plain Error to errors.api.generic', () => {
    expect(apiErrorKey(new Error('boom'))).toBe('errors.api.generic')
  })

  it('maps null/undefined to errors.api.generic', () => {
    expect(apiErrorKey(null)).toBe('errors.api.generic')
    expect(apiErrorKey(undefined)).toBe('errors.api.generic')
  })
})
