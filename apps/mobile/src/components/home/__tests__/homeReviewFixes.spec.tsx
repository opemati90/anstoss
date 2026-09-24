/**
 * home revamp: adversarial-review fixes for the player home and the shared
 * home kit. Each block names the finding it pins down.
 */
import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { PlayerHome } from '../PlayerHome'
import { HomeSkeleton } from '../HomeSkeleton'
import { SeasonStrip } from '../SeasonStrip'
import {
  LocationLine,
  calendarDayDiff,
  formatCountdown,
  formatDayTime,
  formatTime,
  shouldStackTimes,
} from '../HomeKit'
import { eventsThisWeek } from '../WeekAhead'
import { contrastBetween, textSafeAccent } from '../../../theme/club-theme'

const mockApi = jest.fn()
const mockSocket: { onEventUpsert?: () => void } = {}

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('react-i18next', () => {
  const t = (k: string, opts?: { defaultValue?: string } & Record<string, unknown>) => {
    const template = typeof opts?.defaultValue === 'string' ? opts.defaultValue : k
    return template.replace(/\{\{(\w+)\}\}/g, (_m, name) => {
      const v = (opts as Record<string, unknown> | undefined)?.[name]
      return v == null ? `{{${name}}}` : String(v)
    })
  }
  return {
    useTranslation: () => ({ t, i18n: { language: 'en' } }),
    initReactI18next: { type: '3rdParty', init: () => undefined },
  }
})

jest.mock('../../../i18n', () => ({
  getAppLanguage: () => 'en',
  getAppLocale: () => 'en-GB',
}))

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}))

jest.mock('../../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../../theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})

jest.mock('../../../api/client', () => ({
  api: (...a: unknown[]) => mockApi(...a),
  API_URL: 'http://test',
  ApiError: class extends Error {},
}))

jest.mock('../../../hooks/useEventsSocket', () => ({
  useEventsSocket: (opts: { onEventUpsert?: () => void }) => {
    mockSocket.onEventUpsert = opts.onEventUpsert
  },
}))

jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Julian Becker' }, token: 't' }),
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

const DAY = 86_400_000
const event = (id: string, title: string, offsetDays: number, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'TRAINING',
  title,
  date: new Date(Date.now() + offsetDays * DAY).toISOString(),
  myRsvp: null,
  yesCount: 0,
  maybeCount: 0,
  noCount: 0,
  ...extra,
})

let eventsResponse: () => Promise<unknown>

beforeEach(() => {
  mockApi.mockReset()
  mockSocket.onEventUpsert = undefined
  eventsResponse = () =>
    Promise.resolve([
      event('e1', 'Monday training', 1),
      event('e2', 'Tuesday training', 2),
      event('e3', 'Thursday training', 4),
      event('e4', 'Training in two weeks', 12),
    ])
  mockApi.mockImplementation((path: string) => {
    if (path.includes('/events?')) return eventsResponse()
    if (path.includes('/announcements')) {
      return Promise.resolve([{ id: 'an1', title: 'Club BBQ', body: 'Saturday' }])
    }
    return Promise.resolve([])
  })
})

describe('#1 a failed refresh keeps the home', () => {
  it('keeps the events and shows "Last updated …" instead of wiping the screen', async () => {
    let handle: { refresh: () => void } | null = null
    const view = render(
      wrap(
        <PlayerHome
          clubId="club-1"
          teamId="team-1"
          onRefreshStateChange={(h) => {
            handle = h
          }}
        />,
      ),
    )
    expect(await view.findByText('Monday training', {}, { timeout: 3000 })).toBeTruthy()
    expect(view.getByText('Club BBQ')).toBeTruthy()

    // Offline now: every request fails.
    mockApi.mockImplementation(() => Promise.reject(new Error('offline')))
    await act(async () => {
      handle?.refresh()
    })

    expect(await view.findByText(/^Last updated /, {}, { timeout: 3000 })).toBeTruthy()
    expect(view.getByText('Monday training')).toBeTruthy()
    expect(view.getByText('Club BBQ')).toBeTruthy()
    expect(view.queryByText("Couldn't load your week")).toBeNull()
  })
})

