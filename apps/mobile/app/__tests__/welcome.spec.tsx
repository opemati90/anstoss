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
        'onboarding.welcome.headline': 'ALL YOUR\nFOOTBALL.\nONE PLACE.',
        'onboarding.welcome.primary': 'Build your profile',
        'onboarding.welcome.secondary': 'Log in',
        'onboarding.welcome.languageLabel': 'English',
        'onboarding.welcome.languageA11y': 'Choose language',
      }
      return map[key] ?? key
    },
    i18n: { language: 'en', changeLanguage: mockChangeLanguage },
  }),
}))

import Welcome from '../(auth)/welcome'

describe('Welcome', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockChangeLanguage.mockReset()
  })

  it('routes primary CTA to /phone (signup)', () => {
    render(<Welcome />)
    fireEvent.press(screen.getByText(/build your profile/i))
    expect(mockPush).toHaveBeenCalledWith('/(auth)/phone')
  })

  it('routes secondary CTA into the new phone OTP flow with mode=signin', () => {
    render(<Welcome />)
    fireEvent.press(screen.getByText(/log in/i))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/phone',
      params: { mode: 'signin' },
    })
  })

  it('opens the language sheet and switches language', () => {
    render(<Welcome />)
    fireEvent.press(screen.getByLabelText('Choose language'))
    fireEvent.press(screen.getByLabelText('Set language fr'))
    expect(mockChangeLanguage).toHaveBeenCalledWith('fr')
  })
})
