import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockUpdate = jest.fn()
const mockApi = jest.fn()

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
    t: (key: string, opts?: { name?: string }) => {
      const map: Record<string, string> = {
        'onboarding.clubCreate.title': 'Create your club',
        'onboarding.clubCreate.namePlaceholder': 'FC Köpenick 1908',
        'onboarding.clubCreate.cityPlaceholder': 'Berlin',
        'onboarding.clubCreate.teamPlaceholder': 'U17 Männlich',
        'onboarding.clubCreate.cta': `Create ${opts?.name ?? ''}`,
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: { firstName: 'Owner' }, update: mockUpdate, reset: jest.fn() }),
}))

jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {
    status: number
    constructor(m: string, status: number) {
      super(m)
      this.status = status
    }
  },
}))

import ClubCreate from '../(auth)/club-create'

describe('ClubCreate', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockUpdate.mockReset()
    mockApi.mockReset()
  })

  it('creates club + first team and routes to /roster-build', async () => {
    mockApi
      .mockResolvedValueOnce({ id: 'club_1', name: 'FC Köpenick' })
      .mockResolvedValueOnce({ id: 'team_1', name: 'U17' })
    render(<ClubCreate />)
    fireEvent.changeText(screen.getByPlaceholderText(/Köpenick/), 'FC Köpenick 1908')
    fireEvent.changeText(screen.getByPlaceholderText(/Berlin/), 'Berlin')
    fireEvent.changeText(screen.getByPlaceholderText(/U17/), 'U17 Männlich')
    fireEvent.press(screen.getByText(/Create FC Köpenick 1908/))
    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(2))
    expect(mockUpdate).toHaveBeenCalledWith({ clubId: 'club_1', teamId: 'team_1' })
    expect(mockPush).toHaveBeenCalledWith('/(auth)/roster-build')
  })
})
