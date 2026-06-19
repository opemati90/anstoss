import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
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
  return { useTranslation: () => ({ t, i18n: { language: 'en-GB' } }) }
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
  nudge: {
    recommended: true,
    reason: 'low_confirmations',
    targetCount: 5,
    urgency: 'high',
  },
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
    expect(getByText('Need 4 more confirmations to reach the match target.')).toBeTruthy()
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

  it('exposes a share briefing action without requiring card navigation', () => {
    const onShare = jest.fn()
    const onPress = jest.fn()
    const { getByText } = render(
      <EventReadinessCard
        readiness={riskyReadiness}
        eventTitle="League match"
        onPress={onPress}
        onShare={onShare}
      />,
    )

    fireEvent.press(getByText('Share briefing'))

    expect(onShare).toHaveBeenCalledTimes(1)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('renders and invokes the smart nudge action when recommended', () => {
    const onNudge = jest.fn()
    const { getByText, queryByText } = render(
      <EventReadinessCard
        readiness={riskyReadiness}
        eventTitle="League match"
        onNudge={onNudge}
      />,
    )

    expect(getByText('Smart nudge recommended')).toBeTruthy()
    expect(getByText('5 players still need to reply.')).toBeTruthy()
    expect(queryByText('Share briefing')).toBeNull()

    fireEvent.press(getByText('Nudge now'))

    expect(onNudge).toHaveBeenCalledTimes(1)
  })

  it('shows cooldown state instead of an unavailable nudge action', () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(10, 30, 0, 0)
    const cooldownReadiness: EventReadiness = {
      ...riskyReadiness,
      nudge: {
        recommended: false,
        reason: 'cooldown',
        targetCount: 5,
        urgency: 'low',
        nextAvailableAt: tomorrow.toISOString(),
      },
    }
    const onNudge = jest.fn()
    const { getByText, queryByText } = render(
      <EventReadinessCard
        readiness={cooldownReadiness}
        eventTitle="League match"
        onNudge={onNudge}
      />,
    )

    expect(getByText('Nudge already sent')).toBeTruthy()
    expect(getByText(/Try again after tomorrow at/)).toBeTruthy()
    expect(queryByText('Nudge now')).toBeNull()
  })

  it('keeps passive cooldown cards pressable when an open action exists', () => {
    const onPress = jest.fn()
    const cooldownReadiness: EventReadiness = {
      ...riskyReadiness,
      nudge: {
        recommended: false,
        reason: 'cooldown',
        targetCount: 5,
        urgency: 'low',
        nextAvailableAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    }
    const { getByLabelText, queryByText } = render(
      <EventReadinessCard
        readiness={cooldownReadiness}
        eventTitle="League match"
        onPress={onPress}
        onNudge={jest.fn()}
      />,
    )

    expect(queryByText('Open')).toBeNull()
    fireEvent.press(getByLabelText('Open event readiness'))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('uses a generic cooldown hint when retry time is stale', () => {
    const cooldownReadiness: EventReadiness = {
      ...riskyReadiness,
      nudge: {
        recommended: false,
        reason: 'cooldown',
        targetCount: 5,
        urgency: 'low',
        nextAvailableAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    }
    const { getByText, queryByText } = render(
      <EventReadinessCard
        readiness={cooldownReadiness}
        eventTitle="League match"
        onNudge={jest.fn()}
      />,
    )

    expect(getByText('Reminders sent')).toBeTruthy()
    expect(queryByText(/Try again after/)).toBeNull()
  })
})
