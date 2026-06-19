import React from 'react'
import { render } from '@testing-library/react-native'
import type { EventReadiness } from '@anstoss/shared'
import { EventReadinessCard } from '../EventReadinessCard'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('react-i18next', () => {
  const t = (key: string, opts?: { defaultValue?: string } & Record<string, unknown>) => {
    if (opts && typeof opts.defaultValue === 'string') {
      return opts.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name) => {
        const value = (opts as Record<string, unknown>)[name]
        return value == null ? '' : String(value)
      })
    }
    return key
  }
  return { useTranslation: () => ({ t }) }
})

jest.mock('../../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../../theme/club-theme')
  return {
    useClubColors: () => ({
      ...FALLBACK_THEME,
      primary: '#1E3A5F',
      primary50: '#DDE7F1',
    }),
  }
})

const riskyReadiness: EventReadiness = {
  status: 'AT_RISK',
  score: 71,
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

describe('EventReadinessCard', () => {
  it('renders the operational score, metrics, and risk signals', () => {
    const { getByText } = render(
      <EventReadinessCard readiness={riskyReadiness} eventTitle="League match" />,
    )

    expect(getByText('EVENT READINESS')).toBeTruthy()
    expect(getByText('League match')).toBeTruthy()
    expect(getByText('71')).toBeTruthy()
    expect(getByText('At risk')).toBeTruthy()
    expect(getByText('Fix before kickoff')).toBeTruthy()
    expect(getByText('7/14')).toBeTruthy()
    expect(getByText('5')).toBeTruthy()
    expect(getByText('7/11 confirmed.')).toBeTruthy()
    expect(getByText('5 replies still pending.')).toBeTruthy()
    expect(getByText('1 injury or suspension risks.')).toBeTruthy()
  })

  it('renders a compact version for dense admin surfaces', () => {
    const { getByText, queryByText } = render(
      <EventReadinessCard readiness={riskyReadiness} eventTitle="League match" compact />,
    )

    expect(getByText('READINESS')).toBeTruthy()
    expect(getByText('League match')).toBeTruthy()
    expect(queryByText('1 injury or suspension risks.')).toBeNull()
  })
})
