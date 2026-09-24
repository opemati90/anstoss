import type { RemindComplianceResult } from '@anstoss/shared'
import { ApiError } from '../../api/client'

// club-admin review fixes (M3): admin actions never show raw server text.
// Every failure maps to a translated sentence; stale-state errors (409, 404)
// always reload the list so the admin sees what actually happened.

export function adminActionErrorKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0 || error.code === 'network_error' || error.code === 'timeout') {
      return 'aufgaben.errorNetwork'
    }
    if (error.status === 403) return 'aufgaben.errorForbidden'
    if (error.status === 404) return 'aufgaben.errorNotFound'
    if (error.status === 409) return 'aufgaben.errorConflict'
    if (error.status === 400 || error.status === 422) return 'aufgaben.errorInvalid'
  }
  return 'aufgaben.actionError'
}

/** 409 (someone else decided first) and 404 (gone) mean the list is stale. */
export function shouldReloadAfterError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.status === 404)
}

/** Outcome of POST /contributions/reminders/send as shown on the button (L4). */
export type DuesReminderOutcome =
  | { kind: 'sent'; count: number }
  | { kind: 'alreadyToday' }
  | { kind: 'nobody' }

export function duesReminderOutcome(result: unknown): DuesReminderOutcome {
  const value = (result ?? {}) as { requested?: number; sent?: number }
  const sent = typeof value.sent === 'number' ? value.sent : 0
  const requested = typeof value.requested === 'number' ? value.requested : 0
  if (sent > 0) return { kind: 'sent', count: sent }
  // The server skips anyone already reminded today (manual:YYYY-MM-DD key).
  if (requested > 0) return { kind: 'alreadyToday' }
  return { kind: 'nobody' }
}

/** M1: a compliance reminder is either sent now or blocked by the 24h cooldown. */
export type ComplianceReminderState = 'sent' | 'cooldown'

export function complianceReminderState(result: unknown): ComplianceReminderState | 'failed' {
  const value = result as Partial<RemindComplianceResult> | null | undefined
  if (value?.sent === true) return 'sent'
  if (value && 'reason' in value && value.reason === 'cooldown') return 'cooldown'
  return 'failed'
}

export function complianceReminderLabelKey(state: ComplianceReminderState | undefined): string {
  if (state === 'sent') return 'aufgaben.reminded'
  if (state === 'cooldown') return 'aufgaben.remindedToday'
  return 'aufgaben.remind'
}
