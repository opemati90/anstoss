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

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'onboarding.rosterBuild.title': 'Add your roster',
        'onboarding.rosterBuild.hint': 'Quick names + positions are fine. You can edit later.',
        'onboarding.rosterBuild.addRow': 'Add player',
        'onboarding.rosterBuild.cta': 'Continue',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({
    state: { clubId: 'c1', teamId: 't1' },
    update: jest.fn(),
    reset: jest.fn(),
  }),
}))

jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error {},
}))

import RosterBuild from '../(auth)/roster-build'

describe('RosterBuild', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockApi.mockReset()
  })

  it('submits collected names and routes', async () => {
    mockApi.mockResolvedValue([{ id: 'slot_1' }])
    render(<RosterBuild />)
    fireEvent.changeText(screen.getByTestId('roster-name-0'), 'Mara K.')
    fireEvent.press(screen.getByText(/add player/i))
    fireEvent.changeText(screen.getByTestId('roster-name-1'), 'Jonas R.')
    fireEvent.press(screen.getByText(/continue/i))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        '/clubs/c1/teams/t1/roster-slots',
        expect.objectContaining({
          method: 'POST',
          body: { slots: [{ fullName: 'Mara K.' }, { fullName: 'Jonas R.' }] },
        }),
      ),
    )
    expect(mockPush).toHaveBeenCalledWith('/(auth)/team-code-share')
  })
})
