import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import FindClubScreen from '../find-club'

const mockPush = jest.fn()

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}))

jest.mock('react-i18next', () => {
  const t = (key: string, opts?: { count?: number; defaultValue?: string }) => {
    if (opts?.count != null && key.includes('memberCount')) {
      return `${opts.count} members`
    }
    const map: Record<string, string> = {
      'findClub.title': 'Find your club',
      'findClub.searchPlaceholder': 'Club name or city',
      'findClub.empty': 'No clubs match',
      'findClub.startTyping': 'Start typing to search',
      'findClub.directoryRecord': 'Not on Anstoss yet',
      'findClub.setupMissingClub': 'Set up this club',
      'findClub.loadError': 'Could not load clubs',
    }
    return map[key] ?? opts?.defaultValue ?? key
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

  it('lets admins continue setup when a searched club is missing', async () => {
    mockApi.mockResolvedValueOnce({ results: [], nextCursor: null })
    const { getByPlaceholderText, findByText } = render(<FindClubScreen />)
    fireEvent.changeText(getByPlaceholderText('Club name or city'), 'SV Missing')

    fireEvent.press(await findByText('Set up this club'))

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/club-setup',
      params: { clubName: 'SV Missing' },
    })
  })

  it('labels imported directory clubs that are not active yet', async () => {
    mockApi.mockResolvedValueOnce({
      results: [
        {
          id: 'dir1',
          directoryEntryId: 'dir1',
          activeClubId: null,
          name: 'SV Directory',
          slug: 'sv-directory',
          badgeUrl: null,
          primaryColor: '#1A1A18',
          city: 'Berlin',
          association: 'Berliner FV',
          isActive: false,
          memberCount: 0,
        },
      ],
      nextCursor: null,
    })
    const { getByPlaceholderText, findByText } = render(<FindClubScreen />)
    fireEvent.changeText(getByPlaceholderText('Club name or city'), 'SV')

    expect(await findByText('SV Directory')).toBeTruthy()
    expect(await findByText(/Not on Anstoss yet/i)).toBeTruthy()
  })

  it('ignores stale results as soon as the query changes', async () => {
    const firstSearch = deferred<{
      results: Array<Record<string, unknown>>
      nextCursor: null
    }>()
    const secondSearch = deferred<{
      results: Array<Record<string, unknown>>
      nextCursor: null
    }>()
    mockApi
      .mockReturnValueOnce(firstSearch.promise)
      .mockReturnValueOnce(secondSearch.promise)

    const { getByPlaceholderText, findByText, queryByText } = render(<FindClubScreen />)

    fireEvent.changeText(getByPlaceholderText('Club name or city'), 'SV')
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(expect.stringContaining('/clubs/search?q=SV')),
    )

    fireEvent.changeText(getByPlaceholderText('Club name or city'), 'Bayern')

    await act(async () => {
      firstSearch.resolve({
        results: [
          {
            id: 'old',
            name: 'SV Old Result',
            slug: 'sv-old-result',
            badgeUrl: null,
            primaryColor: '#1A1A18',
            city: 'Berlin',
            memberCount: 4,
          },
        ],
        nextCursor: null,
      })
    })

    expect(queryByText('SV Old Result')).toBeNull()
    expect(queryByText('No clubs match')).toBeNull()

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(expect.stringContaining('/clubs/search?q=Bayern')),
    )
    await act(async () => {
      secondSearch.resolve({
        results: [
          {
            id: 'new',
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
    })

    expect(await findByText('FC Bayern')).toBeTruthy()
  })

  it('shows current search errors instead of the start-typing hint', async () => {
    mockApi.mockRejectedValueOnce(new Error('Network down'))

    const { getByPlaceholderText, findByText, queryByText } = render(<FindClubScreen />)
    fireEvent.changeText(getByPlaceholderText('Club name or city'), 'SV')

    expect(await findByText('Network down')).toBeTruthy()
    expect(queryByText('Start typing to search')).toBeNull()
  })
})
