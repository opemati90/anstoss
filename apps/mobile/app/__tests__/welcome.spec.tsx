import { fireEvent, render, screen } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockChangeLanguage = jest.fn()

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
    i18n: { language: 'de', changeLanguage: mockChangeLanguage },
  }),
}))

import Welcome from '../(auth)/welcome'

describe('Welcome', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockChangeLanguage.mockReset()
  })

  it('renders both CTAs and routes primary to /phone', () => {
    render(<Welcome />)
    fireEvent.press(screen.getByText(/get started/i))
    expect(mockPush).toHaveBeenCalledWith('/(auth)/phone')
  })

  it('routes secondary into the new phone OTP flow in signin mode', () => {
    render(<Welcome />)
    fireEvent.press(screen.getByText(/already have an account/i))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/phone',
      params: { mode: 'signin' },
    })
  })

  it('switches language when EN pill is tapped', () => {
    render(<Welcome />)
    fireEvent.press(screen.getByLabelText('Set language EN'))
    expect(mockChangeLanguage).toHaveBeenCalledWith('en')
  })
})
