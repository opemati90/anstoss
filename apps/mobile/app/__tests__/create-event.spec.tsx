import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import CreateEventScreen from '../create-event'
import { api } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'

const mockApi = api as jest.Mock
const mockUseAuth = useAuth as jest.Mock
const mockRouterBack = jest.fn()
const mockSetActiveTeam = jest.fn()
let mockParams: Record<string, string> = {}

const labels: Record<string, string> = {
  'eventFlow.type.TRAINING': 'Training',
  'eventFlow.type.MATCH': 'Match',
  'eventFlow.type.OTHER': 'Other',
  'eventFlow.home': 'Home',
  'eventFlow.away': 'Away',
  'eventFlow.cancelAction': 'Cancel',
  'eventFlow.create.newTitle': 'New event',
  'eventFlow.create.editTitle': 'Edit event',
  'eventFlow.create.opponent': 'Opponent',
  'eventFlow.create.repeat': 'Repeat',
  'eventFlow.create.repeatOnce': 'Once',
  'eventFlow.create.repeatWeekly': 'Weekly',
  'eventFlow.create.repeatBiweekly': 'Every two weeks',
  'eventFlow.create.create': 'Add event',
  'eventFlow.create.save': 'Save',
  'eventFlow.create.team': 'Team',
  'eventFlow.create.noTeamTitle': 'No team yet',
  'eventFlow.create.noTeamBody': 'Create a team first.',
  'eventFlow.scope.this': 'This event only',
  'eventFlow.scope.following': 'This and all following',
  'eventFlow.detail.meeting': 'Meet',
}

const mockT = (key: string, options?: Record<string, unknown>) => {
  if (key === 'eventFlow.create.createSeries') return `Add ${options?.count} events`
  if (key === 'eventFlow.create.meetingValue') return `${options?.time} · ${options?.count} min before`
  return labels[key] ?? key
}

jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockRouterBack(...args) },
  useLocalSearchParams: () => mockParams,
}))
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }))
jest.mock('../../src/context/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return { useClubColors: () => ({ ...FALLBACK_THEME, primary: '#1E3A5F' }), useIsDark: () => false }
})
jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
  ApiError: class ApiError extends Error {
    status = 500
  },
}))
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null }))
jest.mock('../../src/i18n', () => ({ getAppLanguage: () => 'en', getAppLocale: () => 'en-GB' }))
jest.mock('../../src/utils/haptics', () => {
  const noop = () => undefined
  const Haptics = { select: noop, tap: noop, success: noop, fail: noop }
  return { Haptics, default: Haptics }
})

function teamGroups(teams = [{ id: 'team-1', displayName: 'Herren I', squadLabel: null }]) {
  return [{ id: 'g1', displayName: 'Herren', teams }]
}

