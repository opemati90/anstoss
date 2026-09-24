import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import type { FreeAgentProfile, PlayerSearch } from '@anstoss/shared'
import { FreeAgentHome, profileGap } from '../../src/components/home/FreeAgentHome'
import { api } from '../../src/api/client'
import { resetApiCache } from '../../src/features/wechsel/query'

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
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

const profile = {
  id: 'free-agent-profile-1',
  userId: 'user-1',
  position: 'GK',
  preferredFoot: 'RIGHT',
  city: 'Potsdam',
  bio: null,
  avatarUrl: null,
  isOnTransferList: true,
  visibility: 'CLUB_ONLY',
  postalCode: '14482',
  searchRadiusKm: 25,
  highestLeague: 'BEZIRKSLIGA',
  currentClubName: null,
  availableFrom: null,
  age: 25,
  experience: [],
  media: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  user: { id: 'user-1', name: 'Amir Kaya', avatarUrl: null },
} as unknown as FreeAgentProfile

const gesuch = {
  id: 'gesuch-albatros-torwart',
  clubId: 'club-1',
  teamId: 'team-2',
  positions: ['GK'],
  note: 'Herren II sucht Torwart, Kreisliga A.',
  status: 'OPEN',
  expiresAt: null,
  createdAt: '2026-09-20T10:00:00.000Z',
  club: { id: 'club-1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C', city: 'Potsdam' },
  team: { id: 'team-2', displayName: 'Herren II', leagueName: 'Kreisliga A', ageGroup: null },
  myTrialInviteId: null,
} as unknown as PlayerSearch

describe('profileGap', () => {
  it('asks for the facts clubs filter by, then for visibility', () => {
    expect(profileGap(null)).toBe('create')
    expect(profileGap({ ...profile, postalCode: null })).toBe('complete')
    expect(profileGap({ ...profile, isOnTransferList: false })).toBe('inactive')
    expect(profileGap(profile)).toBeNull()
  })
})

describe('FreeAgentHome (Entdecken)', () => {
  beforeEach(() => {
    resetApiCache()
    mockApi.mockReset()
  })

  it('lists Gesuche near the player filtered by their position and PLZ', async () => {
    mockApi.mockImplementation(async (path: string) => {
      if (path === '/me/free-agent-profile') return profile as never
      return { items: [gesuch], page: 1, pageSize: 30, total: 1 } as never
    })
    const screen = render(<FreeAgentHome />)

    expect(await screen.findByText('Herren II sucht Torwart, Kreisliga A.')).toBeTruthy()
    const searchCall = mockApi.mock.calls.find(([path]) => String(path).startsWith('/player-searches'))
    expect(searchCall?.[0]).toContain('position=GK')
    expect(searchCall?.[0]).toContain('postalCode=14482')
  })

  it('asks for a Probetraining from the card', async () => {
    mockApi.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (options?.method === 'POST') return { id: 'trial-new' } as never
      if (path === '/me/free-agent-profile') return profile as never
      return { items: [gesuch], page: 1, pageSize: 30, total: 1 } as never
    })
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    const screen = render(<FreeAgentHome />)

    fireEvent.press(await screen.findByText('entdecken.requestCta'))
    fireEvent.press(await screen.findByText('entdecken.requestSend'))

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/player-searches/gesuch-albatros-torwart/trial-requests', {
        method: 'POST',
        body: {},
      }),
    )
  })

  it('prompts a player without a profile to create one', async () => {
    mockApi.mockImplementation(async (path: string) => {
      if (path === '/me/free-agent-profile') return null as never
      return { items: [], page: 1, pageSize: 30, total: 0 } as never
    })
    const screen = render(<FreeAgentHome />)
    expect(await screen.findByText('entdecken.gap.create.title')).toBeTruthy()
    expect(await screen.findByText('entdecken.emptyTitle')).toBeTruthy()
  })
})
