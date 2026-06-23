import { fireEvent, render, screen } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockChangeLanguage = jest.fn()
const mockSetAppLanguage = jest.fn()

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

// OnboardingFlowProvider derives the draft owner id from AuthContext now
// (custom email-OTP replaced Clerk). A signed-out user → null owner.
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}))

// welcome.tsx persists the choice via setAppLanguage (AsyncStorage + server
// sync), not a transient i18n.changeLanguage. Mock the module so the test
// asserts the real call.
jest.mock('../../src/i18n', () => ({
  APP_LANGUAGES: ['de', 'en', 'fr', 'pt', 'it'],
  setAppLanguage: (...args: unknown[]) => mockSetAppLanguage(...args),
  getAppLanguage: () => 'en',
  getAppLocale: () => 'en-US',
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
        'onboarding.welcome.headline': 'ALL YOUR\nFOOTBALL.\nONE PLACE.',
        'onboarding.welcome.primary': 'Build your profile',
        'onboarding.welcome.secondary': 'Log in',
        'onboarding.welcome.languageLabel': 'English',
        'onboarding.welcome.languageA11y': 'Choose language',
        'onboarding.welcome.policyA11y': 'Accept Privacy and Terms',
      }
      return map[key] ?? opts?.defaultValue ?? key
    },
    i18n: { language: 'en', changeLanguage: mockChangeLanguage },
  }),
}))

import Welcome from '../(auth)/welcome'
import { OnboardingFlowProvider } from '../../src/context/OnboardingFlowContext'

const renderWelcome = () =>
  render(
    <OnboardingFlowProvider>
      <Welcome />
    </OnboardingFlowProvider>,
  )

describe('Welcome', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockChangeLanguage.mockReset()
    mockSetAppLanguage.mockReset()
  })

  it('routes primary CTA straight to the unified sign-in (no checkbox gate)', () => {
    renderWelcome()
    // The policy checkbox was removed — consent now lives on the sign-in screen,
    // so the CTA is always enabled and goes straight to the one auth entry.
    expect(screen.queryByLabelText('Accept Privacy and Terms')).toBeNull()
    fireEvent.press(screen.getByText(/build your profile/i))
    expect(mockPush).toHaveBeenCalledWith('/(auth)/sign-in')
  })

  it('routes secondary CTA to the dedicated sign-in screen', () => {
    renderWelcome()
    fireEvent.press(screen.getByText(/log in/i))
    expect(mockPush).toHaveBeenCalledWith('/(auth)/sign-in')
  })

  it('opens the language sheet and switches language', () => {
    renderWelcome()
    fireEvent.press(screen.getByLabelText('Choose language'))
    fireEvent.press(screen.getByLabelText('Set language fr'))
    expect(mockSetAppLanguage).toHaveBeenCalledWith('fr')
  })
})
