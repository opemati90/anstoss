import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { RefreshControl } from 'react-native'
import { router } from 'expo-router'
import { TrialInviteStatus, type TrialInvite } from '@anstoss/shared'
import InvitesTab, {
  getInviteNextAction,
  sortTrialInvites,
} from '../(tabs)/invites/index'
import { api } from '../../src/api/client'

const mockRefreshUser = jest.fn(() => Promise.resolve())

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}))

jest.mock('../../src/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('react-i18next', () => {
  const map: Record<string, string> = {
    'common.error': 'Error',
    'invites.eyebrow': 'TRIALS · WAITING ON YOU',
    'invites.heroEmpty': 'No pending invites',
    'invites.heroOne': '1 club waiting',
    'invites.heroMany': '{{count}} clubs waiting',
    'invites.heroSub': 'Accept to start training with the club. Declines are private.',
    'invites.emptyTitle': 'No invites yet',
    'invites.emptyBody':
      'Clubs scouting your position will reach out here. Make sure your profile is public.',
    'invites.expires': 'Expires {{date}}',
    'invites.nextActionEyebrow': 'NEXT INVITE',
    'invites.loadingA11y': 'Loading trial invites',
    'invites.loadingTitle': 'Checking trial invites',
    'invites.loadingBody': 'We are checking whether a club is waiting for your answer.',
    'invites.loadErrorTitle': "Couldn't load trial invites",
    'invites.loadErrorBody': 'Keep your current invites intact and try again.',
    'invites.retryLoadCta': 'Try again',
    'invites.retryLoadA11y': 'Try loading trial invites again',
    'invites.emptyActionTitle': 'Keep your player card ready',
    'invites.emptyActionBody':
      'Clubs can invite you once your profile is public and current.',
    'invites.openProfileCta': 'Open player profile',
    'invites.openProfileA11y': 'Open your free agent player profile',
    'invites.clubFallback': 'A club',
    'invites.teamFallback': 'Squad',
    'invites.acceptedEyebrow': 'TRIAL ACCEPTED',
    'invites.acceptedTitle': 'Trial accepted with {{club}}',
    'invites.acceptedBody':
      '{{team}} has your answer. Watch for schedule and team access updates.',
    'invites.pendingActionTitle': '{{club}} is waiting',
    'invites.pendingActionBody': '{{team}} · expires {{date}}',
    'invites.declineA11y': 'Decline trial invite from {{club}}',
    'invites.acceptA11y': 'Accept trial invite from {{club}}',
    'freeAgent.accept': 'Accept',
    'freeAgent.decline': 'Decline',
    'freeAgent.trialStatus.PENDING': 'Pending',
    'freeAgent.trialStatus.ACCEPTED': 'Accepted',
    'freeAgent.trialStatus.DECLINED': 'Declined',
    'freeAgent.trialStatus.EXPIRED': 'Expired',
    'freeAgent.trialStatus.REVOKED': 'Revoked',
  }
  const t = (key: string, opts?: Record<string, unknown>) => {
    const template = map[key] ?? key
    return Object.entries(opts ?? {}).reduce(
      (text, [nextKey, value]) =>
        text.replaceAll(`{{${nextKey}}}`, value == null ? '' : String(value)),
      template,
    )
  }
  return { useTranslation: () => ({ t }) }
})

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ refreshUser: mockRefreshUser }),
}))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({
      ...FALLBACK_THEME,
      primary: '#1E3A5F',
      primary50: '#DDE7F1',
    }),
    useIsDark: () => false,
  }
})

jest.mock('../../src/i18n', () => ({
  getAppLanguage: () => 'en',
  getAppLocale: () => 'en-GB',
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
}))

const mockApi = api as jest.MockedFunction<typeof api>
const mockPush = router.push as jest.Mock

function trialInvite(overrides: Partial<TrialInvite> = {}): TrialInvite {
  return {
    id: 'invite-1',
    clubId: 'club-1',
    freeAgentProfileId: 'profile-1',
    teamId: 'team-1',
    sentByUserId: 'coach-1',
    message: 'Join the next training and meet the staff.',
    expiresAt: '2026-06-24T18:00:00.000Z',
    status: TrialInviteStatus.PENDING,
    respondedAt: null,
    createdAt: '2026-06-18T10:00:00.000Z',
    club: {
      id: 'club-1',
      name: 'FC Soon',
      badgeUrl: null,
      primaryColor: '#1E3A5F',
    },
    team: {
      id: 'team-1',
      displayName: 'U19',
      groupName: 'Youth',
    },
    sender: {
      id: 'coach-1',
      name: 'Coach Kim',
    },
    ...overrides,
  }
}

