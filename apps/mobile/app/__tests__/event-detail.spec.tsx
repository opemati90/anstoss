import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert, ScrollView } from 'react-native'
import EventDetailScreen from '../event-detail'
import { api, ApiError } from '../../src/api/client'

const mockPush = jest.fn()
const mockApi = api as jest.Mock
let mockUser = { id: 'user-player', name: 'Tim Weber' }
let mockEventId = 'match-1'

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useLocalSearchParams: () => ({ eventId: mockEventId }),
}))
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.name
        ? `${key}:${options.name}${options.reason ? `:${options.reason}` : ''}`
        : key,
  }),
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ activeClub: { club: { id: 'club-1' }, role: 'COACH' }, user: mockUser }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})
jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
  ApiError: class ApiError extends Error {
    status: number
    code?: string
    data?: unknown
    constructor(message: string, status = 500, code?: string, data?: unknown) {
      super(message)
      this.status = status
      this.code = code
      this.data = data
    }
  },
}))
jest.mock('../../src/i18n', () => ({ getAppLanguage: () => 'de', getAppLocale: () => 'de-DE' }))
jest.mock('../../src/utils/haptics', () => {
  const noop = () => undefined
  const Haptics = { select: noop, tap: noop, success: noop, fail: noop }
  return { Haptics, default: Haptics }
})
jest.mock('../../src/components/events/AttendanceSheet', () => ({ AttendanceSheet: () => null }))

const future = new Date(Date.now() + 4 * 86400000)

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'match-1',
    clubId: 'club-1',
    teamId: 'team-1',
    title: '@ SV Babelsberg 03',
    type: 'MATCH',
    date: future.toISOString(),
    meetingAt: new Date(future.getTime() - 60 * 60000).toISOString(),
    meetingPoint: 'Parkplatz Vereinsheim',
    location: 'Karl-Liebknecht-Stadion, Potsdam',
    opponent: 'SV Babelsberg 03',
    homeAway: 'AWAY',
    carpoolEnabled: true,
    notes: null,
    createdById: 'coach',
    createdAt: new Date().toISOString(),
    cancelledAt: null,
    team: { id: 'team-1', name: 'Herren I' },
    myRsvp: null,
    rsvps: [
      {
        id: 'r1',
        userId: 'lukas',
        status: 'YES',
        updatedAt: new Date().toISOString(),
        user: { id: 'lukas', name: 'Lukas Hoffmann' },
      },
      {
        id: 'r2',
        userId: 'jonas',
        status: 'NO',
        reason: 'injured',
        note: 'Knie zwickt',
        updatedAt: new Date().toISOString(),
        user: { id: 'jonas', name: 'Jonas Becker' },
      },
    ],
    members: [
      { userId: 'lukas', name: 'Lukas Hoffmann' },
      { userId: 'jonas', name: 'Jonas Becker' },
      { userId: 'felix', name: 'Felix Schulz' },
    ],
    reminderEligibleUserIds: ['lukas', 'jonas', 'felix'],
    children: [],
    viewer: { canManage: false, isPlayer: true, isGuardian: false },
    ...overrides,
  }
}

