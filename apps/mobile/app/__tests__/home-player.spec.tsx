import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { PlayerHome } from '../../src/components/home/PlayerHome'

const mockApi = jest.fn()
const TEST_NOW_MS = Date.UTC(2026, 5, 20, 12, 0, 0)

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('react-i18next', () => {
  const t = (k: string, opts?: { defaultValue?: string } & Record<string, unknown>) => {
    if (opts && typeof opts === 'object' && typeof opts.defaultValue === 'string') {
      return opts.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name) => {
        const v = (opts as Record<string, unknown>)[name]
        return v == null ? '' : String(v)
      })
    }
    return k
  }
  return { useTranslation: () => ({ t }) }
})

jest.mock('../../src/i18n', () => ({
  getAppLanguage: () => 'en',
  getAppLocale: () => 'en-GB',
}))

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  // Faithful stand-in: the real useFocusEffect runs its callback on mount.
  // A bare jest.fn() silently skips every focus-driven fetch.
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
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

jest.mock('../../src/api/client', () => ({
  api: (...a: unknown[]) => mockApi(...a),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Julian Becker' },
    activeClub: { club: { id: 'club-1', name: 'SV Albatros' }, role: 'PLAYER' },
    activeTeamAccess: {
      team: { id: 'team-1', displayName: 'Senior Team' },
      role: 'PLAYER',
    },
    activeTeamId: 'team-1',
  }),
}))

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider
    initialMetrics={{
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
      frame: { x: 0, y: 0, width: 375, height: 812 },
    }}
  >
    {ui}
  </SafeAreaProvider>
)

function fixture(overrides: Record<string, unknown> = {}) {
  const kickoffAt = String(overrides.kickoffAt ?? new Date(Date.now()).toISOString())
  return {
    id: 'fixture-1',
    clubId: 'club-1',
    teamId: 'team-1',
    teamLinkId: 'link-1',
    provider: 'fussball_public_page',
    externalMatchId: 'external-1',
    competition: 'League',
    season: null,
    kickoffAt,
    status: 'scheduled',
    homeTeam: 'Home',
    awayTeam: 'Away',
    homeLogo: null,
    awayLogo: null,
    venueName: null,
    pitchAddress: null,
    resultHome: null,
    resultAway: null,
    tableSnapshot: null,
    sourceConfidence: 'unofficial_public',
    rawPayload: {},
    lastSeenAt: kickoffAt,
    createdAt: kickoffAt,
    updatedAt: kickoffAt,
    overlay: null,
    eventId: null,
    ...overrides,
  }
}

