import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import EventDetailScreen from '../event-detail'
import { api } from '../../src/api/client'

const mockPush = jest.fn()
const mockApi = api as jest.Mock
let mockUser = { id: 'user-player', name: 'Tim Weber' }

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useLocalSearchParams: () => ({ eventId: 'match-1' }),
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
    status = 500
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
    children: [],
    viewer: { canManage: false, isPlayer: true, isGuardian: false },
    ...overrides,
  }
}

describe('EventDetailScreen', () => {
  beforeEach(() => {
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

  it('opens the coach-recorded live screen for a match without a fussball.de link', async () => {
    mockApi.mockResolvedValue(detail())
    const screen = render(<EventDetailScreen />)
    fireEvent.press(await screen.findByTestId('event-open-match'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/match-live', params: { eventId: 'match-1' } })
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
