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

export class InviteRecipientMismatchError extends AppError {
  readonly code = 'INVITE_RECIPIENT_MISMATCH'
  readonly httpStatus = 403
  readonly isOperational = true
  readonly userMessage = 'This invite belongs to a different email address.'
}

export class ParentalConsentRequiredError extends AppError {
  readonly code = 'PARENTAL_CONSENT_REQUIRED'
  readonly httpStatus = 403
  readonly isOperational = true
  readonly userMessage =
    'Parental approval is required before this account can access the team.'
}

export class TeamAccessDeniedError extends AppError {
  readonly code = 'TEAM_ACCESS_DENIED'
  readonly httpStatus = 403
  readonly isOperational = true
  readonly userMessage = 'You do not have access to this team.'
}

export class JoinCodeExhaustionError extends AppError {
  readonly code = 'JOIN_CODE_EXHAUSTION'
  readonly httpStatus = 500
  readonly isOperational = true
  readonly userMessage = 'Could not allocate a unique join code. Please try again.'

  constructor() {
    super('Could not allocate unique join code after max retries')
  }
}

export class RosterSlotAlreadyClaimedError extends AppError {
  readonly code = 'ROSTER_SLOT_ALREADY_CLAIMED'
  readonly httpStatus = 409
  readonly isOperational = true
  readonly userMessage = 'This slot has already been claimed.'

  constructor() {
    super('Slot already claimed')
  }
}

export class UserAlreadyOnRosterError extends AppError {
  readonly code = 'USER_ALREADY_ON_ROSTER'
  readonly httpStatus = 409
  readonly isOperational = true
  readonly userMessage = 'You already have a slot on this team.'

  constructor() {
    super('You are already on the roster for this team')
  }
}

export class ManagedSubProfileAgeError extends AppError {
  readonly code = 'MANAGED_SUB_PROFILE_AGE_INVALID'
  readonly httpStatus = 400
  readonly isOperational = true
  readonly userMessage =
    '16 and older must register their own account.'

  constructor() {
    super(
      '16+ users must register their own account via phone OTP, not as a managed sub-profile',
    )
  }
}

export class ManagedSubProfileSlotUnavailableError extends AppError {
  readonly code = 'MANAGED_SUB_PROFILE_SLOT_UNAVAILABLE'
  readonly httpStatus = 400
  readonly isOperational = true
  readonly userMessage = 'That roster slot is not available.'

  constructor() {
    super('Roster slot not available')
  }
}

/** Live match clock moved in an order that does not exist (e.g. half time before kick-off). */
export class MatchLiveTransitionError extends AppError {
  readonly code = 'MATCH_LIVE_TRANSITION'
  readonly httpStatus = 409
  readonly isOperational = true
  readonly userMessage = 'The match is not in a state that allows this step.'

  constructor(from: string, to: string) {
    super(`Cannot move live match from ${from} to ${to}`)
  }
}

/** Live tracking was requested for an event that is not a match, or not yet started. */
export class MatchLiveUnavailableError extends AppError {
  readonly code = 'MATCH_LIVE_UNAVAILABLE'
  readonly httpStatus = 400
  readonly isOperational = true
  readonly userMessage = 'Live tracking is only available for a match that has kicked off.'

  constructor(reason: string) {
    super(reason)
  }
}

// ─── Vorschau und Vertretung (acting sessions) ──────────────

/** Only Vorstand (any team) and Teammanager (own team) may stand in for a coach. */
export class ActingSessionForbiddenError extends AppError {
  readonly code = 'ACTING_SESSION_FORBIDDEN'
  readonly httpStatus = 403
  readonly isOperational = true
  readonly userMessage = 'Only the club board, or a team manager for their own team, can stand in for a coach.'
}

/** The team to act for does not exist in this club. */
export class ActingSessionTeamNotFoundError extends AppError {
  readonly code = 'ACTING_SESSION_TEAM_NOT_FOUND'
  readonly httpStatus = 404
  readonly isOperational = true
  readonly userMessage = 'This team was not found in your club.'
}

/** There is no running acting session to end. */
export class ActingSessionNotActiveError extends AppError {
  readonly code = 'ACTING_SESSION_NOT_ACTIVE'
  readonly httpStatus = 404
  readonly isOperational = true
  readonly userMessage = 'There is no active stand-in session.'
}
