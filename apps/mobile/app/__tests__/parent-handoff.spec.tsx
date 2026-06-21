import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockApi = jest.fn()
const mockFinalizeSession = jest.fn()
const mockRefreshUser = jest.fn()
const mockReset = jest.fn()
const mockMarkStep = jest.fn()
const mockReplace = jest.fn()

const mockT = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'common.back': 'Back',
    'common.error': 'Error',
    'onboarding.code.clear': 'Clear',
    'onboarding.parentHandoff.title': 'Set up your child',
    'onboarding.parentHandoff.hint':
      'Enter the parent setup code, then the team code from the coach.',
    'onboarding.parentHandoff.cta': 'Finish setup',
    'onboarding.parentHandoff.setupCodeLabel': 'Parent setup code',
    'onboarding.parentHandoff.teamCodeLabel': 'Team code',
    'onboarding.parentHandoff.teamInvalid':
      'That team code does not match an active team.',
    'onboarding.teamCode.title': 'Enter team code',
  }
  return map[key] ?? opts?.defaultValue ?? key
}

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn() }),
}))

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('test-token') }),
}))

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: mockT,
  }),
}))

jest.mock('../../src/auth/useOnboardingAuth', () => ({
  useOnboardingAuth: () => ({ finalizeSession: mockFinalizeSession }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ refreshUser: mockRefreshUser }),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({
    state: { firstName: 'Nina' },
    reset: mockReset,
    markStep: mockMarkStep,
  }),
}))

jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {
    status: number
    constructor(message: string, status = 500) {
      super(message)
      this.status = status
    }
  },
  setTokenGetter: jest.fn(),
}))

import ParentHandoff from '../(auth)/parent-handoff'

describe('ParentHandoff', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApi.mockImplementation((path: string) => {
      if (path === '/parent-handoff/AB23CD45') {
        return Promise.resolve({
          childFirstName: 'Mila',
          childDateOfBirth: '2015-03-02',
        })
      }
      if (path === '/parent-handoff/AB23CD45/team/AB23X') {
        return Promise.resolve({
          team: { id: 'team-1', clubId: 'club-1', name: 'U11', displayName: null },
          club: {
            id: 'club-1',
            name: 'FC Anstoss',
            badgeUrl: null,
            primaryColor: '#111111',
          },
          rosterSlots: [],
        })
      }
      if (path === '/parent-handoff/AB23CD45/team/CD45X') {
        return Promise.resolve({
          team: { id: 'team-1', clubId: 'club-1', name: 'U11', displayName: null },
          club: {
            id: 'club-1',
            name: 'FC Anstoss',
            badgeUrl: null,
            primaryColor: '#111111',
          },
          rosterSlots: [
            {
              id: 'slot-1',
              fullName: 'Mila Becker',
              position: null,
              jerseyNumber: null,
            },
          ],
        })
      }
      return Promise.resolve({})
    })
  })

  it('shows friendly open-spot copy when the team has no open spots', async () => {
    render(<ParentHandoff />)

    fireEvent.changeText(screen.getByPlaceholderText('AB23CD45'), 'AB23CD45')

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/parent-handoff/AB23CD45'),
    )
    expect(await screen.findByText('Mila')).toBeTruthy()

    fireEvent.changeText(screen.getByTestId('team-code-input'), 'AB23X')

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/parent-handoff/AB23CD45/team/AB23X'),
    )
    expect(
      await screen.findByText(
        'This team has no open spots yet. Ask the coach to add your child first.',
      ),
    ).toBeOnTheScreen()
    expect(screen.queryByText(/open roster slots/i)).toBeNull()
  })

  it('uses open-spot fallback copy for blank child roster spots', async () => {
    render(<ParentHandoff />)

    fireEvent.changeText(screen.getByPlaceholderText('AB23CD45'), 'AB23CD45')
    expect(await screen.findByText('Mila')).toBeTruthy()

    fireEvent.changeText(screen.getByTestId('team-code-input'), 'CD45X')

    expect(await screen.findByText('Mila Becker')).toBeTruthy()
    expect(await screen.findByText('Open spot')).toBeOnTheScreen()
    expect(screen.queryByText(/roster slot/i)).toBeNull()
  })

  it('marks the parent handoff route as resumable', () => {
    render(<ParentHandoff />)

    expect(mockMarkStep).toHaveBeenCalledWith('/(auth)/parent-handoff')
  })
})
