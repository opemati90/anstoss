import type { EventReadiness } from '@anstoss/shared'
import { buildEventReadinessShareText } from '../eventReadinessShareText'

const readiness: EventReadiness = {
  status: 'AT_RISK',
  score: 68,
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
    expect(text).toContain('Confirmed: 7/14')
    expect(text).toContain('Maybe: 1')
    expect(text).toContain('Unavailable: 1')
    expect(text).toContain('Pending: 5')
    expect(text).toContain('- 7/11 confirmed')
    expect(text).toContain('- 5 replies still pending')
    expect(text).toContain('- 1 injury or suspension risks')
    expect(text).not.toContain('INJURED')
    expect(text).not.toContain('Anna')
  })

  it('uses a no-blockers line when readiness has no signals', () => {
    const text = buildEventReadinessShareText({
      eventTitle: 'Training',
      readiness: { ...readiness, status: 'READY', score: 96, signals: [] },
    })

    expect(text).toContain('- No blockers detected')
  })
})
