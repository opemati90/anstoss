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

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }))

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
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    expect(await findByText('Reply to Monday training')).toBeTruthy()
    expect(await findByText('Monday training')).toBeTruthy()
    expect(await findByText('Yes')).toBeTruthy()
    expect(await findByText('Maybe')).toBeTruthy()
    expect(await findByText('No')).toBeTruthy()
  })

  it('RSVP Yes fires an API PUT', async () => {
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    const yes = await findByText('Yes')
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

  it('renders announcement titles', async () => {
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    expect(await findByText('Club BBQ')).toBeTruthy()
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
    const { findByText, queryByText } = render(
      wrap(<PlayerHome clubId="club-1" teamId="team-1" />),
    )

    expect(await findByText('Reply to Pitch arrival')).toBeTruthy()
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
    const { findByText, queryByText } = render(
      wrap(<PlayerHome clubId="club-1" teamId="team-1" />),
    )

    expect(await findByText('Reply to Live match')).toBeTruthy()
    expect(await findByText('1-0')).toBeTruthy()
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
    const { findByText, queryByText } = render(
      wrap(<PlayerHome clubId="club-1" teamId="team-1" />),
    )

    expect(await findByText('Open check-in')).toBeTruthy()
    expect(await findByText('2-1')).toBeTruthy()
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

    expect(await findByText('SV Albatros')).toBeTruthy()
    expect(await findByText('1-0')).toBeTruthy()
  })

  it('collapses a live-match action and event into one decisive hero', async () => {
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

    expect(await findByText('Open live match')).toBeTruthy()
    expect(queryByText('Match is live')).toBeNull()
    expect(queryAllByText('FC Nord')).toHaveLength(1)
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

    const { findByLabelText, findByText, queryByText } = render(
      wrap(<PlayerHome clubId="club-1" teamId="team-1" />),
    )

    expect(await findByLabelText('Team A vs A United live')).toBeTruthy()
    expect(queryByText('Team A live event')).toBeNull()
    expect(await findByText('Team B live event')).toBeTruthy()
    expect(await findByText('Team C training')).toBeTruthy()
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

    const { findByText, queryByText } = render(
      wrap(<PlayerHome clubId="club-1" teamId="team-1" />),
    )

    expect(await findByText('SV Albatros')).toBeTruthy()
    expect(await findByText('2-1')).toBeTruthy()
    expect(
      queryByText('Your upcoming matches will appear here. Ask your coach to schedule your first event.'),
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

  it('routes linked matches from the multi-team week list to match detail', async () => {
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

    fireEvent.press(await findByText('Team B Cup'))

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/match-detail',
      params: { fixtureId: 'fixture-team-2', teamId: 'team-2' },
    })
  })
})
