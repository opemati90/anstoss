import { fireEvent, render, screen } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockUpdate = jest.fn()
const mockMarkStep = jest.fn()

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
    t: (key: string, opts?: Record<string, unknown> & { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'onboarding.rosterBuild.title': 'Add your roster',
        'onboarding.rosterBuild.hint': 'Quick names + positions are fine. You can edit later.',
        'onboarding.rosterBuild.addRow': 'Add player',
        'onboarding.rosterBuild.cta': 'Continue',
      }
      return map[key] ?? opts?.defaultValue ?? key
    },
  }),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({
    state: { clubName: 'FC Köpenick', teamName: 'U17' },
    update: mockUpdate,
    markStep: mockMarkStep,
    reset: jest.fn(),
  }),
}))

import RosterBuild from '../(auth)/roster-build'

describe('RosterBuild', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockUpdate.mockReset()
    mockMarkStep.mockReset()
  })

  it('saves filled names to onboarding state and routes to /done', () => {
    render(<RosterBuild />)
    fireEvent.changeText(screen.getByTestId('roster-name-0'), 'Mara K.')
    fireEvent.press(screen.getByText(/add player/i))
    fireEvent.changeText(screen.getByTestId('roster-name-1'), 'Jonas R.')
    fireEvent.press(screen.getByText(/continue/i))
    expect(mockUpdate).toHaveBeenCalledWith({ rosterNames: ['Mara K.', 'Jonas R.'] })
    expect(mockPush).toHaveBeenCalledWith('/(auth)/done')
  })

  it('shows skip CTA when no names filled and routes to /done', () => {
    render(<RosterBuild />)
    fireEvent.press(screen.getByText(/Skip/))
    expect(mockUpdate).toHaveBeenCalledWith({ rosterNames: [] })
    expect(mockPush).toHaveBeenCalledWith('/(auth)/done')
  })
})
