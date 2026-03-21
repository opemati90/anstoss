/**
 * Named exception classes — mandated by CEO review.
 * No generic catch-all handlers. Every error has a name,
 * a rescue action, and a user-visible message.
 */

export abstract class AppError extends Error {
  abstract readonly code: string
  abstract readonly httpStatus: number
  abstract readonly isOperational: boolean
  /** Safe to show to the end user (no internals) */
  abstract readonly userMessage: string

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
  readonly userMessage = 'Session expired. Please log in again.'
}

export class NeonConnectionError extends AppError {
  readonly code = 'NEON_CONNECTION_ERROR'
  readonly httpStatus = 503
  readonly isOperational = true
  readonly userMessage = 'Service temporarily unavailable. Please try again.'
}

export class R2UploadError extends AppError {
  readonly code = 'R2_UPLOAD_ERROR'
  readonly httpStatus = 502
  readonly isOperational = true
  readonly userMessage = 'Upload failed. Please try again.'
}

export class ResendDeliveryError extends AppError {
  readonly code = 'RESEND_DELIVERY_ERROR'
  readonly httpStatus = 502
  readonly isOperational = true
  readonly userMessage = 'Email delivery failed.'
}

export class SocketReconnectError extends AppError {
  readonly code = 'SOCKET_RECONNECT_ERROR'
  readonly httpStatus = 503
  readonly isOperational = true
  readonly userMessage = 'Connection lost. Reconnecting...'
}

export class StripeSEPADeclineError extends AppError {
  readonly code = 'STRIPE_SEPA_DECLINE'
  readonly httpStatus = 402
  readonly isOperational = true
  readonly userMessage: string

  constructor(message: string, public readonly declineReason?: string) {
    super(message)
    this.userMessage = declineReason || 'Payment was declined. Please check your bank details.'
  }
}

export class StripeWebhookSignatureError extends AppError {
  readonly code = 'STRIPE_WEBHOOK_SIGNATURE_INVALID'
  readonly httpStatus = 400
  readonly isOperational = false // security — never ignore
  readonly userMessage = 'Invalid request.'
}

export class TenantScopeViolationError extends AppError {
  readonly code = 'TENANT_SCOPE_VIOLATION'
  readonly httpStatus = 403
  readonly isOperational = false // security — never ignore
  readonly userMessage = 'Access denied.'
}

export class RateLimitExceededError extends AppError {
  readonly code = 'RATE_LIMIT_EXCEEDED'
  readonly httpStatus = 429
  readonly isOperational = true
  readonly userMessage = 'Too many requests. Please wait a moment.'
}

export class AgeGateError extends AppError {
  readonly code = 'AGE_GATE_BLOCKED'
  readonly httpStatus = 403
  readonly isOperational = true
  readonly userMessage = 'You must be at least 16 years old to use Anstoss.'
}
