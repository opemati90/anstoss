import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockApi = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), canGoBack: () => false }),
  router: { push: mockPush, back: jest.fn() },
  useFocusEffect: jest.fn(),
}))

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker')

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}))

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('../../src/i18n', () => ({
  __esModule: true,
  default: { language: 'de', resolvedLanguage: 'de' },
}))

jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {
    status = 500
  },
}))

let mockUser: { id: string; dateOfBirth: string | null } = { id: 'u-1', dateOfBirth: '1998-05-15' }
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }))

import FreeAgentOnboarding from '../(auth)/free-agent-profile'

function dobForAge(years: number) {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 10)
}

describe('Free-agent onboarding', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockReplace.mockReset()
    mockApi.mockReset()
    mockApi.mockResolvedValue({})
    mockUser = { id: 'u-1', dateOfBirth: '1998-05-15' }
  })

  it('explains under-16s talk to their parents instead of creating a profile', () => {
    mockUser = { id: 'u-1', dateOfBirth: dobForAge(15) }
    render(<FreeAgentOnboarding />)
    expect(screen.getByText('spielerprofil.under16Body')).toBeTruthy()
    expect(screen.queryByText('spielerprofil.onboardingCta')).toBeNull()
    fireEvent.press(screen.getByText('common.back'))
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('tells a 16–17-year-old that only clubs see the profile', () => {
    mockUser = { id: 'u-1', dateOfBirth: dobForAge(17) }
    render(<FreeAgentOnboarding />)
    expect(screen.getByText('spielerprofil.minorTitle')).toBeTruthy()
  })

  it('needs a position and a valid PLZ before continuing', () => {
    render(<FreeAgentOnboarding />)
    fireEvent.press(screen.getByText('spielerprofil.onboardingCta'))
    expect(mockApi).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('saves the search facts as a visible profile, then finishes onboarding', async () => {
    render(<FreeAgentOnboarding />)
    fireEvent.press(screen.getByText('spielerprofil.position.GK'))
    fireEvent.changeText(screen.getByLabelText('spielerprofil.fieldPostalCode'), '14482')
    fireEvent.press(screen.getByText('spielerprofil.league.KREISLIGA_A'))
    fireEvent.press(screen.getByText('spielerprofil.onboardingCta'))

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
    expect(mockApi).toHaveBeenCalledWith('/me', {
      method: 'PATCH',
      body: { registrationRole: 'FREE_AGENT' },
    })
    expect(mockApi).toHaveBeenCalledWith(
      '/me/free-agent-profile',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          position: 'GK',
          postalCode: '14482',
          highestLeague: 'KREISLIGA_A',
          isOnTransferList: true,
          visibility: 'CLUB_ONLY',
          availableFrom: null,
        }),
      }),
    )
  })
})
