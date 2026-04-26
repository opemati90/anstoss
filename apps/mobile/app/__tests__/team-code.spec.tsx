import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockApi = jest.fn()
const mockUpdate = jest.fn()

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
        'onboarding.teamCode.title': 'Enter team code',
        'onboarding.teamCode.hint': 'Ask your coach for the 5-letter code.',
        'onboarding.teamCode.cta': 'Confirm',
        'onboarding.teamCode.invalid': 'No team found for this code.',
        'onboarding.rosterClaim.cta': 'Confirm',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: {}, update: mockUpdate, reset: jest.fn() }),
}))

jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: MockApiError,
}))

import TeamCode from '../(auth)/team-code'

describe('TeamCode', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockApi.mockReset()
    mockUpdate.mockReset()
  })

  it('looks up team on 5-char entry and shows confirmation', async () => {
    mockApi.mockResolvedValue({
      id: 't1',
      clubId: 'c1',
      name: 'U17 Männlich',
      club: { id: 'c1', name: 'FC Köpenick' },
    })
    render(<TeamCode />)
    fireEvent.changeText(screen.getByTestId('team-code-input'), 'AB23X')
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/teams/by-code/AB23X'))
    expect(screen.getByText(/U17 Männlich/)).toBeOnTheScreen()
    expect(screen.getByText(/FC Köpenick/)).toBeOnTheScreen()
  })

  it('confirm stores ids and routes to /roster-claim', async () => {
    mockApi.mockResolvedValue({
      id: 't1',
      clubId: 'c1',
      name: 'U17',
      club: { id: 'c1', name: 'FC K.' },
    })
    render(<TeamCode />)
    fireEvent.changeText(screen.getByTestId('team-code-input'), 'AB23X')
    await waitFor(() => expect(screen.getByText(/U17/)).toBeOnTheScreen())
    await waitFor(() => {
      const btn = screen.getByRole('button')
      expect(btn.props.accessibilityState?.disabled).toBe(false)
    })
    fireEvent.press(screen.getByRole('button'))
    expect(mockUpdate).toHaveBeenCalledWith({ teamId: 't1', clubId: 'c1' })
    expect(mockPush).toHaveBeenCalledWith('/(auth)/roster-claim')
  })
})
