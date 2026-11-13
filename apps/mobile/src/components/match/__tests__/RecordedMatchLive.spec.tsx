import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import type { MatchLiveStateDto } from '@anstoss/shared'

const mockApi = jest.fn()
const mockEmit = jest.fn()
const mockOn = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'de' } }),
}))
jest.mock('socket.io-client', () => ({
  io: () => ({ emit: mockEmit, on: mockOn, disconnect: jest.fn() }),
}))
jest.mock('../../../api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ activeClub: { club: { id: 'c1' } }, getToken: () => Promise.resolve('tok') }),
}))
jest.mock('../../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../../theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})
jest.mock('../../../utils/haptics', () => {
  const noop = () => undefined
  const Haptics = { select: noop, tap: noop, tapMedium: noop, success: noop, fail: noop }
  return { Haptics, default: Haptics }
})

import { RecordedMatchLive, liveMinute } from '../RecordedMatchLive'

function state(overrides: Partial<MatchLiveStateDto> = {}): MatchLiveStateDto {
  return {
    eventId: 'e1',
    status: 'FIRST_HALF',
    goalsFor: 0,
    goalsAgainst: 0,
    scoreHome: 0,
    scoreAway: 0,
    homeAway: 'HOME',
    opponent: 'RW Köpenick III',
    minute: 12,
    kickoffAt: new Date(Date.now() - 11 * 60_000).toISOString(),
    secondHalfAt: null,
    finishedAt: null,
    events: [],
    canRecord: true,
    ...overrides,
  }
}

const detail = {
  id: 'e1',
  type: 'MATCH',
  opponent: 'RW Köpenick III',
  team: { id: 't1', name: 'SV Spreewiese' },
  members: [
    { userId: 'p9', name: 'Kofi Osei', jerseyNumber: 9 },
    { userId: 'p4', name: 'Tomasz Nowak', jerseyNumber: 4 },
  ],
  lineup: null,
}

function route(live: MatchLiveStateDto, after?: MatchLiveStateDto) {
  mockApi.mockImplementation((path: string, init?: { method?: string }) => {
    if (path === '/clubs/c1/events/e1/live' && !init) return Promise.resolve(live)
    if (path === '/clubs/c1/events/e1') return Promise.resolve(detail)
    return Promise.resolve(after ?? live)
  })
}

describe('RecordedMatchLive', () => {
  beforeEach(() => {
    mockApi.mockReset()
    mockEmit.mockReset()
    mockOn.mockReset()
  })

  it('joins the event room for live updates', async () => {
    route(state())
    const screen = render(<RecordedMatchLive eventId="e1" />)
    await screen.findByTestId('live-actions')
    await waitFor(() => expect(mockEmit).toHaveBeenCalledWith('live:join', { eventId: 'e1' }))
    expect(mockOn).toHaveBeenCalledWith('live:match', expect.any(Function))
  })

  it('records a goal with the picked scorer', async () => {
    route(state(), state({ goalsFor: 1, scoreHome: 1 }))
    const screen = render(<RecordedMatchLive eventId="e1" />)
    fireEvent.press(await screen.findByTestId('live-goal'))
    fireEvent.press(await screen.findByLabelText('Kofi Osei'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/c1/events/e1/live/events', {
        method: 'POST',
        body: { kind: 'GOAL', playerUserId: 'p9' },
      }),
    )
  })

  it('records a goal against in one tap', async () => {
    route(state())
    const screen = render(<RecordedMatchLive eventId="e1" />)
    fireEvent.press(await screen.findByTestId('live-conceded'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/c1/events/e1/live/events', {
        method: 'POST',
        body: { kind: 'CONCEDED' },
      }),
    )
  })

  it('records a substitution as player on for player off', async () => {
    route(state())
    const screen = render(<RecordedMatchLive eventId="e1" />)
    fireEvent.press(await screen.findByTestId('live-sub'))
    fireEvent.press(await screen.findByLabelText('Tomasz Nowak'))
    fireEvent.press(await screen.findByLabelText('Kofi Osei'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/c1/events/e1/live/events', {
        method: 'POST',
        body: { kind: 'SUB', playerUserId: 'p9', relatedUserId: 'p4' },
      }),
    )
  })

  it('kicks off from the footer before any actions show', async () => {
    route(state({ status: 'NOT_STARTED', minute: null, kickoffAt: null }))
    const screen = render(<RecordedMatchLive eventId="e1" />)
    fireEvent.press(await screen.findByTestId('live-clock'))
    expect(screen.queryByTestId('live-actions')).toBeNull()
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/c1/events/e1/live', {
        method: 'PATCH',
        body: { status: 'FIRST_HALF' },
      }),
    )
  })

  it('asks before the final whistle', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    route(state({ status: 'SECOND_HALF', secondHalfAt: new Date().toISOString() }))
    const screen = render(<RecordedMatchLive eventId="e1" />)
    fireEvent.press(await screen.findByTestId('live-clock'))
    expect(alert).toHaveBeenCalled()
    expect(mockApi).not.toHaveBeenCalledWith('/clubs/c1/events/e1/live', expect.objectContaining({ method: 'PATCH' }))
    alert.mockRestore()
  })

  it('is read-only for players', async () => {
    route(state({ canRecord: false }))
    const screen = render(<RecordedMatchLive eventId="e1" />)
    await screen.findByText('matchLive.timeline')
    expect(screen.queryByTestId('live-actions')).toBeNull()
    expect(screen.queryByTestId('live-clock')).toBeNull()
  })
})

describe('liveMinute', () => {
  it('ticks from the recorded kick-off and restart', () => {
    const now = Date.parse('2026-11-15T13:30:00Z')
    expect(liveMinute(state({ status: 'FIRST_HALF', kickoffAt: '2026-11-15T13:00:00Z' }), now)).toBe(31)
    expect(
      liveMinute(state({ status: 'SECOND_HALF', secondHalfAt: '2026-11-15T13:25:00Z' }), now),
    ).toBe(51)
    expect(liveMinute(state({ status: 'HALF_TIME', minute: 45 }), now)).toBe(45)
  })
})
