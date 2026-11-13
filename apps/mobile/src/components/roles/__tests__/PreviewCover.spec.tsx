/**
 * Vorschau und Vertretung (boards 29/31): the sheet on Mehr, the acting /
 * preview banner and the read-only write blocker.
 */
import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { PreviewCoverEntryCard, PreviewCoverSheet, canUsePreviewCover } from '../PreviewCoverSheet'
import { ActingAsBanner } from '../ActingAsBanner'
import { getViewAsState, resetViewAs } from '../../../features/acting/store'

const mockApi = jest.fn()
const mockSetWriteBlocker = jest.fn()
const mockNavigate = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('react-i18next', () => {
  const t = (k: string, opts?: Record<string, unknown>) =>
    opts ? `${k}:${JSON.stringify(opts)}` : k
  return {
    useTranslation: () => ({ t, i18n: { language: 'de' } }),
    initReactI18next: { type: '3rdParty', init: () => undefined },
  }
})

jest.mock('expo-router', () => ({ router: { navigate: (...a: unknown[]) => mockNavigate(...a) } }))

jest.mock('../../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../../theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})

jest.mock('../../../api/client', () => {
  class ApiError extends Error {
    constructor(message: string, public status = 500) {
      super(message)
    }
  }
  return {
    api: (...a: unknown[]) => mockApi(...a),
    ApiError,
    setWriteBlocker: (...a: unknown[]) => mockSetWriteBlocker(...a),
  }
})

jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Yemi Adeyemi' },
    activeClub: { role: 'OWNER', operationalRoles: [], club: { id: 'club-1', name: 'SV Spreewiese' } },
    activeTeamAccess: {
      id: 'ta1',
      role: 'HEAD_COACH',
      team: { id: 'team-h1', name: '1. Herren', displayName: '1. Herren', clubId: 'club-1', ageGroup: null },
    },
    teamsForActiveClub: [],
  }),
}))

const CANDIDATES = {
  items: [
    { teamId: 'team-aj', teamName: 'A-Jugend', headCoachName: 'Jonas', coachAway: true },
    { teamId: 'team-ej', teamName: 'E-Jugend', headCoachName: null, coachAway: false },
  ],
}

function session(minutes = 30) {
  const now = Date.now()
  return {
    id: 'as1',
    clubId: 'club-1',
    teamId: 'team-aj',
    teamName: 'A-Jugend',
    role: 'COACH',
    reason: null,
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + minutes * 60_000 - 1000).toISOString(),
    endedAt: null,
  }
}

const wrap = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}
    >
      {ui}
    </SafeAreaProvider>,
  )

beforeEach(() => {
  mockApi.mockReset()
  mockSetWriteBlocker.mockReset()
  mockNavigate.mockReset()
  act(() => resetViewAs())
})

describe('canUsePreviewCover', () => {
  it('is for Vorstand and Teammanager only', () => {
    expect(canUsePreviewCover({ role: 'OWNER' })).toBe(true)
    expect(canUsePreviewCover({ role: 'ADMIN' })).toBe(true)
    expect(canUsePreviewCover({ role: 'PLAYER', operationalRoles: ['TEAM_COORDINATOR'] })).toBe(true)
    expect(canUsePreviewCover({ role: 'COACH', operationalRoles: [] })).toBe(false)
    expect(canUsePreviewCover({ role: 'PLAYER', operationalRoles: ['TREASURER'] })).toBe(false)
    expect(canUsePreviewCover(null)).toBe(false)
  })
})

describe('PreviewCoverEntryCard', () => {
  it('renders the ink card copy and opens on press', () => {
    const onPress = jest.fn()
    const { getByText, getByTestId } = wrap(<PreviewCoverEntryCard onPress={onPress} />)
    expect(getByText('acting.entryTitle')).toBeTruthy()
    expect(getByText('acting.entrySub')).toBeTruthy()
    fireEvent.press(getByTestId('more-preview-cover'))
    expect(onPress).toHaveBeenCalled()
  })
})

