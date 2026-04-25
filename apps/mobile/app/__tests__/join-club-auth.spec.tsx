import renderer, { act } from 'react-test-renderer'
import JoinClubScreen from '../join-club'

const mockReplace = jest.fn()
const mockParams: { slug?: string } = { slug: 'sv-albatros' }

jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    back: jest.fn(),
  },
  useLocalSearchParams: () => mockParams,
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}))

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

describe('JoinClubScreen legacy redirect', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('redirects to /club/[slug] when a slug is supplied', () => {
    mockParams.slug = 'sv-albatros'
    act(() => {
      renderer.create(<JoinClubScreen />)
    })
    expect(mockReplace).toHaveBeenCalledWith('/club/sv-albatros')
  })

  it('redirects to /find-club when no slug supplied', () => {
    mockParams.slug = undefined
    act(() => {
      renderer.create(<JoinClubScreen />)
    })
    expect(mockReplace).toHaveBeenCalledWith('/find-club')
  })
})
