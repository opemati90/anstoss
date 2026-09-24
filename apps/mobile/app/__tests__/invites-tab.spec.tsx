import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { TrialInviteStatus, type TrialInvite } from '@anstoss/shared'
import ProbetrainingsTab from '../(tabs)/invites/index'
import { api } from '../../src/api/client'
import { resetApiCache } from '../../src/features/wechsel/query'

const mockRefreshUser = jest.fn(() => Promise.resolve())

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
    useFocusEffect: (cb: () => void) => useEffect(() => cb(), [cb]),
  }
})

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}))

jest.mock('../../src/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'club' in opts ? `${key}|${String(opts.club)}` : key,
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ refreshUser: mockRefreshUser }),
}))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})

jest.mock('../../src/i18n', () => ({
  __esModule: true,
  default: { language: 'de', resolvedLanguage: 'de' },
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
  ApiError: class ApiError extends Error {
    status = 500
  },
}))

const mockApi = api as jest.MockedFunction<typeof api>

const day = 86_400_000
const inDays = (days: number) => new Date(Date.now() + days * day).toISOString()

function invite(overrides: Partial<TrialInvite>): TrialInvite {
  return {
    id: 'invite-1',
    clubId: 'club-1',
    freeAgentProfileId: 'profile-1',
    teamId: 'team-1',
    sentByUserId: 'coach-1',
    message: null,
    expiresAt: inDays(3),
    status: TrialInviteStatus.PENDING,
    respondedAt: null,
    createdAt: inDays(-1),
    initiatedBy: 'CLUB' as TrialInvite['initiatedBy'],
    playerSearchId: null,
    sessionEventIds: [],
    sessions: [],
    decisionMessage: null,
    decidedAt: null,
    club: { id: 'club-1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C' },
    team: { id: 'team-1', displayName: 'Herren II', groupName: 'Herren', leagueName: 'Kreisliga A' },
    sender: { id: 'coach-1', name: 'Mara Schulz' },
    player: {
      profileId: 'profile-1',
      userId: 'user-1',
      name: 'Amir Kaya',
      avatarUrl: null,
      position: null,
      preferredFoot: null,
      highestLeague: null,
      age: null,
      isMinor: false,
    },
    joinRequest: null,
    ...overrides,
  }
}

const pipeline: TrialInvite[] = [
  invite({
    id: 'invited',
    sessions: [
      { id: 'e1', title: 'Training', date: inDays(3), location: 'Kunstrasen', cancelledAt: null },
    ],
  }),
  invite({
    id: 'scheduled',
    status: TrialInviteStatus.ACCEPTED,
    club: { id: 'club-2', name: 'SV Babelsberg 03', badgeUrl: null, primaryColor: '#1C2F6B' },
    sessions: [
      {
        id: 'e2',
        title: 'Training',
        date: inDays(2),
        location: 'Sportplatz Sandscholle',
        cancelledAt: null,
      },
    ],
  }),
  invite({
    id: 'offered',
    status: TrialInviteStatus.OFFERED,
    club: { id: 'club-3', name: 'Teltower FV 1913', badgeUrl: null, primaryColor: '#B3122E' },
    decisionMessage: 'Wir würden dich gern in der 1. Herren sehen.',
  }),
  invite({ id: 'expired', status: TrialInviteStatus.EXPIRED, club: { id: 'club-4', name: 'SV Werder 1919', badgeUrl: null, primaryColor: '#2B5FA8' } }),
]

describe('Probetrainings tab', () => {
  beforeEach(() => {
    resetApiCache()
    mockApi.mockReset()
  })

  it('groups trials by stage and folds the finished ones away', async () => {
    mockApi.mockResolvedValue(pipeline as never)
    const screen = render(<ProbetrainingsTab />)

    expect(await screen.findByText('Sportplatz Sandscholle')).toBeTruthy()
    expect(screen.getByText('probetraining.stage.INVITED')).toBeTruthy()
    expect(screen.getByText('probetraining.stage.SCHEDULED')).toBeTruthy()
    expect(screen.getByText('probetraining.fillApplication')).toBeTruthy()
    // The expired trial stays in the collapsed history until opened.
    expect(screen.queryByText('SV Werder 1919')).toBeNull()
    fireEvent.press(screen.getByLabelText('probetraining.historyToggle'))
    expect(screen.getByText('SV Werder 1919')).toBeTruthy()
  })

  it('accepts an invitation through the player endpoint', async () => {
    mockApi.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (options?.method === 'PATCH') return pipeline[0] as never
      return pipeline as never
    })
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    const screen = render(<ProbetrainingsTab />)

    fireEvent.press(await screen.findByLabelText('probetraining.acceptA11y|SV Albatros'))

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/trial-invites/invited', {
        method: 'PATCH',
        body: { status: 'ACCEPTED' },
      }),
    )
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled())
  })

  it('never leaves a stuck skeleton: an empty list shows how to start', async () => {
    mockApi.mockResolvedValue([] as never)
    const screen = render(<ProbetrainingsTab />)
    expect(await screen.findByText('probetraining.emptyTitle')).toBeTruthy()
  })

  it('shows a retryable error when loading fails', async () => {
    mockApi.mockRejectedValue(new Error('offline'))
    const screen = render(<ProbetrainingsTab />)
    expect(await screen.findByText('probetraining.loadError')).toBeTruthy()
  })
})
