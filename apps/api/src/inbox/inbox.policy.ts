import type { NotificationType } from '../push/push.templates'

/**
 * Which push templates also land in the notifications inbox (screen 09).
 *
 * The inbox is a record of things worth acting on or checking later. Chat
 * traffic is excluded (chat has its own unread counts), as are reminders that
 * only repeat an earlier entry and live goal pings that the match screen shows.
 */
const INBOX_TYPES = new Set<NotificationType>([
  'EVENT_CREATED',
  'EVENT_UPDATED',
  'EVENT_CANCELLED',
  'RSVP_UPDATE',
  'ANNOUNCEMENT',
  'JOIN_REQUEST',
  'JOIN_APPROVED',
  'JOIN_REJECTED',
  'CONTRIBUTION_PAID',
  'CONTRIBUTION_DUE',
  'TRIAL_INVITE',
  'TRIAL_RESPONSE',
  'TRIAL_REQUEST',
  'TRIAL_OFFER',
  'TRIAL_DECLINED_BY_CLUB',
  'TRIAL_REVOKED',
  'LINEUP_POSTED',
  'FULL_TIME',
  'COMPLIANCE_REMINDER',
  'CONSENT_WITHDRAWN',
  'CONSENT_REQUESTED',
  'MODERATION_REPORT_CREATED',
  'MODERATION_REPORTS_BATCH',
  // Vorschau und Vertretung: someone acts as the team's coach.
  'ACTING_SESSION_STARTED',
])

/** Computed (non-template) pushes that are inbox-worthy, keyed by a stable type. */
export const INBOX_RENDERED_TYPES = [
  'FIXTURE_CHANGED',
  'EVENT_CREATED',
  'EVENT_UPDATED',
  'EVENT_CANCELLED',
] as const
export type InboxRenderedType = (typeof INBOX_RENDERED_TYPES)[number]

export function isInboxWorthy(type: NotificationType, data: unknown): boolean {
  if (!INBOX_TYPES.has(type)) return false
  // A coach gets an RSVP push for every reply; only an Absage needs their
  // attention later, so only that is kept in the inbox.
  if (type === 'RSVP_UPDATE') {
    return (data as { status?: string } | null)?.status === 'NO'
  }
  return true
}
