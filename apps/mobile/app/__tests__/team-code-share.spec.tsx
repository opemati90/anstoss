import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockApi = jest.fn()
const mockShare = jest.fn()

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}))

jest.mock('react-native/Libraries/Share/Share', () => ({
  share: (...args: unknown[]) => mockShare(...args),
}))

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'onboarding.teamCodeShare.title': 'Share this code',
        'onboarding.teamCodeShare.hint': 'Players and coaches enter it to join.',
        'onboarding.teamCodeShare.cta': 'Done',
        'onboarding.teamCodeShare.copy': 'Copy',
        'onboarding.teamCodeShare.copied': 'Copied',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({
    state: { clubId: 'c1', teamId: 't1' },
    update: jest.fn(),
    reset: jest.fn(),
  }),
}))

jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error {},
}))

import TeamCodeShare from '../(auth)/team-code-share'

describe('TeamCodeShare', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockApi.mockReset()
    mockShare.mockReset()
  })

  it('fetches the join code and shows it', async () => {
    mockApi.mockResolvedValue({ joinCode: 'AB23X' })
    render(<TeamCodeShare />)
    await waitFor(() => expect(screen.getByText('AB23X')).toBeOnTheScreen())
  })

  it('routes to /done on CTA', async () => {
    mockApi.mockResolvedValue({ joinCode: 'QQQQQ' })
    render(<TeamCodeShare />)
    await waitFor(() => expect(screen.getByText('QQQQQ')).toBeOnTheScreen())
    fireEvent.press(screen.getByText(/done/i))
    expect(mockPush).toHaveBeenCalledWith('/(auth)/done')
  })
})
