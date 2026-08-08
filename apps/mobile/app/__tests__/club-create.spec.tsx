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
        'onboarding.clubCreate.title': 'Create your club',
        'onboarding.clubCreate.namePlaceholder': 'FC Köpenick 1908',
        'onboarding.clubCreate.teamLabel': 'Team name',
        'onboarding.clubCreate.teamPlaceholder': 'U17 Männlich',
        'common.next': 'Next',
      }
      return map[key] ?? opts?.defaultValue ?? key
    },
  }),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({
    state: { firstName: 'Owner' },
    update: mockUpdate,
    markStep: mockMarkStep,
    reset: jest.fn(),
  }),
}))

import ClubCreate from '../(auth)/club-create'

describe('ClubCreate', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockUpdate.mockReset()
    mockMarkStep.mockReset()
  })

  it('captures the club and team names and routes to /club-identity (no API call)', () => {
    render(<ClubCreate />)
    fireEvent.changeText(screen.getByPlaceholderText(/Köpenick/), 'FC Köpenick 1908')
    fireEvent.changeText(screen.getByPlaceholderText(/U17/), 'U17 Männlich')
    expect(screen.getByText('Team name')).toBeOnTheScreen()
    fireEvent.press(screen.getByText(/Next/))
    expect(mockUpdate).toHaveBeenCalledWith({
      clubName: 'FC Köpenick 1908',
      teamName: 'U17 Männlich',
    })
    expect(mockPush).toHaveBeenCalledWith('/(auth)/club-identity')
  })
})
