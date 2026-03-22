import {
  AppError,
  ClerkTokenExpiredError,
  NeonConnectionError,
  R2UploadError,
  ResendDeliveryError,
  SocketReconnectError,
  StripeSEPADeclineError,
  StripeWebhookSignatureError,
  TenantScopeViolationError,
  RateLimitExceededError,
  AgeGateError,
} from './base'

describe('Named exception classes', () => {
  it('ClerkTokenExpiredError has correct code, status, and userMessage', () => {
    const err = new ClerkTokenExpiredError('token expired')
    expect(err).toBeInstanceOf(AppError)
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('CLERK_TOKEN_EXPIRED')
    expect(err.httpStatus).toBe(401)
    expect(err.isOperational).toBe(true)
    expect(err.userMessage).toBe('Session expired. Please log in again.')
    expect(err.name).toBe('ClerkTokenExpiredError')
    expect(err.message).toBe('token expired')
  })

  it('NeonConnectionError → 503, operational', () => {
    const err = new NeonConnectionError('connection pool exhausted')
    expect(err.code).toBe('NEON_CONNECTION_ERROR')
    expect(err.httpStatus).toBe(503)
    expect(err.isOperational).toBe(true)
    expect(err.userMessage).toContain('temporarily unavailable')
  })

  it('R2UploadError → 502, operational', () => {
    const err = new R2UploadError('upload timeout')
    expect(err.code).toBe('R2_UPLOAD_ERROR')
    expect(err.httpStatus).toBe(502)
    expect(err.isOperational).toBe(true)
    expect(err.userMessage).toContain('Upload failed')
  })

  it('ResendDeliveryError → 502, operational', () => {
    const err = new ResendDeliveryError('bounce')
    expect(err.code).toBe('RESEND_DELIVERY_ERROR')
    expect(err.httpStatus).toBe(502)
    expect(err.isOperational).toBe(true)
  })

  it('SocketReconnectError → 503, operational', () => {
    const err = new SocketReconnectError('ws failed')
    expect(err.code).toBe('SOCKET_RECONNECT_ERROR')
    expect(err.httpStatus).toBe(503)
    expect(err.isOperational).toBe(true)
    expect(err.userMessage).toContain('Reconnecting')
  })

  it('StripeSEPADeclineError uses decline reason as userMessage', () => {
    const err = new StripeSEPADeclineError('declined', 'Insufficient funds')
    expect(err.code).toBe('STRIPE_SEPA_DECLINE')
    expect(err.httpStatus).toBe(402)
    expect(err.isOperational).toBe(true)
    expect(err.userMessage).toBe('Insufficient funds')
    expect(err.declineReason).toBe('Insufficient funds')
  })

  it('StripeSEPADeclineError falls back to generic message without reason', () => {
    const err = new StripeSEPADeclineError('declined')
    expect(err.userMessage).toContain('Payment was declined')
  })

  it('StripeWebhookSignatureError → 400, NOT operational (security)', () => {
    const err = new StripeWebhookSignatureError('bad sig')
    expect(err.code).toBe('STRIPE_WEBHOOK_SIGNATURE_INVALID')
    expect(err.httpStatus).toBe(400)
    expect(err.isOperational).toBe(false)
    expect(err.userMessage).toBe('Invalid request.')
  })

  it('TenantScopeViolationError → 403, NOT operational (security)', () => {
    const err = new TenantScopeViolationError('cross-tenant access')
    expect(err.code).toBe('TENANT_SCOPE_VIOLATION')
    expect(err.httpStatus).toBe(403)
    expect(err.isOperational).toBe(false)
  })

  it('RateLimitExceededError → 429, operational', () => {
    const err = new RateLimitExceededError('too fast')
    expect(err.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(err.httpStatus).toBe(429)
    expect(err.isOperational).toBe(true)
  })

  it('AgeGateError → 403, operational', () => {
    const err = new AgeGateError('under 16')
    expect(err.code).toBe('AGE_GATE_BLOCKED')
    expect(err.httpStatus).toBe(403)
    expect(err.isOperational).toBe(true)
    expect(err.userMessage).toContain('16 years old')
  })

  it('all errors have stack traces', () => {
    const err = new ClerkTokenExpiredError('test')
    expect(err.stack).toBeDefined()
    expect(err.stack).toContain('ClerkTokenExpiredError')
  })
})
