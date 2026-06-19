import type {
  EventReadiness,
  EventReadinessBriefing,
  EventReadinessBriefingKey,
} from '@anstoss/shared'

export type TranslationFn = (
  key: string,
  options?: Record<string, unknown>,
) => string

const DEFAULT_BRIEFING_COPY: Record<EventReadinessBriefingKey, string> = {
  needs_setup: 'Add players before readiness can be calculated.',
  event_closed: 'Event has ended. Review attendance before follow-up.',
  no_show_review: 'Review attendance: {{count}} confirmed players were not checked in.',
  event_started: 'Event is underway. Use check-ins and attendance instead of RSVP nudges.',
  private_availability_review: 'Review private availability risks in Anstoss: {{count}}.',
  low_confirmations: 'Need {{count}} more confirmations to reach the match target.',
  check_in_gap: 'Check in arrivals: {{count}}/{{target}} confirmed players are marked present.',
  ready_clear: 'Squad is ready: {{yes}}/{{squad}} confirmed and no urgent blockers.',
  ready_pending: 'Squad is ready: {{yes}}/{{squad}} confirmed. Monitor pending replies: {{pending}}.',
  ready_availability:
    'Squad is ready: {{yes}}/{{squad}} confirmed. Monitor availability risks: {{risks}}.',
  ready_followups:
    'Squad is ready: {{yes}}/{{squad}} confirmed. Monitor pending replies ({{pending}}) and availability risks ({{risks}}).',
  pending_nudge: 'Send an RSVP nudge to pending replies: {{count}}.',
  pending_monitor: 'Monitor pending replies before kickoff: {{count}}.',
  availability_review: 'Review availability risks before finalizing the plan: {{count}}.',
  final_count: 'Confirm the final player count before kickoff.',
}

export function formatEventReadinessBriefing(
  briefing: EventReadiness['briefing'] | string | null | undefined,
  t?: TranslationFn,
): string | null {
  if (!briefing) return null
  if (typeof briefing === 'string') return briefing.trim() || null

  const structured = briefing as EventReadinessBriefing
  const defaultValue =
    structured.fallback || DEFAULT_BRIEFING_COPY[structured.key] || ''
  if (!defaultValue) return null

  if (!t) return defaultValue
  return t(`home.readiness.briefing.${structured.key}`, {
    defaultValue,
    ...(structured.params ?? {}),
  })
}