describe('PreviewCoverSheet', () => {
  it('shows Vorschau and Vertretung rows and opens a read-only player preview', async () => {
    mockApi.mockResolvedValueOnce(CANDIDATES)
    const onClose = jest.fn()
    const { getByText, getByTestId } = wrap(<PreviewCoverSheet visible onClose={onClose} />)
    await waitFor(() => expect(getByText('acting.coachAway:{"team":"A-Jugend"}')).toBeTruthy())
    expect(getByText('acting.asPlayer')).toBeTruthy()
    expect(getByText('acting.readOnly:{"team":"1. Herren"}')).toBeTruthy()
    expect(getByText('acting.readOnly:{"team":"E-Jugend"}')).toBeTruthy()
    expect(getByText('acting.openPreview')).toBeTruthy()

    fireEvent.press(getByTestId('preview-cover-confirm'))
    expect(getViewAsState().preview).toEqual({
      mode: 'PLAYER',
      team: { id: 'team-h1', name: '1. Herren', clubId: 'club-1' },
    })
    expect(mockSetWriteBlocker).toHaveBeenCalledWith(expect.any(Function))
    const blocker = mockSetWriteBlocker.mock.calls.at(-1)?.[0] as (m: string, p: string) => boolean
    expect(blocker('POST', '/events/e1/rsvp')).toBe(true)
    expect(blocker('GET', '/events/e1')).toBe(false)
    expect(blocker('POST', '/auth/otp/request')).toBe(false)
    expect(onClose).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/(tabs)')
  })

  it('starts a 30-minute stand-in for the away coach', async () => {
    mockApi.mockResolvedValueOnce(CANDIDATES).mockResolvedValueOnce(session())
    const { getByText, getByTestId } = wrap(<PreviewCoverSheet visible onClose={jest.fn()} />)
    await waitFor(() => expect(getByText('acting.coachAway:{"team":"A-Jugend"}')).toBeTruthy())

    fireEvent.press(getByTestId('preview-cover-acting'))
    expect(getByText('acting.minutes:{"count":15}')).toBeTruthy()
    expect(getByText('acting.logNote:{"name":"Yemi"}')).toBeTruthy()
    expect(getByText('acting.startActing:{"count":30}')).toBeTruthy()

    await act(async () => {
      fireEvent.press(getByTestId('preview-cover-confirm'))
    })
    expect(mockApi).toHaveBeenLastCalledWith('/clubs/club-1/acting-sessions', {
      method: 'POST',
      body: { teamId: 'team-aj', durationMin: 30, role: 'COACH' },
    })
    expect(getViewAsState().acting?.id).toBe('as1')
  })
})

describe('ActingAsBanner', () => {
  it('renders nothing without a session', async () => {
    mockApi.mockResolvedValue({ session: null })
    const { queryByTestId } = wrap(<ActingAsBanner />)
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/me/acting-session'))
    expect(queryByTestId('acting-as-banner')).toBeNull()
  })

  it('shows the acting line with minutes left and ends the session', async () => {
    mockApi.mockResolvedValueOnce({ session: session(28) }).mockResolvedValueOnce({})
    const { getByText, getByTestId, queryByTestId } = wrap(<ActingAsBanner />)
    await waitFor(() => expect(getByTestId('acting-as-banner')).toBeTruthy())
    expect(getByText('acting.bannerActing:{"team":"A-Jugend"}')).toBeTruthy()
    expect(getByText('acting.bannerActingMeta:{"count":28}')).toBeTruthy()
    await act(async () => {
      fireEvent.press(getByTestId('acting-as-end'))
    })
    expect(mockApi).toHaveBeenLastCalledWith('/acting-sessions/as1', { method: 'DELETE' })
    expect(queryByTestId('acting-as-banner')).toBeNull()
  })
})
