import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockApi = jest.fn()

class MockApiError extends Error {
  status: number
  constructor(m: string, status: number) {
    super(m)
    this.status = status
  }
}

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}))

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'onboarding.rosterClaim.titlePlayer': 'Pick your name',
        'onboarding.rosterClaim.titleCoach': 'Pick the coach slot',
        'onboarding.rosterClaim.titleParent': 'Pick your child',
        'onboarding.rosterClaim.alreadyClaimed': 'Already claimed.',
        'onboarding.rosterClaim.parentNote': 'Parent flow available next release.',
        'onboarding.rosterClaim.parentSkip': 'Continue',
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
  ApiError: MockApiError,
}))

import RosterClaim from '../(auth)/roster-claim'

describe('RosterClaim (player)', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockApi.mockReset()
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
})
