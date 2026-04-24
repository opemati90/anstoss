import { fireEvent, render, waitFor } from '@testing-library/react-native'
import PendingApprovalScreen from '../pending-approval'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn() },
}))

jest.mock('react-i18next', () => {
  const t = (key: string, opts?: { email?: string }) => {
    if (key === 'pendingApproval.ageGateBody' && opts?.email) {
      return `We emailed ${opts.email}`
    }
    const map: Record<string, string> = {
      'pendingApproval.eyebrow': 'Awaiting approval',
      'pendingApproval.title': 'Your request is with the club',
      'pendingApproval.body': 'Most clubs reply within 1–2 days.',
      'pendingApproval.remindCta': 'Ping the club admin',
      'pendingApproval.remindSuccess': 'We let the admin know.',
      'pendingApproval.remindCooldown': 'Try again in a few minutes.',
      'pendingApproval.checkStatus': 'Check again',
      'pendingApproval.signOut': 'Sign out',
    }
    return map[key] ?? key
  }
  const translation = { t }
  return {
    useTranslation: () => translation,
    initReactI18next: { type: '3rdParty', init: () => {} },
  }
})

const mockRefreshUser = jest.fn()
const mockSignOut = jest.fn()
const mockPendingJoinRequest = { clubId: 'c1', id: 'jr1' }

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    ageGate: null,
    refreshUser: mockRefreshUser,
    signOut: mockSignOut,
    pendingJoinRequest: mockPendingJoinRequest,
  }),
}))

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

const mockApi = jest.fn()
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error {
    status?: number
  },
}))

describe('PendingApprovalScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApi.mockReset()
  })

  it('renders the empty-state copy', () => {
    const { getByText } = render(<PendingApprovalScreen />)
    expect(getByText('Your request is with the club')).toBeTruthy()
    expect(getByText('Most clubs reply within 1–2 days.')).toBeTruthy()
  })

  it('posts to the remind endpoint on ping', async () => {
    mockApi.mockResolvedValueOnce({ ok: true })
    const { getByText } = render(<PendingApprovalScreen />)
    fireEvent.press(getByText('Ping the club admin'))
    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        '/clubs/c1/join-requests/jr1/remind',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('shows cooldown message on 400 response', async () => {
    const ApiError = require('../../src/api/client').ApiError
    const err = new ApiError('cooldown')
    ;(err as { status?: number }).status = 400
    mockApi.mockRejectedValueOnce(err)
    const { getByText, findByText } = render(<PendingApprovalScreen />)
    fireEvent.press(getByText('Ping the club admin'))
    expect(await findByText('Try again in a few minutes.')).toBeTruthy()
  })
})
