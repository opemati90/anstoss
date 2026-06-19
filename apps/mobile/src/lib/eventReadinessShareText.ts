import type {
  EventReadiness,
  EventReadinessSignal,
  EventReadinessStatus,
} from '@anstoss/shared'
import {
  formatEventReadinessBriefing,
  type TranslationFn,
} from './eventReadinessBriefing'

export type EventReadinessShareInput = {
  eventTitle?: string | null
  whenLabel?: string | null
  readiness: EventReadiness
  t?: TranslationFn
}

type EventReadinessShareLabels = {
  heading: string
  title: string
  status: string
  briefing: string
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
  heading: 'Anstoss readiness: {{title}}',
  title: 'Event readiness',
  status: 'Status',
  briefing: 'Briefing',
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
  const l = buildShareLabels(input.t, labels)
  const { readiness } = input
  const title = input.eventTitle?.trim() || l.title
  const briefing = formatEventReadinessBriefing(readiness.briefing, input.t)
  const header = [
    formatTemplate(l.heading, { title }),
    input.whenLabel?.trim() || null,
    `${l.status}: ${getStatusLabel(readiness.status, input.t)} (${readiness.score}/100)`,
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
      ? readiness.signals.map((signal) => `- ${getSignalLabel(signal, input.t)}`)
      : [`- ${l.noBlockers}`]

  return [
    header,
    briefing ? `${l.briefing}: ${briefing}` : null,
    metricLines.join('\n'),
    `${l.needsAction}:\n${signalLines.join('\n')}`,
    l.sentFrom,
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function buildShareLabels(
  t: TranslationFn | undefined,
  labels: Partial<EventReadinessShareLabels>,
): EventReadinessShareLabels {
  return {
    heading:
      labels.heading ??
      translate(t, 'home.readiness.share.heading', DEFAULT_LABELS.heading),
    title: labels.title ?? translate(t, 'home.readiness.share.title', DEFAULT_LABELS.title),
    status: labels.status ?? translate(t, 'home.readiness.share.status', DEFAULT_LABELS.status),
    briefing:
      labels.briefing ?? translate(t, 'home.readiness.share.briefing', DEFAULT_LABELS.briefing),
    confirmed:
      labels.confirmed ?? translate(t, 'home.readiness.share.confirmed', DEFAULT_LABELS.confirmed),
    maybe: labels.maybe ?? translate(t, 'home.readiness.share.maybe', DEFAULT_LABELS.maybe),
    pending:
      labels.pending ?? translate(t, 'home.readiness.share.pending', DEFAULT_LABELS.pending),
    unavailable:
      labels.unavailable ??
      translate(t, 'home.readiness.share.unavailable', DEFAULT_LABELS.unavailable),
    checkIns:
      labels.checkIns ?? translate(t, 'home.readiness.share.checkIns', DEFAULT_LABELS.checkIns),
    needsAction:
      labels.needsAction ??
      translate(t, 'home.readiness.share.needsAction', DEFAULT_LABELS.needsAction),
    noBlockers:
      labels.noBlockers ??
      translate(t, 'home.readiness.share.noBlockers', DEFAULT_LABELS.noBlockers),
    sentFrom:
      labels.sentFrom ?? translate(t, 'home.readiness.share.sentFrom', DEFAULT_LABELS.sentFrom),
  }
}

function getStatusLabel(status: EventReadinessStatus, t?: TranslationFn): string {
  switch (status) {
    case 'READY':
      return translate(t, 'home.readiness.status.READY', 'Ready')
    case 'WATCH':
      return translate(t, 'home.readiness.status.WATCH', 'Watch')
    case 'AT_RISK':
      return translate(t, 'home.readiness.status.AT_RISK', 'At risk')
    case 'NEEDS_SETUP':
      return translate(t, 'home.readiness.status.NEEDS_SETUP', 'Needs setup')
  }
}

function getSignalLabel(signal: EventReadinessSignal, t?: TranslationFn): string {
  switch (signal.key) {
    case 'no_squad':
      return translate(t, 'home.readiness.share.signal.no_squad', 'No active squad members yet')
    case 'low_confirmations':
      return translate(
        t,
        'home.readiness.share.signal.low_confirmations',
        `${signal.count ?? 0}/${signal.target ?? 0} confirmed`,
        signalParams(signal),
      )
    case 'low_response_rate':
      return translate(
        t,
        'home.readiness.share.signal.low_response_rate',
        `${signal.count ?? 0}/${signal.target ?? 0} players have replied`,
        signalParams(signal),
      )
    case 'pending_replies':
      return translate(
        t,
        'home.readiness.share.signal.pending_replies',
        `${signal.count ?? 0} replies still pending`,
        signalParams(signal),
      )
    case 'availability_risks':
      return translate(
        t,
        'home.readiness.share.signal.availability_risks',
        `${signal.count ?? 0} availability risks`,
        signalParams(signal),
      )
    case 'injury_risks':
      return translate(
        t,
        'home.readiness.share.signal.injury_risks',
        `${signal.count ?? 0} private availability risks`,
        signalParams(signal),
      )
    case 'check_in_gap':
      return translate(
        t,
        'home.readiness.share.signal.check_in_gap',
        `${signal.count ?? 0}/${signal.target ?? 0} checked in`,
        signalParams(signal),
      )
    case 'no_show_risk':
      return translate(
        t,
        'home.readiness.share.signal.no_show_risk',
        `${signal.count ?? 0} likely no-shows`,
        signalParams(signal),
      )
  }
}

function signalParams(signal: EventReadinessSignal): Record<string, number> {
  return {
    count: signal.count ?? 0,
    target: signal.target ?? 0,
  }
}

function translate(
  t: TranslationFn | undefined,
  key: string,
  defaultValue: string,
  options: Record<string, unknown> = {},
): string {
  return t ? t(key, { defaultValue, ...options }) : defaultValue
}

function formatTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
    template,
  )
}
