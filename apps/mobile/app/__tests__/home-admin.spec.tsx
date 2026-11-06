import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { AdminInbox } from '@anstoss/shared'
import { AdminHome } from '../../src/components/home/AdminHome'

const mockPush = jest.fn()
const mockApi = jest.fn()

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useFocusEffect: jest.fn(),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'count' in options ? `${key}:${String(options.count)}` : key,
    i18n: { language: 'de' },
  }),
}))

jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {
    status = 500
  },
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    activeClub: { role: 'OWNER', club: { id: 'club-1', name: 'SV Albatros', slug: 'sv-albatros' } },
  }),
}))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('../../src/utils/haptics', () => ({
  Haptics: { tap: jest.fn(), select: jest.fn(), success: jest.fn(), warning: jest.fn(), error: jest.fn() },
}))
jest.mock('../../src/launchFeatures', () => ({ COMPLIANCE_FEATURE_ENABLED: true }))
jest.mock('../../src/i18n', () => ({ getAppLanguage: () => 'de', getAppLocale: () => 'de-DE' }))

function inbox(overrides: Partial<AdminInbox> = {}): AdminInbox {
  return {
    generatedAt: new Date().toISOString(),
    totalOpen: 10,
    memberCount: 126,
    teamCount: 8,
    joinRequests: {
      count: 2,
      items: [
        {
          id: 'jr-1',
          revision: 3,
          role: 'PLAYER',
          teamId: 'team-1',
          message: null,
          createdAt: new Date().toISOString(),
          user: { id: 'u-erik', name: 'Erik Brandt', avatarUrl: null },
        },
      ],
    },
    staffAccessRequests: { count: 0, items: [] },
    overdueDues: {
      count: 4,
      amount: 15000,
      currency: 'EUR',
      items: [{ memberUserId: 'u-tim', name: 'Tim Weber', amount: 2500, dueDate: null }],
    },
    teamsWithoutHeadCoach: {
      count: 1,
      items: [{ teamId: 'team-d', teamName: 'D-Jugend (U13)', groupName: 'Junioren' }],
    },
    safeguarding: {
      count: 1,
      items: [
        {
          memberUserId: 'u-stefan',
          name: 'Stefan Braun',
          teamNames: ['C-Jugend (U15)'],
          status: 'MISSING',
          expiresAt: null,
          recordId: null,
        },
      ],
    },
    unfilledOffices: { count: 1, items: [{ office: 'TREASURER' }] },
    ...overrides,
  }
}

function setup(data: AdminInbox | Error = inbox()) {
  mockApi.mockImplementation((path: string) => {
    if (path.endsWith('/admin-inbox')) {
      return data instanceof Error ? Promise.reject(data) : Promise.resolve(data)
    }
    if (path.includes('/events?')) {
      return Promise.resolve([
        {
          id: 'evt-1',
          title: 'SV Albatros – SV Babelsberg 03',
          date: new Date(Date.now() + 86400000).toISOString(),
          location: 'Sportplatz am See',
        },
      ])
    }
    return Promise.resolve({})
  })
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AdminHome clubId="club-1" />
    </SafeAreaProvider>,
  )
}

describe('AdminHome (Aufgaben inbox)', () => {
  beforeEach(() => {
    mockApi.mockReset()
    mockPush.mockReset()
  })

  it('shows a skeleton first, then the open-task count and club counts', async () => {
    const screen = setup()
    expect(screen.getByTestId('admin-home-skeleton')).toBeTruthy()
    // L7: the headline sums the rendered groups (2 + 0 + 4 + 1 + 1 + 1), not totalOpen.
    expect(await screen.findByText('aufgaben.openCount:9')).toBeTruthy()
    expect(screen.getByText('verein.memberCount:126 · verein.teamCount:8')).toBeTruthy()
    expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/admin-inbox')
  })

  it('groups the tasks with one primary action each', async () => {
    const screen = setup()
    await screen.findByText('Erik Brandt')
    expect(screen.getByText('aufgaben.joinRequests · 2')).toBeTruthy()
    expect(screen.getByText('aufgaben.duesTitle:4')).toBeTruthy()
    expect(screen.getByText('D-Jugend (U13)')).toBeTruthy()
    expect(screen.getByText('Stefan Braun')).toBeTruthy()
    expect(screen.getByText('aufgaben.officeUnfilled')).toBeTruthy()
  })

  it('approves an application inline with its revision', async () => {
    const screen = setup()
    await screen.findByText('Erik Brandt')
    fireEvent.press(screen.getByLabelText('pendingRequests.approve: Erik Brandt'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/join-requests/jr-1/approve', {
        method: 'POST',
        body: { revision: 3 },
      }),
    )
  })

  it('opens the request review when a player has no team', async () => {
    const data = inbox({
      joinRequests: { count: 1, items: [{
        id: 'jr-legacy', revision: 1, role: 'PLAYER', teamId: null,
        message: null, createdAt: new Date().toISOString(),
        user: { id: 'u-erik', name: 'Erik Brandt', avatarUrl: null },
      }] },
    })
    const screen = setup(data)
    await screen.findByText('Erik Brandt')
    fireEvent.press(screen.getByLabelText('pendingRequests.approve: Erik Brandt'))
    expect(mockPush).toHaveBeenCalledWith('/pending-requests')
    expect(mockApi).not.toHaveBeenCalledWith(
      '/clubs/club-1/join-requests/jr-legacy/approve', expect.anything(),
    )
  })

  it('sends overdue reminders and marks a Führungszeugnis as presented', async () => {
    const screen = setup()
    await screen.findByText('Stefan Braun')
    fireEvent.press(screen.getByLabelText('aufgaben.remindAllOverdue'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/contributions/reminders/send', {
        method: 'POST',
        body: { onlyOverdue: true },
      }),
    )
    fireEvent.press(screen.getByLabelText('aufgaben.fzPresented: Stefan Braun'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        '/clubs/club-1/compliance',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({ memberUserId: 'u-stefan', kind: 'FUEHRUNGSZEUGNIS' }),
        }),
      ),
    )
  })

  it('opens the coach sheet for a team without a head coach', async () => {
    const screen = setup()
    await screen.findByText('D-Jugend (U13)')
    fireEvent.press(screen.getByLabelText('aufgaben.assignCoach: D-Jugend (U13)'))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/team-management',
      params: { teamId: 'team-d' },
    })
  })

  it('shows the composed "all done" state and the footer when nothing is open', async () => {
    const empty = inbox({
      totalOpen: 0,
      joinRequests: { count: 0, items: [] },
      overdueDues: { count: 0, items: [], amount: 0, currency: 'EUR' },
      teamsWithoutHeadCoach: { count: 0, items: [] },
      safeguarding: { count: 0, items: [] },
      unfilledOffices: { count: 0, items: [] },
    })
    const screen = setup(empty)
    expect(await screen.findByText('aufgaben.allDoneHeadline')).toBeTruthy()
    expect(screen.getByText('aufgaben.shareInvite')).toBeTruthy()
    expect(await screen.findByText('SV Albatros – SV Babelsberg 03')).toBeTruthy()
  })

  it('resolves to an inline error with retry instead of a stuck skeleton', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const screen = setup(new Error('offline'))
    expect(await screen.findByText('aufgaben.loadError')).toBeTruthy()
    expect(screen.queryByTestId('admin-home-skeleton')).toBeNull()
  })
})
