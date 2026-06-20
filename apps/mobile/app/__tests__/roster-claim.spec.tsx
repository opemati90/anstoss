import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockApi = jest.fn()

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    border: '#dddddd',
    borderDefault: '#dddddd',
    error: '#c62828',
    primary: '#2255cc',
    surface: '#ffffff',
    surfaceSunken: '#f6f7f9',
    textPrimary: '#111111',
    textSecondary: '#555555',
  }),
}))

jest.mock('../../src/components/ui', () => {
  const React = require('react')
  const { Text } = require('react-native')

  return {
    Text: (props: { children?: React.ReactNode }) => React.createElement(Text, props, props.children),
  }
})

jest.mock('../../src/components/wizard/WizardStep', () => {
  const React = require('react')
  const { Pressable, Text, View } = require('react-native')

  return {
    WizardStep: (props: {
      title: string
      ctaLabel?: string
      onCta?: () => void
      children: React.ReactNode
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, props.title),
        props.children,
        props.ctaLabel
          ? React.createElement(
              Pressable,
              { accessibilityRole: 'button', onPress: props.onCta },
              React.createElement(Text, null, props.ctaLabel),
            )
          : null,
      ),
  }
})

jest.mock('../../src/components/EmptyState', () => {
  const React = require('react')
  const { Text, View } = require('react-native')

  return {
    EmptyState: (props: { title: string; description: string }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, props.title),
        React.createElement(Text, null, props.description),
      ),
  }
})

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'onboarding.rosterClaim.titlePlayer': 'Pick your name',
        'onboarding.rosterClaim.titleCoach': 'Pick the coach slot',
        'onboarding.rosterClaim.titleParent': 'Pick your child',
        'onboarding.rosterClaim.alreadyClaimed': 'Already claimed.',
        'onboarding.rosterClaim.authError': 'Session error. Please go back and try again.',
        'onboarding.rosterClaim.emptyTitle': 'Your coach has not added you yet',
        'onboarding.rosterClaim.parentNote': 'Parent flow available next release.',
        'onboarding.rosterClaim.parentSkip': 'Continue',
        'common.retry': 'Try again',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({
    state: { clubId: 'c1', teamId: 't1', role: 'PLAYER' },
    update: jest.fn(),
    reset: jest.fn(),
  }),
}))

jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
}))

import RosterClaim from '../(auth)/roster-claim'

describe('RosterClaim (player)', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockApi.mockReset()
  })

  it('does not show the empty-roster continue path before the initial fetch settles', () => {
    mockApi.mockReturnValueOnce(new Promise(() => {}))

    render(<RosterClaim />)

    expect(screen.queryByText('Your coach has not added you yet')).toBeNull()
    expect(screen.queryByText('onboarding.rosterClaim.skipCta')).toBeNull()
  })

  it('lists slots and claims on tap → routes to /done', async () => {
    mockApi
      .mockResolvedValueOnce([
        { id: 's1', fullName: 'Mara K.', position: 'MID', claimedByUserId: null },
        { id: 's2', fullName: 'Jonas R.', position: 'GK', claimedByUserId: 'someone' },
      ])
      .mockResolvedValueOnce({ id: 's1', claimedByUserId: 'me' })
    render(<RosterClaim />)
    await waitFor(() => expect(screen.getByText('Mara K.')).toBeOnTheScreen())
    expect(screen.getByText(/claimed/i)).toBeOnTheScreen()
    fireEvent.press(screen.getByText('Mara K.'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenLastCalledWith(
        '/clubs/c1/teams/t1/roster-slots/s1/claim',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    expect(mockPush).toHaveBeenCalledWith('/(auth)/done')
  })

  it('shows a session error instead of the empty roster fallback on 401', async () => {
    mockApi.mockRejectedValueOnce({ status: 401 })

    render(<RosterClaim />)

    await waitFor(() =>
      expect(screen.getByText('Session error. Please go back and try again.')).toBeOnTheScreen(),
    )
    expect(screen.queryByText('Your coach has not added you yet')).toBeNull()
  })

  it('keeps the session error visible while retry is in flight', async () => {
    let resolveRetry: ((value: unknown) => void) | undefined
    mockApi
      .mockRejectedValueOnce({ status: 401 })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRetry = resolve
        }),
      )

    render(<RosterClaim />)

    await waitFor(() =>
      expect(screen.getByText('Session error. Please go back and try again.')).toBeOnTheScreen(),
    )
    fireEvent.press(screen.getByText('Try again'))

    expect(screen.getByText('Session error. Please go back and try again.')).toBeOnTheScreen()
    expect(screen.queryByText('Your coach has not added you yet')).toBeNull()

    resolveRetry?.([
      { id: 's1', fullName: 'Mara K.', position: 'MID', claimedByUserId: null },
    ])
    await waitFor(() => expect(screen.getByText('Mara K.')).toBeOnTheScreen())
  })

  it('keeps already-claimed conflict visible after refreshing slots', async () => {
    mockApi
      .mockResolvedValueOnce([
        { id: 's1', fullName: 'Mara K.', position: 'MID', claimedByUserId: null },
      ])
      .mockRejectedValueOnce({ status: 409 })
      .mockResolvedValueOnce([
        { id: 's1', fullName: 'Mara K.', position: 'MID', claimedByUserId: 'someone' },
      ])

    render(<RosterClaim />)

    await waitFor(() => expect(screen.getByText('Mara K.')).toBeOnTheScreen())
    fireEvent.press(screen.getByText('Mara K.'))

    await waitFor(() => expect(screen.getByText('Already claimed.')).toBeOnTheScreen())
    expect(screen.getAllByText(/claimed/i).length).toBeGreaterThanOrEqual(2)
  })
})
