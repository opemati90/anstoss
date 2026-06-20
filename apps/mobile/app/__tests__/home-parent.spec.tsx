import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { ParentHome } from '../../src/components/home/ParentHome'
import { api } from '../../src/api/client'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

jest.mock('react-i18next', () => {
  const map: Record<string, string> = {
    'home.parent.nextActionEyebrow': 'FAMILY NEXT ACTION',
    'home.parent.actionConflictTitle': 'Resolve {{count}} schedule conflicts',
    'home.parent.actionConflictTitle_one': 'Resolve {{count}} schedule conflict',
    'home.parent.actionConflictTitle_other': 'Resolve {{count}} schedule conflicts',
    'home.parent.actionConflictBody':
      'Next overlap: {{when}}. Choose which child sits out before coaches plan attendance.',
    'home.parent.actionConflictCta': 'Review conflicts',
    'home.parent.actionConflictA11y': 'Review {{count}} schedule conflicts',
    'home.parent.actionConflictA11y_one': 'Review {{count}} schedule conflict',
    'home.parent.actionConflictA11y_other': 'Review {{count}} schedule conflicts',
    'home.parent.actionTodayTitle': 'Review {{title}} today',
    'home.parent.actionTodayBody': '{{team}} · {{when}}{{location}}',
    'home.parent.actionNextTitle': 'Next for {{child}}',
    'home.parent.actionNextBody': '{{team}} · {{title}} · {{when}}{{location}}',
    'home.parent.actionOpenEventCta': 'Open event',
    'home.parent.actionOpenEventA11y': 'Open {{title}} for {{child}}',
    'home.parent.actionEmptyTitle': 'No events for your child right now.',
    'home.parent.actionEmptyBody': 'Open the schedule to check linked teams and upcoming updates.',
    'home.parent.actionOpenScheduleCta': 'Open schedule',
    'home.parent.actionOpenScheduleA11y': 'Open children schedule',
    'home.parent.upcoming': 'Upcoming',
    'home.announcements': 'Announcements',
    'announcements.empty': 'No announcements.',
  }
  const t = (key: string, opts?: Record<string, unknown>) => {
    const pluralKey =
      typeof opts?.count === 'number'
        ? opts.count === 1
          ? `${key}_one`
          : `${key}_other`
        : null
    const template = (pluralKey ? map[pluralKey] : undefined) ?? map[key] ?? key
    return Object.entries(opts ?? {}).reduce(
      (text, [nextKey, value]) =>
        text.replaceAll(`{{${nextKey}}}`, value == null ? '' : String(value)),
      template,
    )
  }
  return {
    useTranslation: () => ({
      t,
      i18n: { language: 'en-US' },
    }),
  }
})

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
  api: jest.fn(),
}))

const mockedApi = api as jest.MockedFunction<typeof api>
const mockedPush = router.push as jest.Mock
let dateNowSpy: jest.SpyInstance

function eventResponse() {
  return [
    {
      id: 'c1',
      title: 'U12 match',
      date: '2026-04-28T10:00:00Z',
      location: 'Pitch 2',
      teamName: 'U12',
      teamDisplayName: 'U12 Youth',
      childUserId: 'kid-1',
      childName: 'Mia',
    },
  ]
}

function announcementResponse() {
  return [
    { id: 'an1', title: 'Team photo day', body: 'Next Saturday' },
  ]
}

function mockHomeData({
  events = eventResponse(),
  announcements = announcementResponse(),
}: {
  events?: unknown[]
  announcements?: unknown[]
} = {}) {
  mockedApi.mockImplementation((path: string) => {
    if (path.includes('/me/children-events')) {
      return Promise.resolve(events) as ReturnType<typeof api>
    }
    if (path.includes('/me/children-announcements')) {
      return Promise.resolve(announcements) as ReturnType<typeof api>
    }
    return Promise.resolve([]) as ReturnType<typeof api>
  })
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
    dateNowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-06-20T12:00:00Z').getTime())
    mockedApi.mockReset()
    mockedPush.mockReset()
    mockHomeData()
  })

  afterEach(() => {
    dateNowSpy.mockRestore()
  })

  it("renders the child's next event", async () => {
    const { findByText } = render(wrap(<ParentHome />))
    expect(await findByText('FAMILY NEXT ACTION')).toBeTruthy()
    expect(await findByText('Next for Mia')).toBeTruthy()
    expect(await findByText(/U12 match/)).toBeTruthy()
    expect(await findByText(/U12 Youth/i)).toBeTruthy()
  })

  it("renders the child's team announcements", async () => {
    const { findByText } = render(wrap(<ParentHome />))
    expect(await findByText('Team photo day')).toBeTruthy()
  })

  it('routes the next event action to event detail', async () => {
    const { findByLabelText } = render(wrap(<ParentHome />))

    fireEvent.press(await findByLabelText('Open U12 match for Mia'))

    expect(mockedPush).toHaveBeenCalledWith({
      pathname: '/event-detail',
      params: { eventId: 'c1' },
    })
  })

  it('prioritizes conflicts and routes to the conflict resolver', async () => {
    mockHomeData({
      events: [
        {
          id: 'c1',
          title: 'U12 match',
          date: '2026-04-28T10:00:00Z',
          location: 'Pitch 2',
          teamName: 'U12',
          childUserId: 'kid-1',
          childName: 'Mia',
        },
        {
          id: 'c2',
          title: 'U10 training',
          date: '2026-04-28T10:30:00Z',
          location: 'Pitch 3',
          teamName: 'U10',
          childUserId: 'kid-2',
          childName: 'Noah',
        },
      ],
    })

    const { findByText, findByLabelText, queryByText } = render(wrap(<ParentHome />))

    expect(await findByText('Resolve 1 schedule conflict')).toBeTruthy()
    expect(queryByText('Next for Mia')).toBeNull()
    fireEvent.press(await findByLabelText('Review 1 schedule conflict'))

    expect(mockedPush).toHaveBeenCalledWith('/conflicts')
  })

  it('does not pin conflicts that were already resolved by child RSVP', async () => {
    mockHomeData({
      events: [
        {
          id: 'c1',
          title: 'U12 match',
          date: '2026-04-28T10:00:00Z',
          location: 'Pitch 2',
          teamName: 'U12',
          childUserId: 'kid-1',
          childName: 'Mia',
        },
        {
          id: 'c2',
          title: 'U10 training',
          date: '2026-04-28T10:30:00Z',
          location: 'Pitch 3',
          teamName: 'U10',
          childUserId: 'kid-2',
          childName: 'Noah',
          childRsvp: 'NO',
        },
      ],
    })

    const { findByText, queryByText } = render(wrap(<ParentHome />))

    expect(await findByText('Next for Mia')).toBeTruthy()
    expect(queryByText('Resolve 1 schedule conflict')).toBeNull()
  })

  it('shows a schedule action when there are no child events', async () => {
    mockHomeData({ events: [], announcements: [] })

    const { findByText, findByLabelText } = render(wrap(<ParentHome />))

    expect(await findByText('No events for your child right now.')).toBeTruthy()
    fireEvent.press(await findByLabelText('Open children schedule'))

    expect(mockedPush).toHaveBeenCalledWith('/parent-schedule')
  })

  it('does not show the empty schedule action before the first load resolves', () => {
    mockedApi.mockImplementation(() => new Promise(() => {}) as ReturnType<typeof api>)

    const { queryByLabelText, queryByText } = render(wrap(<ParentHome />))

    expect(queryByText('No events for your child right now.')).toBeNull()
    expect(queryByLabelText('Open children schedule')).toBeNull()
  })
})