describe('EventDetailScreen', () => {
  beforeEach(() => {
    mockEventId = 'match-1'
    jest.clearAllMocks()
    mockUser = { id: 'user-player', name: 'Tim Weber' }
  })

  it('shows Treffpunkt for players, their own answer, and Zusagen · Kader · Fahrten for an away match', async () => {
    mockApi.mockResolvedValue(detail())
    const screen = render(<EventDetailScreen />)

    expect(await screen.findByText('eventFlow.detail.yourAnswer')).toBeTruthy()
    expect(screen.getByText('Parkplatz Vereinsheim')).toBeTruthy()
    expect(screen.getByText('eventFlow.detail.tabResponses')).toBeTruthy()
    expect(screen.getByText('eventFlow.detail.tabSquad')).toBeTruthy()
    expect(screen.getByText('eventFlow.detail.tabRides')).toBeTruthy()
    // Grouped replies: open replies are listed by name.
    expect(screen.getByText('Felix Schulz')).toBeTruthy()
    expect(screen.queryByTestId('event-manage-menu')).toBeNull()
  })

  it.each([
    ['YES', 'yes', 'groupYes'],
    ['MAYBE', 'maybe', 'groupMaybe'],
    ['NO', 'no', 'groupNo'],
  ])('saves the player’s own %s availability and reloads the grouped response', async (status, label, group) => {
    let saved = false
    mockApi.mockImplementation((_path: string, init?: { method?: string }) => {
      if (init?.method === 'PUT') { saved = true; return Promise.resolve({}) }
      const value = detail()
      return Promise.resolve({
        ...value,
        myRsvp: saved ? status : null,
        members: [...value.members, { userId: 'user-player', name: 'Tim Weber' }],
        rsvps: saved ? [...value.rsvps, { id: 'mine', userId: 'user-player', status, user: { name: 'Tim Weber' } }] : value.rsvps,
      })
    })
    const screen = render(<EventDetailScreen />)
    fireEvent.press(await screen.findByLabelText(`eventFlow.rsvp.${label}`))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/events/match-1/rsvp', {
      method: 'PUT', body: { status },
    }), { timeout: 2000 })
    expect(await screen.findByLabelText(`Tim Weber, eventFlow.responses.${group}`)).toBeTruthy()
  })

  it('saves a coach lock and disables their player response', async () => {
    mockApi.mockImplementation((_path: string, init?: { method?: string }) => init?.method === 'PATCH'
      ? Promise.resolve({ deadline: null, locked: true })
      : Promise.resolve(detail({ viewer: { canManage: true, isPlayer: true, isGuardian: false } })))
    const screen = render(<EventDetailScreen />)
    fireEvent(await screen.findByTestId('event-availability-lock'), 'valueChange', true)
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/events/match-1/availability-policy', { method: 'PATCH', body: { locked: true } }))
    await screen.findByText('eventFlow.availability.closed')
    expect(screen.getByLabelText('eventFlow.rsvp.yes')).toBeDisabled()
  })

  it('hides reminders when replies have closed', async () => {
    mockApi.mockResolvedValue(detail({ rsvpLocked: true,
      viewer: { canManage: true, isPlayer: false, isGuardian: false } }))
    const screen = render(<EventDetailScreen />)
    await screen.findByText('eventFlow.availability.closed')
    expect(screen.queryByTestId('event-remind-open')).toBeNull()
  })

  it('guards rapid reminder taps and explains when none were queued', async () => {
    let finish!: (value: unknown) => void
    mockApi.mockImplementation((_path: string, init?: { method?: string }) => init?.method === 'POST'
      ? new Promise((resolve) => { finish = resolve })
      : Promise.resolve(detail({ viewer: { canManage: true, isPlayer: false, isGuardian: false } })))
    const screen = render(<EventDetailScreen />)
    const button = await screen.findByTestId('event-remind-open')
    fireEvent.press(button)
    fireEvent.press(button)
    expect(mockApi.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    await act(async () => { finish({ sent: 0, nextAvailableAt: null }) })
    expect(screen.getByText('eventFlow.responses.remindNoneAccepted')).toBeTruthy()
    expect(screen.getByTestId('event-remind-open')).not.toBeDisabled()
  })

  it('preserves a prior real cooldown when no recipients are currently eligible', async () => {
    mockApi.mockImplementation((_path: string, init?: { method?: string }) => init?.method === 'POST'
      ? Promise.resolve({ sent: 0, nextAvailableAt: new Date(Date.now() + 86400000).toISOString() })
      : Promise.resolve(detail({ viewer: { canManage: true, isPlayer: false, isGuardian: false } })))
    const screen = render(<EventDetailScreen />)
    fireEvent.press(await screen.findByTestId('event-remind-open'))
    await screen.findByText('eventFlow.responses.remindCooldown')
    expect(screen.getByTestId('event-remind-open')).toBeDisabled()
    expect(screen.queryByText('eventFlow.responses.remindNoneAccepted')).toBeNull()
  })

  it('refreshes availability if another manager locked responses before a reminder', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    let reads = 0
    try {
      mockApi.mockImplementation((_path: string, init?: { method?: string }) => {
        if (init?.method === 'POST') {
          return Promise.reject(new ApiError('Responses locked', 409, 'RSVP_LOCKED', {
            error: { code: 'RSVP_LOCKED', message: 'Responses locked' }, requestId: 'request',
          }))
        }
        return Promise.resolve(detail({
          rsvpLocked: ++reads > 1,
          viewer: { canManage: true, isPlayer: false, isGuardian: false },
        }))
      })
      const screen = render(<EventDetailScreen />)
      fireEvent.press(await screen.findByTestId('event-remind-open'))
      await screen.findByText('eventFlow.availability.closed')
      expect(screen.queryByTestId('event-remind-open')).toBeNull()
      expect(alert).not.toHaveBeenCalled()
    } finally {
      alert.mockRestore()
    }
  })

  it('keeps a confirmed cooldown when an older event refresh finishes afterward', async () => {
    let finishRefresh!: (value: unknown) => void
    let reads = 0
    const value = detail({ viewer: { canManage: true, isPlayer: false, isGuardian: false } })
    const retryAfter = new Date(Date.now() + 3600000).toISOString()
    mockApi.mockImplementation((_path: string, init?: { method?: string }) => {
      if (init?.method === 'POST') return Promise.reject(new ApiError('cooldown', 429, 'RSVP_REMINDER_COOLDOWN', { error: { retryAfter } }))
      return ++reads === 1 ? Promise.resolve(value) : new Promise((resolve) => { finishRefresh = resolve })
    })
    const screen = render(<EventDetailScreen />)
    const button = await screen.findByTestId('event-remind-open')
    act(() => { void screen.UNSAFE_getAllByType(ScrollView)[0].props.refreshControl.props.onRefresh() })
    fireEvent.press(button)
    await screen.findByText('eventFlow.responses.remindCooldown')
    await act(async () => { finishRefresh(value) })
    expect(screen.getByTestId('event-remind-open')).toBeDisabled()
    expect(screen.getByText('eventFlow.responses.remindCooldown')).toBeTruthy()
  })

  it.each([
    ['generic rate limit', 'HTTP_429', { error: { retryAfterSeconds: 60 } }],
    ['malformed cooldown', 'RSVP_REMINDER_COOLDOWN', { error: { retryAfter: 'invalid' } }],
  ])('does not invent an event cooldown for %s', async (_label, code, data) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    try {
      mockApi.mockImplementation((_path: string, init?: { method?: string }) => init?.method === 'POST'
        ? Promise.reject(new ApiError('throttled', 429, code, data))
        : Promise.resolve(detail({ viewer: { canManage: true, isPlayer: false, isGuardian: false } })))
      const screen = render(<EventDetailScreen />)
      fireEvent.press(await screen.findByTestId('event-remind-open'))
      await waitFor(() => expect(alert).toHaveBeenCalledWith('eventFlow.responses.remindFailedTitle', 'eventFlow.responses.remindFailedBody'))
      expect(screen.getByTestId('event-remind-open')).not.toBeDisabled()
    } finally { alert.mockRestore() }
  })

  it('ignores a reminder completion from an earlier visit to the same event', async () => {
    let finish!: (value: unknown) => void
    mockApi.mockImplementation((_path: string, init?: { method?: string }) => init?.method === 'POST'
      ? new Promise((resolve) => { finish = resolve })
      : Promise.resolve(detail({ id: mockEventId, viewer: { canManage: true, isPlayer: false, isGuardian: false } })))
    const screen = render(<EventDetailScreen />)
    fireEvent.press(await screen.findByTestId('event-remind-open'))
    mockEventId = 'match-2'
    screen.rerender(<EventDetailScreen />)
    await waitFor(() => expect(screen.getByTestId('event-remind-open')).not.toBeDisabled())
    mockEventId = 'match-1'
    screen.rerender(<EventDetailScreen />)
    await waitFor(() => expect(screen.getByTestId('event-remind-open')).not.toBeDisabled())
    await act(async () => { finish({ sent: 9, nextAvailableAt: new Date(Date.now() + 86400000).toISOString() }) })
    expect(screen.getByTestId('event-remind-open')).not.toBeDisabled()
    expect(screen.queryByText('eventFlow.responses.remindSent')).toBeNull()
  })

  it('does not present an uncertain send as success or as safe to retry', async () => {
    mockApi.mockImplementation((_path: string, init?: { method?: string }) => init?.method === 'POST'
      ? Promise.resolve({ sent: 0, uncertain: 1, nextAvailableAt: new Date(Date.now() + 86400000).toISOString() })
      : Promise.resolve(detail({ viewer: { canManage: true, isPlayer: false, isGuardian: false } })))
    const screen = render(<EventDetailScreen />)
    fireEvent.press(await screen.findByTestId('event-remind-open'))
    await screen.findByText('eventFlow.responses.remindUnconfirmedHint')
    expect(screen.getByTestId('event-remind-open')).toBeDisabled()
    expect(screen.queryByText('eventFlow.responses.remindNoneAccepted')).toBeNull()
  })

  it('does not let an older refresh overwrite a confirmed policy save', async () => {
    let finishRefresh!: (value: unknown) => void
    let reads = 0
    const value = detail({ viewer: { canManage: true, isPlayer: true, isGuardian: false } })
    mockApi.mockImplementation((_path: string, init?: { method?: string }) => {
      if (init?.method === 'PATCH') return Promise.resolve({ deadline: null, locked: true })
      if (++reads === 1) return Promise.resolve(value)
      return new Promise((resolve) => { finishRefresh = resolve })
    })
    const screen = render(<EventDetailScreen />)
    await screen.findByTestId('event-availability-lock')
    act(() => { void screen.UNSAFE_getAllByType(ScrollView)[0].props.refreshControl.props.onRefresh() })
    fireEvent(screen.getByTestId('event-availability-lock'), 'valueChange', true)
    await screen.findByText('eventFlow.availability.closed')
    await act(async () => { finishRefresh(value) })
    expect(screen.getByText('eventFlow.availability.closed')).toBeTruthy()
    expect(screen.getByLabelText('eventFlow.rsvp.yes')).toBeDisabled()
  })

  it('rolls back a failed RSVP without discarding a newer saved policy', async () => {
    let rejectRsvp!: (reason: Error) => void
    const value = detail({ viewer: { canManage: true, isPlayer: true, isGuardian: false } })
    mockApi.mockImplementation((_path: string, init?: { method?: string }) => {
      if (init?.method === 'PATCH') return Promise.resolve({ deadline: null, locked: true })
      if (init?.method === 'PUT') return new Promise((_resolve, reject) => { rejectRsvp = reject })
      return Promise.resolve(value)
    })
    const screen = render(<EventDetailScreen />)
    fireEvent.press(await screen.findByLabelText('eventFlow.rsvp.yes'))
    await waitFor(() => expect(rejectRsvp).toBeDefined(), { timeout: 2000 })
    fireEvent(screen.getByTestId('event-availability-lock'), 'valueChange', true)
    await screen.findByText('eventFlow.availability.closed')
    await act(async () => { rejectRsvp(new Error('network')) })
    expect(screen.getByText('eventFlow.availability.closed')).toBeTruthy()
    expect(screen.getByLabelText('eventFlow.rsvp.yes')).toBeDisabled()
  })

  it.each([false, true])('ignores a policy save from an earlier visit (return to original=%s)', async (returnToOriginal) => {
    let finishPatch!: (value: unknown) => void
    let finishNext!: (value: unknown) => void
    mockApi.mockImplementation((path: string, init?: { method?: string }) => {
      if (init?.method === 'PATCH') return new Promise((resolve) => { finishPatch = resolve })
      if (path.endsWith('/match-2')) return new Promise((resolve) => { finishNext = resolve })
      return Promise.resolve(detail({ viewer: { canManage: true, isPlayer: true, isGuardian: false } }))
    })
    const screen = render(<EventDetailScreen />)
    fireEvent(await screen.findByTestId('event-availability-lock'), 'valueChange', true)
    mockEventId = 'match-2'
    screen.rerender(<EventDetailScreen />)
    await waitFor(() => expect(finishNext).toBeDefined())
    if (returnToOriginal) {
      mockEventId = 'match-1'
      screen.rerender(<EventDetailScreen />)
      await screen.findByTestId('event-availability-lock')
    }
    await act(async () => { finishPatch({ deadline: null, locked: true }) })
    await act(async () => { finishNext(detail({ id: 'match-2', title: 'Next event', opponent: 'Next team' })) })
    expect(await screen.findByText('eventFlow.availability.open')).toBeTruthy()
    expect(screen.getByLabelText('eventFlow.rsvp.yes')).not.toBeDisabled()
  })

  it('disables guardian replies after the deadline', async () => {
    mockApi.mockResolvedValue(detail({
      rsvpDeadline: new Date(Date.now() - 1).toISOString(),
      viewer: { canManage: false, isPlayer: false, isGuardian: true },
      children: [{ userId: 'kid-mia', name: 'Mia', teamName: 'U11', rsvp: null }],
    }))
    const screen = render(<EventDetailScreen />)
    await screen.findByText('eventFlow.availability.closed')
    expect(screen.getByLabelText('Mia: eventFlow.rsvp.maybe')).toBeDisabled()
    expect(screen.queryByTestId('event-availability-lock')).toBeNull()
  })

  it('does not ask the coach for their own reply and puts actions in the header menu', async () => {
    mockApi.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith('/events/match-1')
          ? detail({ viewer: { canManage: true, isPlayer: false, isGuardian: false } })
          : { eventId: 'match-1', publishedAt: null, nominatedUserIds: [], candidates: [] },
      ),
    )
    const screen = render(<EventDetailScreen />)

    expect(await screen.findByTestId('event-manage-menu')).toBeTruthy()
    expect(screen.queryByText('eventFlow.detail.yourAnswer')).toBeNull()
    // The coach sees the reason behind an Absage.
    expect(screen.getByText(/Knie zwickt/)).toBeTruthy()

    fireEvent.press(screen.getByTestId('event-manage-menu'))
    fireEvent.press(await screen.findByTestId('event-menu-edit'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/create-event', params: { eventId: 'match-1' } })
  })

  it('gives a parent one answer row per child and sends the childUserId', async () => {
    mockUser = { id: 'parent', name: 'Anna Weber' }
    mockApi.mockImplementation((path: string, init?: { method?: string }) => {
      if (init?.method === 'PUT') return Promise.resolve({})
      return Promise.resolve(
        detail({
          viewer: { canManage: false, isPlayer: false, isGuardian: true },
          children: [
            { userId: 'kid-mia', name: 'Mia Weber', teamName: 'U11', rsvp: null },
            { userId: 'kid-ben', name: 'Ben Weber', teamName: 'U11', rsvp: 'YES' },
          ],
        }),
      )
    })
    const screen = render(<EventDetailScreen />)

    expect(await screen.findByText('Mia · U11')).toBeTruthy()
    expect(screen.getByText('Ben · U11')).toBeTruthy()

    fireEvent.press(screen.getByLabelText('Mia: eventFlow.rsvp.maybe'))
    await waitFor(
      () =>
        expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/events/match-1/rsvp', {
          method: 'PUT',
          body: { status: 'MAYBE', childUserId: 'kid-mia' },
        }),
      { timeout: 2000 },
    )
  })

  it('links an imported fixture to the live screen instead of duplicating the match', async () => {
    mockApi.mockResolvedValue(detail({ fixtureId: 'fx-1' }))
    const screen = render(<EventDetailScreen />)
    fireEvent.press(await screen.findByTestId('event-open-match'))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/match-detail',
      params: { fixtureId: 'fx-1', teamId: 'team-1' },
    })
  })

  it('resolves a failed load to an error with retry', async () => {
    mockApi.mockRejectedValue(new Error('offline'))
    const screen = render(<EventDetailScreen />)
    expect(await screen.findByText('eventFlow.detail.loadError')).toBeTruthy()
  })

  describe('review fixes', () => {
    it('lets a Spielertrainer answer for himself and check in (H3)', async () => {
      const soon = new Date(Date.now() + 60 * 60000) // inside the check-in window
      mockApi.mockImplementation((path: string) =>
        Promise.resolve(
          path.endsWith('/events/match-1')
            ? detail({
                date: soon.toISOString(),
                meetingAt: null,
                myRsvp: 'YES',
                viewer: { canManage: true, isPlayer: true, isGuardian: false },
              })
            : { eventId: 'match-1', publishedAt: null, nominatedUserIds: [], candidates: [] },
        ),
      )
      const screen = render(<EventDetailScreen />)
      expect(await screen.findByTestId('event-manage-menu')).toBeTruthy()
      expect(screen.getByTestId('event-self-answer')).toBeTruthy()
      expect(screen.getByText('eventFlow.detail.yourAnswer')).toBeTruthy()
      expect(screen.getByTestId('event-check-in')).toBeTruthy()
    })

    it('gives a parent who also plays their own answer and the child block (H3)', async () => {
      mockUser = { id: 'parent', name: 'Anna Weber' }
      mockApi.mockResolvedValue(
        detail({
          viewer: { canManage: false, isPlayer: true, isGuardian: true },
          children: [{ userId: 'kid-mia', name: 'Mia Weber', teamName: 'U11', rsvp: null }],
        }),
      )
      const screen = render(<EventDetailScreen />)
      expect(await screen.findByTestId('event-self-answer')).toBeTruthy()
      expect(screen.getByTestId('event-child-answers')).toBeTruthy()
      expect(screen.getByText('Mia · U11')).toBeTruthy()
    })

    it('opens Fahrten only when the coach enabled them, not for every away match (L1)', async () => {
      mockApi.mockResolvedValue(detail({ carpoolEnabled: false, homeAway: 'AWAY' }))
      const screen = render(<EventDetailScreen />)
      expect(await screen.findByText('eventFlow.detail.tabSquad')).toBeTruthy()
      expect(screen.queryByText('eventFlow.detail.tabRides')).toBeNull()
    })

    it('Kader: preselects only candidates, names the drop-out and saves without the stale id (H1)', async () => {
      mockApi.mockImplementation((path: string, init?: { method?: string; body?: unknown }) => {
        if (path.endsWith('/squad') && init?.method === 'PUT') {
          return Promise.resolve({
            eventId: 'match-1',
            publishedAt: new Date().toISOString(),
            nominatedUserIds: ['lukas'],
            candidates: [{ userId: 'lukas', name: 'Lukas Hoffmann', rsvp: 'YES' }],
            dropouts: [],
          })
        }
        if (path.endsWith('/squad')) {
          return Promise.resolve({
            eventId: 'match-1',
            publishedAt: new Date().toISOString(),
            // A stale server answer that still lists Tim.
            nominatedUserIds: ['lukas', 'tim'],
            candidates: [{ userId: 'lukas', name: 'Lukas Hoffmann', rsvp: 'YES' }],
            dropouts: [
              { userId: 'tim', name: 'Tim Weber', cause: 'declined', reason: 'injured', at: null },
            ],
          })
        }
        return Promise.resolve(
          detail({
            squadPublishedAt: new Date().toISOString(),
            viewer: { canManage: true, isPlayer: false, isGuardian: false },
          }),
        )
      })
      const screen = render(<EventDetailScreen />)
      fireEvent.press(await screen.findByText('eventFlow.detail.tabSquad'))

      expect(
        await screen.findByText('eventFlow.squad.dropoutDeclinedReason:Tim Weber:eventFlow.reason.injured'),
      ).toBeTruthy()
      fireEvent.press(screen.getByTestId('squad-publish'))
      await waitFor(() =>
        expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/events/match-1/squad', {
          method: 'PUT',
          body: { userIds: ['lukas'], publish: true },
        }),
      )
    })
  })
})
