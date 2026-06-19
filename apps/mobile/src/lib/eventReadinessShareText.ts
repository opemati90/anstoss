import type {
  EventReadiness,
  EventReadinessSignal,
  EventReadinessStatus,
} from '@anstoss/shared'

export type EventReadinessShareInput = {
  eventTitle?: string | null
  whenLabel?: string | null
  readiness: EventReadiness
}

type EventReadinessShareLabels = {
  title: string
  status: string
  confirmed: string
  maybe: string
  pending: string
  unavailable: string
  checkIns: string
  needsAction: string
  noBlockers: string
  sentFrom: string
}

const DEFAULT_LABELS: EventReadinessShareLabels = {
  title: 'Event readiness',
  status: 'Status',
  confirmed: 'Confirmed',
  maybe: 'Maybe',
  pending: 'Pending',
  unavailable: 'Unavailable',
  checkIns: 'Check-ins',
  needsAction: 'Needs action',
  noBlockers: 'No blockers detected',
  sentFrom: 'Sent from Anstoss',
}

export function formatEventReadinessWhen(
  date: string | Date,
  locale?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function buildEventReadinessShareText(
  input: EventReadinessShareInput,
  labels: Partial<EventReadinessShareLabels> = {},
): string {
  const l = { ...DEFAULT_LABELS, ...labels }
  const { readiness } = input
  const title = input.eventTitle?.trim() || l.title
  const header = [
    `Anstoss readiness: ${title}`,
    input.whenLabel?.trim() || null,
    `${l.status}: ${getStatusLabel(readiness.status)} (${readiness.score}/100)`,
  ]
    .filter(Boolean)
    .join('\n')

  const metricLines = [
    `${l.confirmed}: ${readiness.metrics.yesCount}/${readiness.metrics.squadSize}`,
    `${l.maybe}: ${readiness.metrics.maybeCount}`,
    `${l.unavailable}: ${readiness.metrics.noCount}`,
    `${l.pending}: ${readiness.metrics.pendingCount}`,
    `${l.checkIns}: ${readiness.metrics.checkInCount}`,
  ]

  const signalLines =
    readiness.signals.length > 0
      ? readiness.signals.map((signal) => `- ${getSignalLabel(signal)}`)
      : [`- ${l.noBlockers}`]

  return [
    header,
    metricLines.join('\n'),
    `${l.needsAction}:\n${signalLines.join('\n')}`,
    l.sentFrom,
  ]
    .join('\n\n')
    .trim()
}

function getStatusLabel(status: EventReadinessStatus): string {
  switch (status) {
    case 'READY':
      return 'Ready'
    case 'WATCH':
      return 'Watch'
    case 'AT_RISK':
      return 'At risk'
    case 'NEEDS_SETUP':
      return 'Needs setup'
  }
}

function getSignalLabel(signal: EventReadinessSignal): string {
  switch (signal.key) {
    case 'no_squad':
      return 'No active squad members yet'
    case 'low_confirmations':
      return `${signal.count ?? 0}/${signal.target ?? 0} confirmed`
    case 'low_response_rate':
      return `${signal.count ?? 0}/${signal.target ?? 0} players have replied`
    case 'pending_replies':
      return `${signal.count ?? 0} replies still pending`
    case 'availability_risks':
      return `${signal.count ?? 0} availability risks`
    case 'injury_risks':
      return `${signal.count ?? 0} injury or suspension risks`
    case 'check_in_gap':
      return `${signal.count ?? 0}/${signal.target ?? 0} checked in`
    case 'no_show_risk':
      return `${signal.count ?? 0} likely no-shows`
  }
}
