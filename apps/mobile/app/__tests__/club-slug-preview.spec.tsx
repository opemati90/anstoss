import { fireEvent, render, waitFor } from '@testing-library/react-native'
import ClubPreview from '../club/[slug]'

const mockReplace = jest.fn()
const mockBack = jest.fn()
const mockPush = jest.fn()
const mockRefreshUser = jest.fn()
let mockMemberships: Array<{ club: { id: string } }> = []
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    replace: (...a: unknown[]) => mockReplace(...a),
    back: () => mockBack(),
  },
  useLocalSearchParams: () => ({ slug: 'fc-bayern' }),
}))

jest.mock('react-i18next', () => {
  const t = (key: string, opts?: { count?: number; defaultValue?: string }) => {
    if (opts?.count != null) return `${opts.count} x ${key}`
    const map: Record<string, string> = {
      'clubPreview.title': 'Club details',
      'clubPreview.requestToJoin': 'Request to join',
      'clubPreview.alreadyMember': 'Already a member',
      'clubPreview.directoryTitle': 'Club found',
      'clubPreview.setupDirectoryClub': 'Set up this club',
    }
    return map[key] ?? opts?.defaultValue ?? key
  }
  const translation = { t }
  return { useTranslation: () => translation }
})

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    isSignedIn: true,
    memberships: mockMemberships,
    refreshUser: mockRefreshUser,
    isLoading: false,
  }),
}))

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

const mockApi = jest.fn()
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error {},
}))

describe('ClubPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRefreshUser.mockReset()
    mockMemberships = []
  })

  it('renders the club hero after fetch', async () => {
    mockApi.mockResolvedValueOnce({
      id: 'c1',
      activeClubId: 'c1',
      name: 'FC Bayern',
      slug: 'fc-bayern',
      badgeUrl: null,
      primaryColor: '#D50000',
      city: 'Munich',
      source: 'ANSTOSS',
      isActive: true,
      memberCount: 42,
      teamCount: 5,
    })

    const { findByText } = render(<ClubPreview />)

    expect(await findByText('FC Bayern')).toBeTruthy()
    expect(await findByText(/Munich/i)).toBeTruthy()
  })

  it('submits a join request and navigates to pending-approval', async () => {
    mockApi
      .mockResolvedValueOnce({
        id: 'c1',
        activeClubId: 'c1',
        name: 'FC Bayern',
        slug: 'fc-bayern',
        badgeUrl: null,
        primaryColor: '#D50000',
        city: 'Munich',
        source: 'ANSTOSS',
        isActive: true,
        memberCount: 42,
        teamCount: 5,
      })
      .mockResolvedValueOnce({ id: 'jr1', status: 'PENDING' })

    const { findByText } = render(<ClubPreview />)
    const cta = await findByText('Request to join')
    fireEvent.press(cta)

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        '/clubs/c1/join-requests',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(mockRefreshUser).toHaveBeenCalledWith(undefined, { throwOnError: true })
      expect(mockReplace).toHaveBeenCalledWith('/pending-approval')
    })
  })

  it('opens admin setup instead of join request for directory-only clubs', async () => {
    mockApi.mockResolvedValueOnce({
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
      teamCount: 0,
    })

    const { findByText } = render(<ClubPreview />)
    expect(await findByText('Club found')).toBeTruthy()

    fireEvent.press(await findByText('Set up this club'))

    expect(mockApi).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/club-setup',
      params: {
        clubName: 'SV Directory',
        directoryEntryId: 'dir1',
      },
    })
  })

  it('does not post a join request when an active club id is missing', async () => {
    mockApi.mockResolvedValueOnce({
      id: 'dir1',
      directoryEntryId: 'dir1',
      activeClubId: null,
      name: 'SV Stale Directory',
      slug: 'sv-stale-directory',
      badgeUrl: null,
      primaryColor: '#1A1A18',
      city: 'Berlin',
      association: 'Berliner FV',
      memberCount: 0,
      teamCount: 0,
    })

    const { findByText, queryByText } = render(<ClubPreview />)
    expect(await findByText('Club found')).toBeTruthy()
    expect(queryByText('Request to join')).toBeNull()
    expect(mockApi).toHaveBeenCalledTimes(1)
  })

  it('detects existing membership by active club id when the public record id differs', async () => {
    mockMemberships = [{ club: { id: 'active-c1' } }]
    mockApi.mockResolvedValueOnce({
      id: 'directory-c1',
      activeClubId: 'active-c1',
      name: 'FC Bayern',
      slug: 'fc-bayern',
      badgeUrl: null,
      primaryColor: '#D50000',
      city: 'Munich',
      source: 'DIRECTORY',
      isActive: true,
      memberCount: 42,
      teamCount: 5,
    })

    const { findByText, queryByText } = render(<ClubPreview />)

    expect(await findByText('Already a member')).toBeTruthy()
    expect(queryByText('Request to join')).toBeNull()
  })
})
