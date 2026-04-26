import { fireEvent, render, screen } from '@testing-library/react-native'

const mockPush = jest.fn()

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
        'onboarding.welcome.tagline': 'One app for your football club.',
        'onboarding.welcome.primary': 'Get started',
        'onboarding.welcome.secondary': 'I already have an account',
      }
      return map[key] ?? key
    },
  }),
}))

import Welcome from '../(auth)/welcome'

describe('Welcome', () => {
  beforeEach(() => mockPush.mockReset())

  it('renders both CTAs and routes primary to /phone', () => {
    render(<Welcome />)
    fireEvent.press(screen.getByText(/get started/i))
    expect(mockPush).toHaveBeenCalledWith('/(auth)/phone')
  })

  it('routes secondary to legacy sign-in', () => {
    render(<Welcome />)
    fireEvent.press(screen.getByText(/already have an account/i))
    expect(mockPush).toHaveBeenCalledWith('/(auth)/sign-in')
  })
})
