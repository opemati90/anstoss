import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { ParentHome } from '../../src/components/home/ParentHome'
import { api } from '../../src/api/client'
import { useChildrenSummary, formatChildrenSummary } from '../../src/components/home/childrenSummary'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}))
jest.mock('../../src/i18n', () => ({ getAppLanguage: () => 'en', getAppLocale: () => 'en-GB' }))
jest.mock('../../src/hooks/useEventsSocket', () => ({ useEventsSocket: jest.fn() }))

jest.mock('react-i18next', () => {
  const t = (key: string, opts?: { defaultValue?: string } & Record<string, unknown>) => {
    const template = typeof opts?.defaultValue === 'string' ? opts.defaultValue : key
    return template.replace(/\{\{(\w+)\}\}/g, (_m, name) => {
      const v = (opts as Record<string, unknown> | undefined)?.[name]
      return v == null ? '' : String(v)
    })
  }
  return { useTranslation: () => ({ t, i18n: { language: 'en-GB' } }) }
})

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME }),
    useIsDark: () => false,
  }
})

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-parent-1', name: 'Nina Becker' },
    activeClub: { club: { id: 'club-1', name: 'SV Albatros' }, role: 'PARENT' },
  }),
}))

jest.mock('../../src/components/events/UnavailableReasonSheet', () => ({
  UnavailableReasonSheet: () => null,
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
}))

const mockedApi = api as jest.MockedFunction<typeof api>
const mockedPush = router.push as jest.Mock
const NOW = new Date('2026-09-23T10:00:00Z').getTime()
let dateNowSpy: jest.SpyInstance