describe('#11 realtime upserts refresh quietly', () => {
  it('collapses a burst into one events request after ~1.5 s without the spinner', async () => {
    const states: boolean[] = []
    const view = render(
      wrap(
        <PlayerHome
          clubId="club-1"
          teamId="team-1"
          onRefreshStateChange={(h) => states.push(h.refreshing)}
        />,
      ),
    )
    expect(await view.findByText('Monday training')).toBeTruthy()
    const before = mockApi.mock.calls.length
    eventsResponse = () => Promise.resolve([event('e1', 'Monday training (moved)', 1)])

    act(() => {
      for (let i = 0; i < 6; i += 1) mockSocket.onEventUpsert?.()
    })
    expect(mockApi.mock.calls.length).toBe(before)

    expect(
      await view.findByText('Monday training (moved)', {}, { timeout: 3000 }),
    ).toBeTruthy()
    const after = mockApi.mock.calls.slice(before).map(([path]) => String(path))
    expect(after).toHaveLength(1)
    expect(after[0]).toContain('/events?')
    expect(states.every((refreshing) => refreshing === false)).toBe(true)
  })
})

describe('#9/#10 "This week" is the next seven days', () => {
  it('counts and lists only this week, links to all events, and names each reply group', async () => {
    const view = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    expect(await view.findByText('Monday training')).toBeTruthy()
    // Hero = Monday; the list holds Tuesday + Thursday, not the one in 12 days.
    expect(view.getByText('This week · 2 to answer')).toBeTruthy()
    expect(view.queryByText('Training in two weeks')).toBeNull()

    fireEvent.press(view.getByLabelText('All events'))
    const { router } = require('expo-router')
    expect(router.push).toHaveBeenCalledWith('/(tabs)/events')

    type Node = { type: unknown; props: Record<string, unknown> }
    const groups = view.UNSAFE_root.findAll(
      (node: Node) => typeof node.type === 'string' && node.props.accessibilityRole === 'radiogroup',
    )
    expect(
      groups.some((g: Node) => String(g.props.accessibilityLabel).startsWith('Tuesday training, ')),
    ).toBe(true)
    // Each answer also carries the event as its hint (iOS reads no group label).
    const radios = view.getAllByRole('radio')
    expect(radios.some((r) => String(r.props.accessibilityHint).startsWith('Tuesday training, '))).toBe(
      true,
    )
  })

  it('eventsThisWeek drops anything past seven days', () => {
    const now = Date.UTC(2026, 8, 24, 10)
    const rows = [
      { date: new Date(now + 6 * DAY).toISOString() },
      { date: new Date(now + 8 * DAY).toISOString() },
    ]
    expect(eventsThisWeek(rows, now)).toHaveLength(1)
  })
})

describe('#5 countdown by calendar day', () => {
  const t = (_k: string, o?: Record<string, unknown>) =>
    String(o?.defaultValue ?? '').replace(/\{\{(\w+)\}\}/g, (_m, n) => String(o?.[n]))

  it('says "Today 21:00" twelve hours ahead on the same evening (was "Tomorrow")', () => {
    const now = new Date(2026, 8, 24, 9, 0).getTime()
    const at = new Date(2026, 8, 24, 21, 0).toISOString()
    expect(formatCountdown(at, now, 'de-DE', t)).toBe('Today 21:00')
  })

  it('says "Tomorrow" for tomorrow evening seen late tonight', () => {
    const now = new Date(2026, 8, 24, 22, 0).getTime()
    expect(formatCountdown(new Date(2026, 8, 25, 21, 0).toISOString(), now, 'de-DE', t)).toBe(
      'Tomorrow',
    )
  })

  it('says "In 2 days" for the day after tomorrow even when under 48 h (was "Tomorrow")', () => {
    const now = new Date(2026, 8, 24, 23, 0).getTime()
    expect(formatCountdown(new Date(2026, 8, 26, 1, 0).toISOString(), now, 'de-DE', t)).toBe(
      'In 2 days',
    )
    expect(calendarDayDiff(now, new Date(2026, 8, 26, 1, 0).getTime())).toBe(2)
  })
})

