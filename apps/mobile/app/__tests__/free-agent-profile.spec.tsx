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
        'onboarding.freeAgent.titlePosition': 'Where do you play?',
        'onboarding.freeAgent.bioPlaceholder': 'Optional: what makes you a fit?',
        'onboarding.freeAgent.finishCta': 'Finish',
      }
      return map[key] ?? key
    },
  }),
}))

import FreeAgentProfile from '../(auth)/free-agent-profile'

describe('FreeAgentProfile', () => {
  beforeEach(() => {
    mockPush.mockReset()
  })

  it('routes to /done on finish', () => {
    render(<FreeAgentProfile />)
    fireEvent.press(screen.getByText(/finish/i))
    expect(mockPush).toHaveBeenCalledWith('/(auth)/done')
  })
})
