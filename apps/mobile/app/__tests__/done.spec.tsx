import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockReplace = jest.fn()
const mockFinalize = jest.fn()
const mockReset = jest.fn()

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn() }),
}))

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'onboarding.done.title': 'You\u2019re in.',
        'onboarding.done.body': 'Welcome.',
        'onboarding.done.cta': 'Open Anstoss',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/auth/useOnboardingAuth', () => ({
  useOnboardingAuth: () => ({ finalizeSession: mockFinalize, isLoaded: true }),
}))

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('test-token') }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ refreshUser: jest.fn().mockResolvedValue(undefined) }),
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn().mockResolvedValue({}),
  setTokenGetter: jest.fn(),
}))

jest.mock('../../src/api/uploadMedia', () => ({
  uploadMedia: jest.fn().mockResolvedValue(null),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({
    state: { firstName: 'Mara' },
    reset: mockReset,
    update: jest.fn(),
  }),
}))

import Done from '../(auth)/done'

describe('Done', () => {
  beforeEach(() => {
    mockReplace.mockReset()
    mockFinalize.mockReset()
    mockReset.mockReset()
  })

  it('on CTA: finalizes session, resets context, routes to home', async () => {
    mockFinalize.mockResolvedValue(undefined)
    render(<Done />)
    fireEvent.press(screen.getByText(/open anstoss/i))
    await waitFor(() => expect(mockFinalize).toHaveBeenCalled())
    expect(mockReset).toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/')
  })
})
