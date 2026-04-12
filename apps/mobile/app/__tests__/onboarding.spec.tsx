import React from 'react'
import renderer, { act } from 'react-test-renderer'
import OnboardingScreen from '../onboarding'

const mockCompleteOnboarding = jest.fn(() => Promise.resolve())
const mockPush = jest.fn()
const mockReplace = jest.fn()

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('expo-router', () => ({
  router: {
    push: (...args: any[]) => mockPush(...args),
    replace: (...args: any[]) => mockReplace(...args),
  },
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: { clubName?: string; role?: string; current?: number; total?: number; defaultValue?: string },
    ) => {
      const map: Record<string, string> = {
        'common.next': 'Next',
        'common.back': 'Back',
        'roles.PARENT': 'Parent',
        'onboarding.welcomeTitle': `Welcome to ${options?.clubName ?? 'your club'}!`,
        'onboarding.welcomeBody': `You are set up as ${options?.role ?? 'member'}.`,
        'onboarding.profileTitle': 'Complete your profile',
        'onboarding.profileBody': 'Add your name.',
        'onboarding.editProfileAction': 'Edit profile',
        'onboarding.parentChildTitle': 'Link your child',
        'onboarding.parentChildBody': 'Connect to your child profile.',
        'onboarding.parentScheduleTitle': 'Check the schedule',
        'onboarding.parentScheduleBody': 'View training and matches.',
        'onboarding.skipAll': 'Skip',
        'onboarding.finish': 'Get started',
      }

      if (key === 'onboarding.stepCounter') {
        return options?.defaultValue ?? `${options?.current} / ${options?.total}`
      }

      return map[key] ?? key
    },
  }),
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, style }: { children?: React.ReactNode; style?: any }) => {
    const React = require('react')
    const { View } = require('react-native')

    return React.createElement(View, { style }, children)
  },
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      name: 'Parent User',
      email: 'parent@example.com',
    },
    activeClub: {
      role: 'PARENT',
      club: {
        id: 'club-1',
        name: 'FC QA',
        badgeUrl: null,
      },
    },
    activeTeamAccess: null,
    teamsForActiveClub: [],
    completeOnboarding: mockCompleteOnboarding,
  }),
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    background: '#FAFAF8',
    surface: '#FFFFFF',
    textPrimary: '#1A1A18',
    textSecondary: '#6B6B69',
    textTertiary: '#9E9E9C',
    textInverse: '#FFFFFF',
    border: '#E5E5E3',
    borderStrong: '#D1D1CC',
    clubPrimary: '#1E3A5F',
    clubPrimaryLight: '#DDE7F1',
    success: '#2D7A3A',
    warning: '#B8860B',
    error: '#C4372C',
    info: '#2563A0',
  }),
  useIsDark: () => false,
}))

jest.mock('../../src/illustrations', () => ({
  illustrations: {
    onboardingHero: 1,
  },
}))

jest.mock('../../src/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}))

jest.mock('../../src/utils/haptics', () => ({
  Haptics: {
    tap: jest.fn(),
    tapMedium: jest.fn(),
    select: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    fail: jest.fn(),
  },
}))

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows the Anstoss hero illustration on the welcome step', () => {
    let tree: ReturnType<typeof renderer.create>

    act(() => {
      tree = renderer.create(<OnboardingScreen />)
    })

    expect(
      tree!.root.findByProps({ testID: 'onboarding-hero-illustration' }),
    ).toBeTruthy()
  })
})