describe('CreateEventScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockParams = {}
    mockUseAuth.mockReturnValue({
      activeClub: { role: 'COACH', permissions: { EVENTS: true }, club: { id: 'club-1', name: 'SV Albatros' } },
      activeTeamAccess: { role: 'HEAD_COACH', team: { displayName: 'Herren I' } },
      activeTeamId: 'team-1',
      setActiveTeam: mockSetActiveTeam,
    })
  })

  it('opens as a weekly training with a season plan and one sticky CTA', async () => {
    mockApi.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith('/team-groups') ? teamGroups() : []),
    )
    const screen = render(<CreateEventScreen />)

    expect(await screen.findByText('New event')).toBeTruthy()
    expect(screen.getByLabelText('Repeat: Weekly')).toBeTruthy()
    expect(screen.getByText(/^Add \d+ events$/)).toBeTruthy()
    // Cancel lives in the modal header.
    expect(screen.getByLabelText('Cancel')).toBeTruthy()
  })

  it('prefills the training days, time and place from the latest training series', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path.endsWith('/team-groups')) return Promise.resolve(teamGroups())
      if (path.includes('type=TRAINING&scope=upcoming')) {
        return Promise.resolve([
          {
            id: 'tr-1',
            type: 'TRAINING',
            title: 'Training',
            date: new Date(2030, 0, 8, 18, 30).toISOString(),
            location: 'Sportplatz Am Wald',
            durationMin: 105,
            seriesId: 'series-1',
          },
        ])
      }
      if (path.endsWith('/events/tr-1')) {
        return Promise.resolve({ id: 'tr-1', series: { id: 'series-1', intervalWeeks: 1, until: '2030-06-30', weekdays: [2, 4] } })
      }
      return Promise.resolve([])
    })
    const screen = render(<CreateEventScreen />)

    await waitFor(() => {
      expect(screen.getByTestId('event-weekday-2').props.accessibilityState).toEqual({ checked: true })
      expect(screen.getByTestId('event-weekday-4').props.accessibilityState).toEqual({ checked: true })
    })
    expect(screen.getByTestId('event-weekday-1').props.accessibilityState).toEqual({ checked: false })
    expect(screen.getByDisplayValue('Sportplatz Am Wald')).toBeTruthy()
  })

  it('creates a Di + Do series with the weekdays in the repeat rule', async () => {
    mockApi.mockImplementation((path: string, init?: { method?: string }) => {
      if (init?.method === 'POST') return Promise.resolve({})
      return Promise.resolve(path.endsWith('/team-groups') ? teamGroups() : [])
    })
    const screen = render(<CreateEventScreen />)
    await screen.findByText('New event')

    // Start from a clean selection, then pick Di + Do.
    for (const day of [0, 1, 2, 3, 4, 5, 6]) {
      const chip = screen.getByTestId(`event-weekday-${day}`)
      if (chip.props.accessibilityState?.checked) fireEvent.press(chip)
    }
    fireEvent.press(screen.getByTestId('event-weekday-2'))
    fireEvent.press(screen.getByTestId('event-weekday-4'))
    fireEvent.press(screen.getByTestId('event-create-submit'))

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        '/clubs/club-1/events/series',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            type: 'TRAINING',
            durationMin: 90,
            repeat: expect.objectContaining({ intervalWeeks: 1, weekdays: [2, 4] }),
          }),
        }),
      ),
    )
    // L7: no typed title, so none is sent; every reader sees "Training" in
    // their own language.
    const seriesCall = mockApi.mock.calls.find(([path]) => path === '/clubs/club-1/events/series')
    expect(seriesCall![1].body).not.toHaveProperty('title')
    expect(mockRouterBack).toHaveBeenCalled()
  })

  it('builds an away match with opponent, 60 min Treffpunkt and carpool on', async () => {
    mockApi.mockImplementation((path: string, init?: { method?: string }) => {
      if (init?.method === 'POST') return Promise.resolve({})
      return Promise.resolve(path.endsWith('/team-groups') ? teamGroups() : [])
    })
    const screen = render(<CreateEventScreen />)
    await screen.findByText('New event')

    fireEvent.press(screen.getByTestId('event-type-MATCH'))
    fireEvent.changeText(screen.getByTestId('event-opponent-input'), 'SV Babelsberg 03')
    fireEvent.press(screen.getByTestId('event-away'))

    expect(screen.getByText(/60 min before/)).toBeTruthy()
    expect(screen.getByTestId('event-carpool-switch').props.value).toBe(true)

    fireEvent.press(screen.getByTestId('event-create-submit'))
    await waitFor(() => {
      const call = mockApi.mock.calls.find(([path]) => path === '/clubs/club-1/events')
      expect(call).toBeTruthy()
      const body = call![1].body
      // M6: the opponent only; no "@ X" title is stored.
      expect(body).not.toHaveProperty('title')
      expect(body).toMatchObject({
        type: 'MATCH',
        opponent: 'SV Babelsberg 03',
        homeAway: 'AWAY',
        carpoolEnabled: true,
      })
      const lead = (new Date(body.date).getTime() - new Date(body.meetingAt).getTime()) / 60000
      expect(lead).toBe(60)
      // Default kickoff is a Sunday at 15:00, never "now + 60 min".
      expect(new Date(body.date).getDay()).toBe(0)
      expect(new Date(body.date).getHours()).toBe(15)
    })
  })

  it('asks for the series scope before saving, not in an alert afterwards', async () => {
    mockParams = { eventId: 'ev-9' }
    mockApi.mockImplementation((path: string, init?: { method?: string }) => {
      if (init?.method === 'PATCH') return Promise.resolve({})
      if (path.endsWith('/team-groups')) return Promise.resolve(teamGroups())
      if (path.endsWith('/events/ev-9')) {
        return Promise.resolve({
          id: 'ev-9',
          teamId: 'team-1',
          title: 'Training',
          type: 'TRAINING',
          date: new Date(Date.now() + 3 * 86400000).toISOString(),
          location: 'Sportplatz Am Wald',
          notes: null,
          seriesId: 'series-1',
          durationMin: 90,
        })
      }
      return Promise.resolve([])
    })
    const screen = render(<CreateEventScreen />)

    fireEvent.press(await screen.findByTestId('event-scope-following'))
    fireEvent.press(screen.getByTestId('event-create-submit'))

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        '/clubs/club-1/events/ev-9',
        expect.objectContaining({ method: 'PATCH', body: expect.objectContaining({ scope: 'following' }) }),
      ),
    )
  })

  it('edits a past match: clears the place and notes, never re-sends the old date (L6)', async () => {
    mockParams = { eventId: 'ev-past' }
    mockApi.mockImplementation((path: string, init?: { method?: string }) => {
      if (init?.method === 'PATCH') return Promise.resolve({})
      if (path.endsWith('/team-groups')) return Promise.resolve(teamGroups())
      if (path.endsWith('/events/ev-past')) {
        return Promise.resolve({
          id: 'ev-past',
          teamId: 'team-1',
          title: 'SV Babelsberg 03',
          autoTitle: true,
          type: 'MATCH',
          opponent: 'SV Babelsberg 03',
          homeAway: 'AWAY',
          date: new Date(Date.now() - 2 * 86400000).toISOString(),
          location: 'Sportplatz Babelsberg',
          notes: 'Alt',
          seriesId: null,
        })
      }
      return Promise.resolve([])
    })
    const screen = render(<CreateEventScreen />)
    await screen.findByDisplayValue('Sportplatz Babelsberg')
    fireEvent.changeText(screen.getByDisplayValue('Sportplatz Babelsberg'), '')
    fireEvent.changeText(screen.getByDisplayValue('Alt'), '')
    fireEvent.press(screen.getByTestId('event-create-submit'))

    await waitFor(() => {
      const call = mockApi.mock.calls.find(([path, init]) => path === '/clubs/club-1/events/ev-past' && init?.method === 'PATCH')
      expect(call).toBeTruthy()
      const body = call![1].body
      expect(body).toMatchObject({ location: null, notes: null, title: null, opponent: 'SV Babelsberg 03' })
      expect(body).not.toHaveProperty('date')
    })
  })

  it('caps a training plan at four days a week (M4)', async () => {
    mockApi.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith('/team-groups') ? teamGroups() : []),
    )
    const screen = render(<CreateEventScreen />)
    await screen.findByText('New event')
    for (const day of [1, 2, 3, 4, 5, 6, 0]) {
      const chip = screen.getByTestId(`event-weekday-${day}`)
      if (!chip.props.accessibilityState?.checked) fireEvent.press(chip)
    }
    const checked = [1, 2, 3, 4, 5, 6, 0].filter(
      (day) => screen.getByTestId(`event-weekday-${day}`).props.accessibilityState?.checked,
    )
    expect(checked).toHaveLength(4)
    expect(screen.getByTestId('event-days-capped')).toBeTruthy()
  })

  it('shows an empty state when the club has no teams', async () => {
    mockApi.mockResolvedValue([])
    const screen = render(<CreateEventScreen />)
    expect(await screen.findByText('No team yet')).toBeTruthy()
    expect(screen.getByText('Create a team first.')).toBeTruthy()
  })
})