describe('#8 24-hour clock in every app locale', () => {
  it.each(['de-DE', 'en-GB', 'fr-FR', 'it-IT', 'pt-PT', 'tr-TR'])('%s formats 15:00', (locale) => {
    expect(formatTime(new Date(2026, 8, 26, 15, 0).toISOString(), locale)).toBe('15:00')
  })

  it('adds the day to a time that is not today', () => {
    const now = new Date(2026, 8, 24, 10, 0).getTime()
    expect(formatDayTime(new Date(2026, 8, 24, 14, 30).toISOString(), 'de-DE', now)).toBe('14:30')
    expect(formatDayTime(new Date(2026, 8, 26, 14, 30).toISOString(), 'de-DE', now)).toBe(
      'Sa 26.09. 14:30',
    )
  })

  it('maps tr to tr-TR in the real locale table', () => {
    const { getAppLocale } = jest.requireActual('../../../i18n/index')
    expect(getAppLocale('tr')).toBe('tr-TR')
    expect(getAppLocale('en')).toBe('en-GB')
  })

  it('stacks Anstoß and Treffpunkt only when "15:00" would not fit its column', () => {
    expect(
      shouldStackTimes({ blockWidth: 311, digitSize: 32, fontScale: 1, maxFontScale: 1.4, label: '15:00' }),
    ).toBe(false)
    // 320pt phone at the capped maximum text size.
    expect(
      shouldStackTimes({ blockWidth: 256, digitSize: 32, fontScale: 2, maxFontScale: 1.4, label: '15:00' }),
    ).toBe(true)
  })
})

describe('#12 Treffpunkt without a meeting time', () => {
  it('still names the meeting point', () => {
    const view = render(
      <LocationLine
        event={{ title: 'Spiel', date: '2026-09-26T13:00:00Z', meetingPoint: 'Vereinsheim', location: 'Platz 2' }}
      />,
    )
    expect(view.getByText('Meet at Vereinsheim')).toBeTruthy()
    expect(view.getByText('Platz 2')).toBeTruthy()
  })
})

describe('#14 club colour as small text', () => {
  it('reaches 4.5:1 on the primary50 chip in light mode for a yellow club', () => {
    const accent = textSafeAccent('#F5C400', '#FFFFFF', 'rgba(245, 196, 0, 0.1)')
    expect(contrastBetween(accent, 'rgba(245, 196, 0, 0.1)', '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
  })

  it('lifts a navy club on the dark surface', () => {
    const accent = textSafeAccent('#10224A', '#1A1A18')
    expect(contrastBetween(accent, '#1A1A18', '#1A1A18')).toBeGreaterThanOrEqual(4.5)
  })

  it('leaves an already readable colour alone', () => {
    expect(textSafeAccent('#0F5C37', '#FFFFFF')).toBe('#0F5C37')
  })
})

describe('LOW fixes', () => {
  it('announces the skeleton as loading', () => {
    const view = render(<HomeSkeleton variant="player" />)
    expect(view.getByLabelText('Loading ...')).toBeTruthy()
  })

  it('hides season tiles that are all zero before the season starts', () => {
    const view = render(
      <SeasonStrip
        streaks={{ attendanceWeeks: 0, attendanceLongest: 0, motmWeeks: 0, motmLongest: 0 } as never}
        rank={null}
        seasonStats={null}
      />,
    )
    expect(view.toJSON()).toBeNull()
  })
})
