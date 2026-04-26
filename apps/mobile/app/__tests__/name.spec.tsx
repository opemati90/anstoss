import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockSetBasicProfile = jest.fn()
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
        'onboarding.name.title': "What's your first name?",
        'onboarding.name.placeholder': 'First name',
        'onboarding.name.cta': 'Continue',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/auth/useOnboardingAuth', () => ({
  useOnboardingAuth: () => ({ setBasicProfile: mockSetBasicProfile, isLoaded: true }),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: {}, update: mockUpdate, reset: jest.fn() }),
}))

import Name from '../(auth)/name'

describe('Name', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockSetBasicProfile.mockReset()
    mockUpdate.mockReset()
  })

  it('disables CTA on empty name', () => {
    render(<Name />)
    const cta = screen.getByText(/continue/i)
    fireEvent.press(cta)
    expect(mockSetBasicProfile).not.toHaveBeenCalled()
  })

  it('sets profile + flow state and routes to /dob', async () => {
    mockSetBasicProfile.mockResolvedValue(undefined)
    render(<Name />)
    fireEvent.changeText(screen.getByPlaceholderText(/first name/i), 'Mara')
    fireEvent.press(screen.getByText(/continue/i))
    await waitFor(() => expect(mockSetBasicProfile).toHaveBeenCalledWith({ firstName: 'Mara' }))
    expect(mockUpdate).toHaveBeenCalledWith({ firstName: 'Mara' })
    expect(mockPush).toHaveBeenCalledWith('/(auth)/dob')
  })
})
