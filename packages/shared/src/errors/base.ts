/**
 * Named exception classes — mandated by CEO review.
 * No generic catch-all handlers. Every error has a name,
 * a rescue action, and a user-visible message.
 */

export abstract class AppError extends Error {
  abstract readonly code: string
  abstract readonly httpStatus: number
  abstract readonly isOperational: boolean

  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ClerkTokenExpiredError extends AppError {
  readonly code = 'CLERK_TOKEN_EXPIRED'
  readonly httpStatus = 401
  readonly isOperational = true
}

export class NeonConnectionError extends AppError {
  readonly code = 'NEON_CONNECTION_ERROR'
  readonly httpStatus = 503
  readonly isOperational = true
}

export class R2UploadError extends AppError {
  readonly code = 'R2_UPLOAD_ERROR'
  readonly httpStatus = 502
  readonly isOperational = true
}

export class ResendDeliveryError extends AppError {
  readonly code = 'RESEND_DELIVERY_ERROR'
  readonly httpStatus = 502
  readonly isOperational = true
}

export class SocketReconnectError extends AppError {
  readonly code = 'SOCKET_RECONNECT_ERROR'
  readonly httpStatus = 503
  readonly isOperational = true
}

export class StripeSEPADeclineError extends AppError {
  readonly code = 'STRIPE_SEPA_DECLINE'
  readonly httpStatus = 402
  readonly isOperational = true
}

export class StripeWebhookSignatureError extends AppError {
  readonly code = 'STRIPE_WEBHOOK_SIGNATURE_INVALID'
  readonly httpStatus = 400
  readonly isOperational = false // security — never ignore
}

export class TenantScopeViolationError extends AppError {
  readonly code = 'TENANT_SCOPE_VIOLATION'
  readonly httpStatus = 403
  readonly isOperational = false // security — never ignore
}

export class RateLimitExceededError extends AppError {
  readonly code = 'RATE_LIMIT_EXCEEDED'
  readonly httpStatus = 429
  readonly isOperational = true
}

export class AgeGateError extends AppError {
  readonly code = 'AGE_GATE_BLOCKED'
  readonly httpStatus = 403
  readonly isOperational = true
}
