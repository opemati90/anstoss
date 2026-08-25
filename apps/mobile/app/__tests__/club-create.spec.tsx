import { fireEvent, render, screen } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockUpdate = jest.fn()
const mockMarkStep = jest.fn()
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
    t: (key: string, opts?: Record<string, unknown> & { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'onboarding.clubCreate.title': 'Create your club',
        'onboarding.clubCreate.namePlaceholder': 'FC Köpenick 1908',
        'onboarding.clubCreate.teamLabel': 'Team name',
        'onboarding.clubCreate.teamPlaceholder': 'U17 Männlich',
        'common.next': 'Next',
      }
      return map[key] ?? opts?.defaultValue ?? key
    },
  }),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({
    state: { firstName: 'Owner' },
    update: mockUpdate,
    markStep: mockMarkStep,
    reset: jest.fn(),
  }),
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
}))

import ClubCreate from '../(auth)/club-create'

describe('ClubCreate', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockPush.mockReset()
    mockUpdate.mockReset()
    mockMarkStep.mockReset()
    mockApi.mockReset()
  })

  afterEach(() => jest.useRealTimers())

  it('requires a verified public result and preserves optional participant roles', async () => {
    mockApi.mockResolvedValue({
      results: [
        {
          id: 'directory-result-1',
          directoryEntryId: 'directory-1',
          name: 'FC Köpenick 1908',
          badgeUrl: null,
          city: 'Berlin',
          isActive: false,
        },
      ],
      nextCursor: null,
    })
    render(<ClubCreate />)
    fireEvent.changeText(screen.getByPlaceholderText(/Köpenick/), 'FC Köpenick 1908')
    await jest.advanceTimersByTimeAsync(350)
    fireEvent.press(await screen.findByText('FC Köpenick 1908'))
    fireEvent.changeText(screen.getByPlaceholderText(/U17/), 'U17 Männlich')
    fireEvent.changeText(
      screen.getByPlaceholderText('https://www.fussball.de/...'),
      'https://www.fussball.de/mannschaft/fc-koepenick',
    )
    expect(screen.getByText('Team name')).toBeOnTheScreen()
    fireEvent.press(screen.getByText(/Next/))
    expect(mockUpdate).toHaveBeenCalledWith({
      clubName: 'FC Köpenick 1908',
      teamName: 'U17 Männlich',
      fussballExternalClubId: 'directory-1',
      officialTeamUrl: 'https://www.fussball.de/mannschaft/fc-koepenick',
      fussballClubLogoUrl: undefined,
      adminTeamRoles: [],
    })
    expect(mockPush).toHaveBeenCalledWith('/(auth)/club-identity')
  })
})