const inDays = (days: number, hour: number, minute = 0) => {
  const d = new Date(NOW + days * 86400000)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function childEvents() {
  return [
    {
      id: 'leo-match',
      clubId: 'club-1',
      type: 'MATCH',
      title: '@ SV Babelsberg 03',
      opponent: 'SV Babelsberg 03',
      homeAway: 'AWAY',
      date: inDays(4, 15),
      meetingAt: inDays(4, 13, 30),
      meetingPoint: 'Vereinsheim',
      location: 'Karl-Liebknecht-Stadion',
      fixtureId: 'fixture-9',
      carpoolEnabled: true,
      teamName: 'U15',
      teamDisplayName: 'Jugend — U15',
      childUserId: 'kid-leo',
      childName: 'Leo Becker',
      childRsvp: null,
    },
    {
      id: 'mia-training',
      clubId: 'club-1',
      type: 'TRAINING',
      title: 'Training',
      date: inDays(1, 17),
      location: 'Albatros Platz 1',
      teamName: 'U11',
      teamDisplayName: 'Jugend — U11',
      childUserId: 'kid-mia',
      childName: 'Mia Becker',
      childRsvp: 'YES',
    },
  ]
}

const LINKED_CHILDREN = [
  { userId: 'kid-leo', name: 'Leo Becker', teams: [{ id: 't-u15', name: 'U15', displayName: 'Jugend — U15' }] },
  { userId: 'kid-mia', name: 'Mia Becker', teams: [{ id: 't-u11', name: 'U11', displayName: 'Jugend — U11' }] },
]

/** TeamDutyAssignment + teamName/childUserId, as GET /me/children-overview returns it. */
function duty(overrides: Record<string, unknown>) {
  return {
    id: 'duty-1',
    clubId: 'club-1',
    teamId: 't-u15',
    assignedUserId: 'user-parent-1',
    createdById: 'coach-1',
    kind: 'JERSEY_CLEANUP',
    status: 'PENDING',
    dueDate: inDays(4, 18),
    notes: null,
    completedAt: null,
    createdAt: inDays(-2, 10),
    updatedAt: inDays(-2, 10),
    teamName: 'U15',
    childUserId: null,
    ...overrides,
  }
}

function mockHomeData({
  events = childEvents() as unknown[] | null,
  announcements = [] as unknown[],
  duties = [] as unknown[],
  children = LINKED_CHILDREN as unknown[],
  dues = null as unknown,
} = {}) {
  mockedApi.mockImplementation(((path: string) => {
    if (path.includes('/me/children-events')) {
      return events === null ? Promise.reject(new Error('offline')) : Promise.resolve(events)
    }
    if (path.startsWith('/me/children-overview?clubId=club-1')) {
      return Promise.resolve({ children, duties, announcements })
    }
    if (path.includes('/contributions/my')) return Promise.resolve(dues)
    return Promise.reject(new Error(`unexpected ${path}`))
  }) as unknown as typeof api)
}

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

describe('ParentHome', () => {
  beforeEach(() => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW)
    mockedApi.mockReset()
    mockedPush.mockReset()
    mockHomeData()
  })

  afterEach(() => {
    dateNowSpy.mockRestore()
  })

  it("offers one chip per child, named with the child's own team, and one hero for the chosen child", async () => {
    const { findByText, getByText, queryByText } = render(wrap(<ParentHome />))
    // Redesign screen 25: child chips, then the chosen child's hero.
    expect(await findByText('Leo · U15')).toBeTruthy()
    expect(getByText('Mia · U11')).toBeTruthy()
    expect(getByText(/SV Babelsberg 03/)).toBeTruthy()
    expect(getByText('Reply for Leo')).toBeTruthy()
    expect(queryByText('Reply for Mia')).toBeNull()
    fireEvent.press(getByText('Mia · U11'))
    expect(await findByText('Reply for Mia')).toBeTruthy()
    // The parent's own membership never labels the card.
    expect(queryByText(/Senior/)).toBeNull()
  })

  it('shows kick-off and the meeting time and place for the child', async () => {
    const { findByText, getByText } = render(wrap(<ParentHome />))
    expect(await findByText('Leo · U15')).toBeTruthy()
    expect(getByText(/15:00/)).toBeTruthy()
    expect(getByText('Meet 13:30 · Vereinsheim')).toBeTruthy()
  })

  it('answers on behalf of the child through rsvp-proxy', async () => {
    const { findAllByLabelText } = render(wrap(<ParentHome />))
    const [leoYes] = await findAllByLabelText('Leo: eventFlow.rsvp.yes')
    fireEvent.press(leoYes)
    await waitFor(
      () =>
        expect(mockedApi).toHaveBeenCalledWith('/clubs/club-1/events/leo-match/rsvp-proxy', {
          method: 'PUT',
          body: { status: 'YES', childUserId: 'kid-leo' },
        }),
      { timeout: 2000 },
    )
  })

  it('offers a seat on the carpool board for an away match', async () => {
    const { findByText } = render(wrap(<ParentHome />))
    fireEvent.press(await findByText('Offer a seat'))
    expect(mockedPush).toHaveBeenCalledWith({
      pathname: '/carpool',
      params: { fixtureId: 'fixture-9', eventId: 'leo-match' },
    })
  })

  it("lists the parent's own and the children's team duties, and family fees", async () => {
    mockHomeData({
      duties: [
        duty({ id: 'duty-own' }),
        duty({
          id: 'duty-mia',
          kind: 'LOCKER_ROOM',
          teamId: 't-u11',
          teamName: 'U11',
          assignedUserId: 'kid-mia',
          childUserId: 'kid-mia',
          dueDate: inDays(5, 19),
        }),
        // Outside the two-week window: not a job for this week.
        duty({ id: 'duty-far', dueDate: inDays(30, 18) }),
      ],
      dues: {
        hasContributions: true,
        bankTransfer: null,
        items: [
          {
            planId: 'fam',
            planName: 'Familienbeitrag',
            amount: 4500,
            currency: 'EUR',
            cadence: 'YEARLY',
            dueDate: inDays(-3, 12),
            status: 'OVERDUE',
            paidAmount: null,
            paidAt: null,
            paymentReported: false,
          },
        ],
      },
    })
    const { findByText, getByText, getAllByText, queryByText } = render(wrap(<ParentHome />))
    expect(await findByText('Jersey wash')).toBeTruthy()
    expect(getByText('Mia: kader.duties.kind.lockerRoom')).toBeTruthy()
    expect(getAllByText(/^U15 · by /)).toHaveLength(1)
    fireEvent.press(getByText('Jersey wash'))
    expect(mockedPush).toHaveBeenCalledWith('/aufgaben')
    // Board 25: the fee is one row in the same group, plan name plus tag.
    expect(getByText('Familienbeitrag')).toBeTruthy()
    expect(getByText('contributions.status.OVERDUE')).toBeTruthy()
    expect(queryByText('Announcements')).toBeNull()
  })

  it('keeps announcements off Start (board 25) and calls only real routes', async () => {
    mockHomeData({
      announcements: [
        {
          id: 'a1',
          title: 'Team photo day',
          body: 'Saturday 10:00',
          createdAt: inDays(-1, 9),
          teamId: 't-u15',
          teamName: 'U15',
        },
      ],
    })
    const { findByText, queryByText } = render(wrap(<ParentHome />))
    expect(await findByText('Reply for Leo')).toBeTruthy()
    expect(queryByText('Team photo day')).toBeNull()
    // Only real API routes are called.
    const paths = mockedApi.mock.calls.map(([path]) => String(path))
    expect(paths.some((path) => path.includes('children-announcements'))).toBe(false)
    expect(paths.some((path) => /\/clubs\/[^/]+\/duties/.test(path))).toBe(false)
  })

  it('flags schedule clashes between children and routes to the resolver', async () => {
    const events = childEvents()
    events[1] = { ...events[1], date: inDays(4, 15, 30) }
    mockHomeData({ events })
    const { findByText } = render(wrap(<ParentHome />))
    fireEvent.press(await findByText('1 schedule clashes'))
    expect(mockedPush).toHaveBeenCalledWith('/conflicts')
  })

  it('shows a composed empty state with the schedule action', async () => {
    mockHomeData({ events: [] })
    const { findByText } = render(wrap(<ParentHome />))
    expect(await findByText('No events for your children')).toBeTruthy()
    fireEvent.press(await findByText('Open schedule'))
    expect(mockedPush).toHaveBeenCalledWith('/(tabs)/events')
  })

  // ── home review fixes ──
  it('names every linked child and all their teams in the header, even without events', async () => {
    mockHomeData({
      events: [childEvents()[0]],
      children: [
        {
          userId: 'kid-leo',
          name: 'Leo Becker',
          teams: [
            { id: 't-u15', name: 'U15', displayName: 'U15' },
            { id: 't-u17', name: 'U17', displayName: 'U17' },
          ],
        },
        { userId: 'kid-mia', name: 'Mia Becker', teams: [{ id: 't-u11', name: 'U11', displayName: 'U11' }] },
      ],
    })
    let summary = ''
    function HeaderProbe() {
      summary = formatChildrenSummary(useChildrenSummary())
      return null
    }
    const { findByText } = render(
      wrap(
        <>
          <HeaderProbe />
          <ParentHome />
        </>,
      ),
    )
    expect(await findByText('Reply for Leo')).toBeTruthy()
    await waitFor(() => expect(summary).toBe('Leo · U15/U17, Mia · U11'))
  })

  it('asks a parent without a linked child to link one', async () => {
    mockHomeData({ events: [], children: [] })
    const { findByText, queryByText } = render(wrap(<ParentHome />))
    expect(await findByText('Link your child')).toBeTruthy()
    expect(queryByText('No events for your children')).toBeNull()
    fireEvent.press(await findByText('Link child'))
    expect(mockedPush).toHaveBeenCalledWith('/(auth)/parent-handoff')
  })

  it('keeps the children’s cards when a refresh fails', async () => {
    let handle: { refresh: () => void } | null = null
    const view = render(
      wrap(
        <ParentHome
          onRefreshStateChange={(h) => {
            handle = h
          }}
        />,
      ),
    )
    expect(await view.findByText('Leo · U15')).toBeTruthy()
    mockHomeData({ events: null })
    await React.act(async () => {
      handle?.refresh()
    })
    expect(await view.findByText(/Showing your last update/)).toBeTruthy()
    expect(view.getByText('Leo · U15')).toBeTruthy()
  })
  // ── end home review fixes ──

  it('shows an inline error with retry when the schedule fails', async () => {
    mockHomeData({ events: null })
    const { findByText, getByLabelText } = render(wrap(<ParentHome />))
    expect(await findByText("Couldn't load your children's schedule")).toBeTruthy()
    mockHomeData()
    fireEvent.press(getByLabelText('Try again'))
    expect(await findByText('Leo · U15')).toBeTruthy()
  })
})
