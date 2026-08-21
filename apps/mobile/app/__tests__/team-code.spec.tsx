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
    t: (key: string, options?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'onboarding.teamCode.title': 'Enter team code',
        'onboarding.teamCode.hint': 'Ask your coach for the 5-letter code.',
        'onboarding.teamCode.cta': 'Confirm',
        'onboarding.teamCode.invalid': 'No team found for this code.',
        'onboarding.rosterClaim.cta': 'Confirm',
      }
      return map[key] ?? options?.defaultValue ?? key
    },
  }),
}))

const mockState: { role?: string } = {}
jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({
    state: mockState,
    update: mockUpdate,
    markStep: jest.fn(),
    reset: jest.fn(),
  }),
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
    delete mockState.role
  })

  it('looks up team on 5-char entry and shows confirmation', async () => {
    mockApi.mockResolvedValue({
      team: { id: 't1', clubId: 'c1', name: 'U17 Männlich', displayName: null },
      club: { id: 'c1', name: 'FC Köpenick' },
    })
    render(<TeamCode />)
    fireEvent.changeText(screen.getByTestId('team-code-input'), 'AB23XC45ZK')
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/teams/by-code/AB23XC45ZK'))
    expect(screen.getByText(/U17 Männlich/)).toBeOnTheScreen()
    expect(screen.getByText(/FC Köpenick/)).toBeOnTheScreen()
  })

  it('does not fabricate a dev team when lookup fails', async () => {
    mockApi.mockRejectedValueOnce(new MockApiError('no team', 404))
    render(<TeamCode />)

    fireEvent.changeText(screen.getByTestId('team-code-input'), 'AB23XC45ZK')

    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/teams/by-code/AB23XC45ZK'))
    expect(await screen.findByText('No team found for this code.')).toBeOnTheScreen()
    expect(screen.queryByText(/Dev FC/i)).toBeNull()

    fireEvent.press(screen.getByText(/^Confirm$/))
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('clears a previous team before validating a changed code', async () => {
    mockApi
      .mockResolvedValueOnce({
        team: { id: 't1', clubId: 'c1', name: 'U17', displayName: null },
        club: { id: 'c1', name: 'FC K.' },
      })
      .mockRejectedValueOnce(new MockApiError('no team', 404))
    render(<TeamCode />)

    fireEvent.changeText(screen.getByTestId('team-code-input'), 'AB23XC45ZK')
    expect(await screen.findByText('FC K.')).toBeOnTheScreen()

    fireEvent.changeText(screen.getByTestId('team-code-input'), 'AB23YC45ZK')

    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/teams/by-code/AB23YC45ZK'))
    expect(await screen.findByText('No team found for this code.')).toBeOnTheScreen()
    expect(screen.queryByText('FC K.')).toBeNull()

    fireEvent.press(screen.getByText(/^Confirm$/))
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('player branch: confirm routes to /roster-claim to pick a roster slot', async () => {
    mockState.role = 'PLAYER'
    mockApi.mockResolvedValue({
      team: { id: 't1', clubId: 'c1', name: 'U17', displayName: null },
      club: { id: 'c1', name: 'FC K.' },
    })
    render(<TeamCode />)
    fireEvent.changeText(screen.getByTestId('team-code-input'), 'AB23XC45ZK')
    await waitFor(() => expect(screen.getByText(/U17/)).toBeOnTheScreen())
    fireEvent.press(screen.getByText(/^Confirm$/))
    expect(mockUpdate).toHaveBeenCalledWith({
      teamId: 't1',
      clubId: 'c1',
      clubName: 'FC K.',
      teamJoinCode: 'AB23XC45ZK',
    })
    expect(mockPush).toHaveBeenCalledWith('/(auth)/roster-claim')
  })

  it('coach branch: confirm bypasses roster-claim and routes to /done', async () => {
    mockState.role = 'COACH'
    mockApi.mockResolvedValue({
      team: { id: 't1', clubId: 'c1', name: 'U17', displayName: null },
      club: { id: 'c1', name: 'FC K.' },
    })
    render(<TeamCode />)
    fireEvent.changeText(screen.getByTestId('team-code-input'), 'AB23XC45ZK')
    await waitFor(() => expect(screen.getByText(/U17/)).toBeOnTheScreen())
    fireEvent.press(screen.getByText(/^Confirm$/))
    expect(mockPush).toHaveBeenCalledWith('/(auth)/done')
    expect(mockPush).not.toHaveBeenCalledWith('/(auth)/roster-claim')
  })
})