describe('InvitesTab', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 5, 20, 12, 0, 0))
    mockApi.mockReset()
    mockPush.mockReset()
    mockRefreshUser.mockClear()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('sorts pending invites by expiry before past invites', () => {
    const later = trialInvite({
      id: 'later',
      expiresAt: '2026-06-30T18:00:00.000Z',
    })
    const sooner = trialInvite({
      id: 'sooner',
      expiresAt: '2026-06-22T18:00:00.000Z',
    })
    const accepted = trialInvite({
      id: 'accepted',
      status: TrialInviteStatus.ACCEPTED,
      respondedAt: '2026-06-21T18:00:00.000Z',
    })

    expect(sortTrialInvites([accepted, later, sooner]).map((i) => i.id)).toEqual([
      'sooner',
      'later',
      'accepted',
    ])
    expect(getInviteNextAction([accepted, later, sooner])).toMatchObject({
      kind: 'pending',
      invite: { id: 'sooner' },
    })
  })

  it('prioritizes the earliest pending invite and accepts it from the command panel', async () => {
    const invite = trialInvite()
    mockApi.mockImplementation((path: string) => {
      if (path === '/me/trial-invites') {
        return Promise.resolve([invite]) as ReturnType<typeof api>
      }
      if (path === '/trial-invites/invite-1') {
        return Promise.resolve({
          ...invite,
          status: TrialInviteStatus.ACCEPTED,
          respondedAt: '2026-06-20T12:01:00.000Z',
        }) as ReturnType<typeof api>
      }
      return Promise.resolve(null) as ReturnType<typeof api>
    })

    const screen = render(<InvitesTab />)

    expect(await screen.findByText('FC Soon is waiting')).toBeTruthy()
    expect(screen.getAllByText(/24 Jun 2026/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/24\.06\.2026/)).toBeNull()
    expect(screen.getAllByText('Accept')).toHaveLength(1)

    fireEvent.press(screen.getByLabelText('Accept trial invite from FC Soon'))

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        '/trial-invites/invite-1',
        expect.objectContaining({
          method: 'PATCH',
          body: { status: TrialInviteStatus.ACCEPTED },
        }),
      )
      expect(mockRefreshUser).toHaveBeenCalled()
      expect(screen.getByText('Trial accepted with FC Soon')).toBeTruthy()
    })
  })

  it('does not let a stale refresh overwrite a local invite decision', async () => {
    const invite = trialInvite()
    const acceptedInvite = {
      ...invite,
      status: TrialInviteStatus.ACCEPTED,
      respondedAt: '2026-06-20T12:01:00.000Z',
    }
    let getCount = 0
    let resolveRefresh: (value: TrialInvite[]) => void = () => {}

    mockApi.mockImplementation((path: string) => {
      if (path === '/me/trial-invites') {
        getCount += 1
        if (getCount === 1) {
          return Promise.resolve([invite]) as ReturnType<typeof api>
        }
        return new Promise<TrialInvite[]>((resolve) => {
          resolveRefresh = resolve
        }) as ReturnType<typeof api>
      }
      if (path === '/trial-invites/invite-1') {
        return Promise.resolve(acceptedInvite) as ReturnType<typeof api>
      }
      return Promise.resolve(null) as ReturnType<typeof api>
    })

    const screen = render(<InvitesTab />)

    expect(await screen.findByText('FC Soon is waiting')).toBeTruthy()
    act(() => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh()
    })

    fireEvent.press(screen.getByLabelText('Accept trial invite from FC Soon'))

    await waitFor(() => {
      expect(screen.getByText('Trial accepted with FC Soon')).toBeTruthy()
    })

    await act(async () => {
      resolveRefresh([invite])
      await Promise.resolve()
    })

    expect(screen.getByText('Trial accepted with FC Soon')).toBeTruthy()
    expect(screen.queryByText('FC Soon is waiting')).toBeNull()
  })

  it('drops refresh results that started while a decision was pending', async () => {
    const invite = trialInvite()
    const acceptedInvite = {
      ...invite,
      status: TrialInviteStatus.ACCEPTED,
      respondedAt: '2026-06-20T12:01:00.000Z',
    }
    let getCount = 0
    let resolvePatch: (value: TrialInvite) => void = () => {}
    let resolveRefresh: (value: TrialInvite[]) => void = () => {}

    mockApi.mockImplementation((path: string) => {
      if (path === '/me/trial-invites') {
        getCount += 1
        if (getCount === 1) {
          return Promise.resolve([invite]) as ReturnType<typeof api>
        }
        return new Promise<TrialInvite[]>((resolve) => {
          resolveRefresh = resolve
        }) as ReturnType<typeof api>
      }
      if (path === '/trial-invites/invite-1') {
        return new Promise<TrialInvite>((resolve) => {
          resolvePatch = resolve
        }) as ReturnType<typeof api>
      }
      return Promise.resolve(null) as ReturnType<typeof api>
    })

    const screen = render(<InvitesTab />)

    expect(await screen.findByText('FC Soon is waiting')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Accept trial invite from FC Soon'))

    act(() => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh()
    })

    await act(async () => {
      resolvePatch(acceptedInvite)
      await Promise.resolve()
    })

    expect(screen.getByText('Trial accepted with FC Soon')).toBeTruthy()

    await act(async () => {
      resolveRefresh([invite])
      await Promise.resolve()
    })

    expect(screen.getByText('Trial accepted with FC Soon')).toBeTruthy()
    expect(screen.queryByText('FC Soon is waiting')).toBeNull()
  })

  it('blocks a second invite decision while another decision is in flight', async () => {
    const first = trialInvite()
    const second = trialInvite({
      id: 'invite-2',
      clubId: 'club-2',
      teamId: 'team-2',
      club: {
        id: 'club-2',
        name: 'FC Later',
        badgeUrl: null,
        primaryColor: '#9333EA',
      },
      team: {
        id: 'team-2',
        displayName: 'U21',
        groupName: 'Youth',
      },
      expiresAt: '2026-06-30T18:00:00.000Z',
      createdAt: '2026-06-19T10:00:00.000Z',
    })
    let resolvePatch: (value: TrialInvite) => void = () => {}

    mockApi.mockImplementation((path: string) => {
      if (path === '/me/trial-invites') {
        return Promise.resolve([first, second]) as ReturnType<typeof api>
      }
      if (path === '/trial-invites/invite-1') {
        return new Promise<TrialInvite>((resolve) => {
          resolvePatch = resolve
        }) as ReturnType<typeof api>
      }
      if (path === '/trial-invites/invite-2') {
        return Promise.resolve({
          ...second,
          status: TrialInviteStatus.ACCEPTED,
        }) as ReturnType<typeof api>
      }
      return Promise.resolve(null) as ReturnType<typeof api>
    })

    const screen = render(<InvitesTab />)

    expect(await screen.findByText('FC Soon is waiting')).toBeTruthy()
    expect(screen.getByLabelText('Accept trial invite from FC Later')).toBeTruthy()

    fireEvent.press(screen.getByLabelText('Accept trial invite from FC Soon'))
    fireEvent.press(screen.getByLabelText('Accept trial invite from FC Later'))

    const patchCalls = mockApi.mock.calls.filter(([path]) =>
      String(path).startsWith('/trial-invites/'),
    )
    expect(patchCalls).toHaveLength(1)
    expect(patchCalls[0][0]).toBe('/trial-invites/invite-1')

    await act(async () => {
      resolvePatch({
        ...first,
        status: TrialInviteStatus.ACCEPTED,
        respondedAt: '2026-06-20T12:01:00.000Z',
      })
      await Promise.resolve()
    })
  })

  it('routes empty invite next action to the player profile', async () => {
    mockApi.mockResolvedValue([])

    const screen = render(<InvitesTab />)

    expect(await screen.findByText('Keep your player card ready')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Open your free agent player profile'))

    expect(mockPush).toHaveBeenCalledWith('/free-agent/profile')
  })

  it('shows retry instead of an empty inbox when the initial load fails', async () => {
    mockApi
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([])

    const screen = render(<InvitesTab />)

    expect(await screen.findByText("Couldn't load trial invites")).toBeTruthy()
    expect(screen.queryByText('No invites yet')).toBeNull()

    fireEvent.press(screen.getByLabelText('Try loading trial invites again'))

    expect(await screen.findByText('Keep your player card ready')).toBeTruthy()
  })
})
