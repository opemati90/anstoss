import { fireEvent, render, screen } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockUpdate = jest.fn()

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
        'onboarding.role.title': 'What brings you here?',
        'onboarding.role.play.title': 'I play',
        'onboarding.role.play.body': "Join my team's roster",
        'onboarding.role.coach.title': 'I coach',
        'onboarding.role.coach.body': 'Manage a team',
        'onboarding.role.starting.title': "I'm starting a club",
        'onboarding.role.starting.body': 'Set up everything from scratch',
        'onboarding.role.parent.title': 'My child plays',
        'onboarding.role.parent.body': 'Set up their profile',
        'onboarding.role.looking.title': 'Looking for a club',
        'onboarding.role.looking.body': 'Show clubs I match',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: {}, update: mockUpdate, reset: jest.fn(), markStep: jest.fn(), hydrating: false }),
}))

import Role from '../(auth)/role'

describe('Role', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockUpdate.mockReset()
  })

  const cases: Array<[string, string, string]> = [
    ['I play', 'PLAYER', '/(auth)/team-code'],
    ['I coach', 'COACH', '/(auth)/team-code'],
    ["I'm starting a club", 'CLUB_ADMIN', '/(auth)/club-create'],
    // PARENT self-registration was intentionally removed — parents join via a
    // guardian link, not a self-select card on the role screen.
    // Free agents now skip the in-flow profile editor — the dedicated
    // Profile tab post-onboarding is where they fill it out.
    ['Looking for a club', 'FREE_AGENT', '/(auth)/done'],
  ]

  test.each(cases)('tapping %s sets role and routes', (label, role, route) => {
    render(<Role />)
    fireEvent.press(screen.getByText(label))
    expect(mockUpdate).toHaveBeenCalledWith({ role })
    expect(mockPush).toHaveBeenCalledWith(route)
  })
})
