import { fireEvent, render, waitFor } from '@testing-library/react-native'
import FindClubScreen from '../find-club'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}))

jest.mock('react-i18next', () => {
  const t = (key: string, opts?: { count?: number }) => {
    if (opts?.count != null && key.includes('memberCount')) {
      return `${opts.count} members`
    }
    const map: Record<string, string> = {
      'findClub.title': 'Find your club',
      'findClub.searchPlaceholder': 'Club name or city',
      'findClub.empty': 'No clubs match',
      'findClub.startTyping': 'Start typing to search',
    }
    return map[key] ?? key
  }
  const translation = { t }
  return { useTranslation: () => translation }
})

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isSignedIn: true, isLoading: false }),
}))

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

const mockApi = jest.fn()
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error {},
}))

describe('FindClubScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders an empty-state hint before the user types', () => {
    const { getByText } = render(<FindClubScreen />)
    expect(getByText('Start typing to search')).toBeTruthy()
  })

  it('fetches results when query >= 2 chars and renders them', async () => {
    mockApi.mockResolvedValueOnce({
      results: [
        {
          id: 'c1',
          name: 'FC Bayern',
          slug: 'fc-bayern',
          badgeUrl: null,
          primaryColor: '#D50000',
          city: 'Munich',
          memberCount: 42,
        },
      ],
      nextCursor: null,
    })

    const { getByPlaceholderText, findByText } = render(<FindClubScreen />)
    fireEvent.changeText(getByPlaceholderText('Club name or city'), 'FC')

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        expect.stringContaining('/clubs/search?q=FC'),
      )
    })

    expect(await findByText('FC Bayern')).toBeTruthy()
    expect(await findByText(/Munich/i)).toBeTruthy()
    expect(await findByText(/42 members/i)).toBeTruthy()
  })

  it('tapping a result pushes to /club/[slug]', async () => {
    mockApi.mockResolvedValueOnce({
      results: [
        {
          id: 'c1',
          name: 'FC Bayern',
          slug: 'fc-bayern',
          badgeUrl: null,
          primaryColor: '#D50000',
          city: 'Munich',
          memberCount: 42,
        },
      ],
      nextCursor: null,
    })

    const { getByPlaceholderText, findByText } = render(<FindClubScreen />)
    fireEvent.changeText(getByPlaceholderText('Club name or city'), 'FC')
    const row = await findByText('FC Bayern')
    fireEvent.press(row)

    expect(mockPush).toHaveBeenCalledWith('/club/fc-bayern')
  })

  it('shows empty state when results array is empty', async () => {
    mockApi.mockResolvedValueOnce({ results: [], nextCursor: null })
    const { getByPlaceholderText, findByText } = render(<FindClubScreen />)
    fireEvent.changeText(getByPlaceholderText('Club name or city'), 'XX')
    expect(await findByText('No clubs match')).toBeTruthy()
  })
})