describe('PlayerHome', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(TEST_NOW_MS)
    const { router } = require('expo-router')
    router.push.mockReset()
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/events?') && path.includes('scope=upcoming')) {
        return Promise.resolve([
          {
            id: 'e1',
            type: 'TRAINING',
            title: 'Monday training',
            date: new Date(Date.now() + 2 * 86400000).toISOString(),
            myRsvp: null,
            yesCount: 0,
            maybeCount: 0,
            noCount: 0,
          },
        ])
      }
      if (path.includes('/fixtures')) {
        return Promise.resolve([])
      }
      if (path.includes('/channels')) {
        return Promise.resolve([])
      }
      if (path.includes('/announcements')) {
        return Promise.resolve([{ id: 'an1', title: 'Club BBQ', body: 'Saturday' }])
      }
      return Promise.resolve(null)
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders the next-event RSVP hero', async () => {
    const { findByText, getByLabelText } = render(
      wrap(<PlayerHome clubId="club-1" teamId="team-1" />),
    )
    expect(await findByText('Monday training')).toBeTruthy()
    expect(getByLabelText('Your reply')).toBeTruthy()
    expect(await findByText('eventFlow.rsvp.yes')).toBeTruthy()
    expect(await findByText('eventFlow.rsvp.maybe')).toBeTruthy()
    expect(await findByText('eventFlow.rsvp.no')).toBeTruthy()
  })

  it('RSVP Yes fires an API PUT', async () => {
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    const yes = await findByText('eventFlow.rsvp.yes')
    fireEvent.press(yes)
    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        expect.stringMatching(/\/events\/e1\/rsvp$/),
        expect.objectContaining({ method: 'PUT', body: { status: 'YES' } }),
      )
    })
  })

  // Chat preview was removed from PlayerHome — feature lives in tabs/chat now.
  it.skip('renders chat preview', async () => {
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    expect(await findByText(/See you tomorrow/)).toBeTruthy()
  })

  it('excludes later cancelled events from the outstanding-reply summary', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/events?') && path.includes('scope=upcoming')) {
        return Promise.resolve([
          {
            id: 'e-live',
            type: 'TRAINING',
            title: 'Monday training',
            date: new Date(Date.now() + 86400000).toISOString(),
            myRsvp: 'YES',
            yesCount: 8,
            maybeCount: 0,
            noCount: 0,
          },
          {
            id: 'e-cancelled',
            type: 'TRAINING',
            title: 'Wednesday training',
            date: new Date(Date.now() + 3 * 86400000).toISOString(),
            myRsvp: null,
            yesCount: 0,
            maybeCount: 0,
            noCount: 0,
            cancelledAt: new Date().toISOString(),
            cancelReason: 'Pitch frozen',
          },
        ])
      }
      if (path.includes('/fixtures')) return Promise.resolve([])
      if (path.includes('/channels')) return Promise.resolve([])
      if (path.includes('/announcements')) return Promise.resolve([])
      return Promise.resolve(null)
    })
    const { findByText, queryByText, queryAllByText } = render(
      wrap(<PlayerHome clubId="club-1" teamId="team-1" />),
    )

    expect(await findByText('Monday training')).toBeTruthy()
    expect(queryByText('Wednesday training')).toBeNull()
    expect(queryByText('Events waiting for you')).toBeNull()
    expect(queryAllByText('eventFlow.rsvp.maybe')).toHaveLength(1)
  })

  it('renders announcement titles', async () => {
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    expect(await findByText('Club BBQ')).toBeTruthy()
  })

  it('shows cancellation and its reason when the cancelled event is next, without RSVP controls', async () => {
    mockApi.mockImplementation(async (path: string) =>
      path.includes('/events?')
        ? [
            {
              id: 'cancelled',
              type: 'TRAINING',
              title: 'Cancelled training',
              date: new Date(TEST_NOW_MS + 86400000).toISOString(),
              cancelledAt: new Date(TEST_NOW_MS).toISOString(),
              cancelReason: 'Pitch frozen',
              myRsvp: null,
              yesCount: 0,
              maybeCount: 0,
              noCount: 0,
            },
          ]
        : [],
    )
    const view = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    expect(await view.findByText('Cancelled · Pitch frozen')).toBeTruthy()
    expect(view.getByText('Cancelled training')).toHaveStyle({ textDecorationLine: 'line-through' })
    expect(view.queryAllByRole('radio')).toHaveLength(0)
  })

  it('requires reconfirmation after rescheduling even inside the check-in window', async () => {
    mockApi.mockImplementation(async (path: string) =>
      path.includes('/events?')
        ? [
            {
              id: 'rescheduled',
              type: 'TRAINING',
              title: 'Moved training',
              date: new Date(TEST_NOW_MS + 30 * 60000).toISOString(),
              myRsvp: 'YES',
              myRsvpStale: true,
              yesCount: 0,
              maybeCount: 0,
              noCount: 0,
            },
          ]
        : [],
    )
    const view = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    expect(await view.findByText('Time changed · confirm your reply')).toBeTruthy()
    expect(view.queryByText('Open check-in')).toBeNull()
    fireEvent.press(view.getByTestId('home-hero-rsvp-YES'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        '/clubs/club-1/events/rescheduled/rsvp',
        expect.objectContaining({ method: 'PUT', body: { status: 'YES' } }),
      ),
    )
  })

  it('opens event detail from the check-in action window', async () => {
    const startsSoon = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/events?') && path.includes('scope=upcoming')) {
        return Promise.resolve([
          {
            id: 'e-checkin',
            type: 'TRAINING',
            title: 'Pitch arrival',
            date: startsSoon,
            myRsvp: 'YES',
            yesCount: 8,
            maybeCount: 1,
            noCount: 0,
          },
        ])
      }
      if (path.includes('/fixtures')) return Promise.resolve([])
      if (path.includes('/channels')) return Promise.resolve([])
      if (path.includes('/announcements')) return Promise.resolve([])
      return Promise.resolve(null)
    })
    const { router } = require('expo-router')
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))

    fireEvent.press(await findByText('Open check-in'))

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/event-detail',
      params: { eventId: 'e-checkin' },
    })
  })

  it('keeps unanswered players focused on RSVP during the check-in window', async () => {
    const startsSoon = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/events?') && path.includes('scope=upcoming')) {
        return Promise.resolve([
          {
            id: 'e-rsvp',
            type: 'TRAINING',
            title: 'Pitch arrival',
            date: startsSoon,
            myRsvp: null,
            yesCount: 8,
            maybeCount: 1,
            noCount: 0,
          },
        ])
      }
      if (path.includes('/fixtures')) return Promise.resolve([])
      if (path.includes('/channels')) return Promise.resolve([])
      if (path.includes('/announcements')) return Promise.resolve([])
      return Promise.resolve(null)
    })
    const { findByText, getByLabelText, queryByText } = render(
      wrap(<PlayerHome clubId="club-1" teamId="team-1" />),
    )

    expect(await findByText('Pitch arrival')).toBeTruthy()
    expect(getByLabelText('Your reply')).toBeTruthy()
    expect(queryByText('Open check-in')).toBeNull()
  })

  it('keeps unanswered players focused on RSVP for a linked live match', async () => {
    const kickoffAt = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/events?') && path.includes('scope=upcoming')) {
        return Promise.resolve([
          {
            id: 'm-rsvp-live',
            type: 'MATCH',
            title: 'Live match',
            date: kickoffAt,
            myRsvp: null,
            yesCount: 8,
            maybeCount: 1,
            noCount: 0,
            team: { id: 'team-1', name: 'Senior Team' },
          },
        ])
      }
      if (path.includes('/fixtures')) {
        return Promise.resolve([
          fixture({
            id: 'fixture-rsvp-live',
            eventId: 'm-rsvp-live',
            kickoffAt,
            status: 'live',
            homeTeam: 'SV Albatros',
            awayTeam: 'FC Nord',
            resultHome: 1,
            resultAway: 0,
          }),
        ])
      }
      if (path.includes('/channels')) return Promise.resolve([])
      if (path.includes('/announcements')) return Promise.resolve([])
      return Promise.resolve(null)
    })
    const { findByText, getByLabelText, queryByText } = render(
      wrap(<PlayerHome clubId="club-1" teamId="team-1" />),
    )

    expect(await findByText('Live match')).toBeTruthy()
    expect(getByLabelText('Your reply')).toBeTruthy()
    expect(await findByText('SV Albatros 1:0 FC Nord')).toBeTruthy()
    expect(queryByText('Open live match')).toBeNull()
  })

  it('keeps confirmed players focused on check-in for a linked live match', async () => {
    const kickoffAt = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/events?') && path.includes('scope=upcoming')) {
        return Promise.resolve([
          {
            id: 'm-checkin-live',
            type: 'MATCH',
            title: 'Live match',
            date: kickoffAt,
            myRsvp: 'YES',
            yesCount: 11,
            maybeCount: 0,
            noCount: 0,
            team: { id: 'team-1', name: 'Senior Team' },
          },
        ])
      }
      if (path.includes('/fixtures')) {
        return Promise.resolve([
          fixture({
            id: 'fixture-checkin-live',
            eventId: 'm-checkin-live',
            kickoffAt,
            status: 'live',
            homeTeam: 'SV Albatros',
            awayTeam: 'FC Nord',
            resultHome: 2,
            resultAway: 1,
          }),
        ])
      }
      if (path.includes('/channels')) return Promise.resolve([])
      if (path.includes('/announcements')) return Promise.resolve([])
      return Promise.resolve(null)
    })
    const { findByText, queryByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))

    expect(await findByText('Open check-in')).toBeTruthy()
    expect(await findByText('SV Albatros 2:1 FC Nord')).toBeTruthy()
    expect(queryByText('Open live match')).toBeNull()
  })

  it('shows a live fixture even after kickoff has moved into recent fixtures', async () => {
    const kickoffAt = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/events?') && path.includes('scope=upcoming')) {
        return Promise.resolve([
          {
            id: 'm-live',
            type: 'MATCH',
            title: 'Live match',
            date: kickoffAt,
            myRsvp: 'YES',
            yesCount: 11,
            maybeCount: 0,
            noCount: 0,
            team: { id: 'team-1', name: 'Senior Team' },
          },
        ])
      }
      if (path.includes('/fixtures') && path.includes('scope=recent')) {
        return Promise.resolve([
          fixture({
            id: 'fixture-live',
            eventId: 'm-live',
            kickoffAt,
            status: 'live',
            homeTeam: 'SV Albatros',
            awayTeam: 'FC Nord',
            resultHome: 1,
            resultAway: 0,
          }),
        ])
      }
      if (path.includes('/fixtures')) return Promise.resolve([])
      if (path.includes('/channels')) return Promise.resolve([])
      if (path.includes('/announcements')) return Promise.resolve([])
      return Promise.resolve(null)
    })
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))

    expect(await findByText('SV Albatros 1:0 FC Nord')).toBeTruthy()
  })

  it('collapses an answered live event into one compact match action', async () => {
    const eventDate = new Date(Date.now() + 3 * 86400000).toISOString()
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/events?') && path.includes('scope=upcoming')) {
        return Promise.resolve([
          {
            id: 'm-live-hero',
            type: 'MATCH',
            title: 'vs FC Nord',
            date: eventDate,
            myRsvp: 'YES',
            yesCount: 11,
            maybeCount: 0,
            noCount: 0,
            team: { id: 'team-1', name: 'Senior Team' },
          },
        ])
      }
      if (path.includes('/fixtures')) {
        return Promise.resolve([
          fixture({
            id: 'fixture-live-hero',
            eventId: 'm-live-hero',
            kickoffAt: eventDate,
            status: 'live',
            homeTeam: 'SV Albatros',
            awayTeam: 'FC Nord',
            resultHome: 2,
            resultAway: 1,
          }),
        ])
      }
      if (path.includes('/channels')) return Promise.resolve([])
      if (path.includes('/announcements')) return Promise.resolve([])
      return Promise.resolve(null)
    })

    const { findByText, queryByText, queryAllByText } = render(
      wrap(<PlayerHome clubId="club-1" teamId="team-1" />),
    )

    const live = await findByText('SV Albatros 2:1 FC Nord')
    fireEvent.press(live)
    const { router } = require('expo-router')
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/match-detail',
      params: { fixtureId: 'fixture-live-hero', teamId: 'team-1' },
    })
    expect(queryByText('Match is live')).toBeNull()
    expect(queryAllByText(/FC Nord/)).toHaveLength(1)
  })

  it('keeps unrelated team events visible and prefers the next linked live fixture', async () => {
    const teamALiveAt = new Date(Date.now() + 60 * 1000).toISOString()
    const teamBLiveAt = new Date(Date.now() + 2 * 60 * 1000).toISOString()
    const trainingAt = new Date(Date.now() + 86400000).toISOString()
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/events?') && path.includes('scope=upcoming')) {
        return Promise.resolve([
          {
            id: 'team-a-live-event',
            type: 'MATCH',
            title: 'Team A live event',
            date: teamALiveAt,
            myRsvp: 'YES',
            yesCount: 11,
            maybeCount: 0,
            noCount: 0,
            team: { id: 'team-a', name: 'Team A' },
          },
          {
            id: 'team-b-live-event',
            type: 'MATCH',
            title: 'Team B live event',
            date: teamBLiveAt,
            myRsvp: 'YES',
            yesCount: 10,
            maybeCount: 1,
            noCount: 0,
            team: { id: 'team-b', name: 'Team B' },
          },
          {
            id: 'team-c-training',
            type: 'TRAINING',
            title: 'Team C training',
            date: trainingAt,
            myRsvp: null,
            yesCount: 0,
            maybeCount: 0,
            noCount: 0,
            team: { id: 'team-c', name: 'Team C' },
          },
        ])
      }
      if (path.includes('/fixtures')) {
        // Deliberately return Team B first. The event ordering should make the
        // linked Team A fixture own the live hero.
        return Promise.resolve([
          fixture({
            id: 'fixture-team-b',
            teamId: 'team-b',
            eventId: 'team-b-live-event',
            kickoffAt: teamBLiveAt,
            status: 'live',
            homeTeam: 'Team B',
            awayTeam: 'B United',
          }),
          fixture({
            id: 'fixture-team-a',
            teamId: 'team-a',
            eventId: 'team-a-live-event',
            kickoffAt: teamALiveAt,
            status: 'live',
            homeTeam: 'Team A',
            awayTeam: 'A United',
          }),
        ])
      }
      if (path.includes('/channels')) return Promise.resolve([])
      if (path.includes('/announcements')) return Promise.resolve([])
      return Promise.resolve(null)
    })

    const { findByLabelText, findByText, queryAllByText } = render(
      wrap(<PlayerHome clubId="club-1" teamId="team-1" />),
    )

    expect(await findByLabelText(/Team A vs A United, live/)).toBeTruthy()
    // The live match is represented once: the score card plus the decision
    // card for it. It must never also appear as a row in the week list.
    expect(queryAllByText('Team A live event')).toHaveLength(1)
    // Other teams remain reachable through the redesigned agenda summary.
    fireEvent.press(await findByText('Events waiting for you'))
    const { router } = require('expo-router')
    expect(router.push).toHaveBeenCalledWith('/(tabs)/events')
  })

  it('shows a live fixture when the kickoff event has aged out of upcoming events', async () => {
    const kickoffAt = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/events?') && path.includes('scope=upcoming')) {
        return Promise.resolve([])
      }
      if (path.includes('/teams/team-1/fixtures') && path.includes('scope=recent')) {
        return Promise.resolve([
          fixture({
            id: 'fixture-live',
            kickoffAt,
            status: 'live',
            homeTeam: 'SV Albatros',
            awayTeam: 'FC Nord',
            resultHome: 2,
            resultAway: 1,
          }),
        ])
      }
      if (path.includes('/fixtures')) return Promise.resolve([])
      if (path.includes('/channels')) return Promise.resolve([])
      if (path.includes('/announcements')) return Promise.resolve([])
      return Promise.resolve(null)
    })

    const { findByText, queryByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))

    expect(await findByText('SV Albatros 2:1 FC Nord')).toBeTruthy()
    expect(
      queryByText(
        'Your upcoming matches will appear here. Ask your coach to schedule your first event.',
      ),
    ).toBeNull()
  })

  it('routes a linked match hero to match detail', async () => {
    const kickoffAt = new Date(Date.now() + 3 * 86400000).toISOString()
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/events?') && path.includes('scope=upcoming')) {
        return Promise.resolve([
          {
            id: 'm1',
            type: 'MATCH',
            title: 'vs FC Nord',
            date: kickoffAt,
            myRsvp: 'YES',
            yesCount: 11,
            maybeCount: 1,
            noCount: 1,
            team: { id: 'team-1', name: 'Senior Team' },
          },
        ])
      }
      if (path.includes('/fixtures')) {
        return Promise.resolve([
          fixture({
            kickoffAt,
            eventId: 'm1',
          }),
        ])
      }
      if (path.includes('/channels')) return Promise.resolve([])
      if (path.includes('/announcements')) return Promise.resolve([])
      return Promise.resolve(null)
    })
    const { router } = require('expo-router')
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))

    fireEvent.press(await findByText('vs FC Nord'))

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/match-detail',
      params: { fixtureId: 'fixture-1', teamId: 'team-1' },
    })
  })

  it('routes the answered multi-team summary to the full events list', async () => {
    const kickoffAt = new Date(Date.now() + 2 * 86400000).toISOString()
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/events?') && path.includes('scope=upcoming')) {
        return Promise.resolve([
          {
            id: 'e1',
            type: 'TRAINING',
            title: 'Team A training',
            date: new Date(Date.now() + 86400000).toISOString(),
            myRsvp: 'YES',
            yesCount: 8,
            maybeCount: 1,
            noCount: 0,
            team: { id: 'team-1', name: 'Team A' },
          },
          {
            id: 'm2',
            type: 'MATCH',
            title: 'Team B Cup',
            date: kickoffAt,
            myRsvp: 'YES',
            yesCount: 11,
            maybeCount: 0,
            noCount: 0,
            team: { id: 'team-2', name: 'Team B' },
          },
        ])
      }
      if (path.includes('/teams/team-2/fixtures')) {
        return Promise.resolve([
          fixture({
            id: 'fixture-team-2',
            teamId: 'team-2',
            eventId: 'm2',
            kickoffAt,
          }),
        ])
      }
      if (path.includes('/fixtures')) return Promise.resolve([])
      if (path.includes('/channels')) return Promise.resolve([])
      if (path.includes('/announcements')) return Promise.resolve([])
      return Promise.resolve(null)
    })
    const { router } = require('expo-router')
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))

    fireEvent.press(await findByText('All answered'))

    expect(router.push).toHaveBeenCalledWith('/(tabs)/events')
  })

  describe('matchday logistics, jobs and fees', () => {
    const kickoff = new Date(Date.now() + 3 * 86400000)
    kickoff.setHours(15, 0, 0, 0)
    const meet = new Date(kickoff.getTime() - 90 * 60000)

    function mockMatchday(overrides: { dues?: unknown; duties?: unknown[] } = {}) {
      mockApi.mockImplementation((path: string) => {
        if (path.includes('/events?') && path.includes('scope=upcoming')) {
          return Promise.resolve([
            {
              id: 'm1',
              type: 'MATCH',
              title: '@ SV Babelsberg 03',
              opponent: 'SV Babelsberg 03',
              homeAway: 'AWAY',
              date: kickoff.toISOString(),
              meetingAt: meet.toISOString(),
              meetingPoint: 'Vereinsheim',
              location: 'Karl-Liebknecht-Stadion',
              myRsvp: 'YES',
              yesCount: 14,
              maybeCount: 1,
              noCount: 2,
            },
          ])
        }
        if (path.includes('/roster-ops')) {
          return Promise.resolve({
            team: { id: 'team-1', displayName: 'Senior Team', squadTarget: 18 },
            squadCount: 20,
            squad: [],
            operations: { trials: [], newPlayers: [], inactive: [], pendingCoaches: [] },
            medic: { active: [], recentlyCleared: [] },
            kit: {
              pending: overrides.duties ?? [
                {
                  id: 'd1',
                  assignedUserId: 'u1',
                  kind: 'JERSEY_CLEANUP',
                  status: 'PENDING',
                  dueDate: kickoff.toISOString(),
                  notes: null,
                },
                {
                  id: 'd2',
                  assignedUserId: 'someone-else',
                  kind: 'BIB_CLEANUP',
                  status: 'PENDING',
                  dueDate: kickoff.toISOString(),
                  notes: null,
                },
              ],
              recent: [],
            },
          })
        }
        if (path.includes('/contributions/my')) {
          return Promise.resolve(
            overrides.dues ?? {
              hasContributions: true,
              bankTransfer: null,
              items: [
                {
                  planId: 'p1',
                  planName: 'Trikotumlage',
                  amount: 4500,
                  currency: 'EUR',
                  cadence: 'YEARLY',
                  dueDate: new Date(Date.now() - 86400000).toISOString(),
                  status: 'OVERDUE',
                  paidAmount: null,
                  paidAt: null,
                  paymentReported: false,
                },
              ],
            },
          )
        }
        if (path.includes('/fixtures')) return Promise.resolve([])
        if (path.includes('/channels')) return Promise.resolve([])
        if (path.includes('/announcements')) return Promise.resolve([])
        return Promise.resolve(null)
      })
    }

    it('leads the hero with the opponent, Away, kick-off and meeting time and place', async () => {
      mockMatchday()
      const { findByText, getByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
      // Redesign screen 22: "Next up · Match · Away", "Sa 15:00", "vs <opponent>",
      // "Meet 13:30 · <place>".
      expect(await findByText('vs SV Babelsberg 03')).toBeTruthy()
      expect(getByText(/Away/)).toBeTruthy()
      expect(getByText(/15:00/)).toBeTruthy()
      expect(getByText('Meet 13:30 · Vereinsheim')).toBeTruthy()
    })

    it("shows only the player's own jobs and the fee owed", async () => {
      mockMatchday()
      const { findByText, getByText, queryByText } = render(
        wrap(<PlayerHome clubId="club-1" teamId="team-1" />),
      )
      expect(await findByText('Jersey wash')).toBeTruthy()
      expect(queryByText('Bib wash')).toBeNull()
      const fee = getByText(/45\.00/)
      fireEvent.press(fee)
      const { router } = require('expo-router')
      expect(router.push).toHaveBeenCalledWith('/my-contributions')
    })

    it('hides jobs and fees when there are none', async () => {
      mockMatchday({
        duties: [],
        dues: { hasContributions: true, bankTransfer: null, items: [] },
      })
      const { findByText, queryByText } = render(
        wrap(<PlayerHome clubId="club-1" teamId="team-1" />),
      )
      expect(await findByText('vs SV Babelsberg 03')).toBeTruthy()
      expect(queryByText('My jobs')).toBeNull()
      expect(queryByText(/outstanding/)).toBeNull()
    })
  })
})
