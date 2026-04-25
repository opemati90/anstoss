import { fireEvent, render, waitFor } from '@testing-library/react-native'
import ClubPreview from '../club/[slug]'

const mockReplace = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), back: () => mockBack() },
  useLocalSearchParams: () => ({ slug: 'fc-bayern' }),
}))

jest.mock('react-i18next', () => {
  const t = (key: string, opts?: { count?: number }) => {
    if (opts?.count != null) return `${opts.count} x ${key}`
    const map: Record<string, string> = {
      'clubPreview.title': 'Club details',
      'clubPreview.requestToJoin': 'Request to join',
      'clubPreview.alreadyMember': 'Already a member',
    }
    return map[key] ?? key
  }
  const translation = { t }
  return { useTranslation: () => translation }
})

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    isSignedIn: true,
    memberships: [],
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
  })

  it('renders the club hero after fetch', async () => {
    mockApi.mockResolvedValueOnce({
      id: 'c1',
      name: 'FC Bayern',
      slug: 'fc-bayern',
      badgeUrl: null,
      primaryColor: '#D50000',
      city: 'Munich',
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
        name: 'FC Bayern',
        slug: 'fc-bayern',
        badgeUrl: null,
        primaryColor: '#D50000',
        city: 'Munich',
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
      expect(mockReplace).toHaveBeenCalledWith('/pending-approval')
    })
  })
})
