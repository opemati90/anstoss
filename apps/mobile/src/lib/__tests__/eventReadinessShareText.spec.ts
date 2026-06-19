import type { EventReadiness } from '@anstoss/shared'
import { buildEventReadinessShareText } from '../eventReadinessShareText'

const readiness: EventReadiness = {
  status: 'AT_RISK',
  score: 68,
  briefing: {
    key: 'low_confirmations',
    params: { count: 4, target: 11, confirmed: 7 },
    fallback: 'Need 4 more confirmations to reach the match target.',
  },
  metrics: {
    squadSize: 14,
    responseCount: 9,
    yesCount: 7,
    maybeCount: 1,
    noCount: 1,
    pendingCount: 5,
    responseRate: 0.64,
    confirmedRate: 0.5,
    checkInCount: 0,
    injuryRiskCount: 1,
    suspensionRiskCount: 0,
  },
  signals: [
    { key: 'low_confirmations', severity: 'critical', count: 7, target: 11 },
    { key: 'pending_replies', severity: 'warning', count: 5, target: 14 },
    { key: 'injury_risks', severity: 'warning', count: 1 },
  ],
}

describe('buildEventReadinessShareText', () => {
  it('formats a privacy-safe aggregate briefing for native share targets', () => {
    const text = buildEventReadinessShareText({
      eventTitle: 'League match',
      whenLabel: 'Sat, 21 Jun, 10:30',
      readiness,
    })

    expect(text).toContain('Anstoss readiness: League match')
    expect(text).toContain('Sat, 21 Jun, 10:30')
    expect(text).toContain('Status: At risk (68/100)')
    expect(text).toContain('Briefing: Need 4 more confirmations to reach the match target.')
    expect(text).toContain('Confirmed: 7/14')
    expect(text).toContain('Maybe: 1')
    expect(text).toContain('Unavailable: 1')
    expect(text).toContain('Pending: 5')
    expect(text).toContain('- 7/11 confirmed')
    expect(text).toContain('- 5 replies still pending')
    expect(text).toContain('- 1 private availability risks')
    expect(text).not.toContain('INJURED')
    expect(text).not.toContain('injury or suspension')
    expect(text).not.toContain('Anna')
  })

  it('uses a no-blockers line when readiness has no signals', () => {
    const text = buildEventReadinessShareText({
      eventTitle: 'Training',
      readiness: { ...readiness, status: 'READY', score: 96, signals: [] },
    })

    expect(text).toContain('- No blockers detected')
  })

  it('uses provided translations for share heading, briefing, status, and signals', () => {
    const t = (key: string, opts?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'home.readiness.share.heading': 'Readiness teilen: {{title}}',
        'home.readiness.share.status': 'Lage',
        'home.readiness.share.briefing': 'Kurzbriefing',
        'home.readiness.share.confirmed': 'Zusagen',
        'home.readiness.share.maybe': 'Vielleicht',
        'home.readiness.share.unavailable': 'Absagen',
        'home.readiness.share.pending': 'Offen',
        'home.readiness.share.checkIns': 'Check-ins',
        'home.readiness.share.needsAction': 'Handlungsbedarf',
        'home.readiness.share.sentFrom': 'Gesendet aus Anstoss',
        'home.readiness.status.AT_RISK': 'Gefährdet',
        'home.readiness.briefing.low_confirmations': 'Noch {{count}} Zusagen bis zum Ziel.',
        'home.readiness.share.signal.low_confirmations': '{{count}}/{{target}} zugesagt',
        'home.readiness.share.signal.pending_replies': '{{count}} Antworten offen',
        'home.readiness.share.signal.injury_risks': '{{count}} private Verfügbarkeitsrisiken',
      }
      return Object.entries(opts ?? {}).reduce(
        (text, [param, value]) => text.replaceAll(`{{${param}}}`, String(value)),
        translations[key] ?? String(opts?.defaultValue ?? key),
      )
    }

    const text = buildEventReadinessShareText({
      eventTitle: 'Ligaspiel',
      readiness,
      t,
    })

    expect(text).toContain('Readiness teilen: Ligaspiel')
    expect(text).toContain('Lage: Gefährdet (68/100)')
    expect(text).toContain('Kurzbriefing: Noch 4 Zusagen bis zum Ziel.')
    expect(text).toContain('Zusagen: 7/14')
    expect(text).toContain('- 7/11 zugesagt')
    expect(text).toContain('- 1 private Verfügbarkeitsrisiken')
  })
})
