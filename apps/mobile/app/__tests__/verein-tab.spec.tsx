import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { AdminInbox } from '@anstoss/shared'
import VereinScreen from '../(tabs)/verein/index'
import AdminDashboardRedirect from '../admin-dashboard'
import AdminChatRetentionRedirect from '../admin-chat-retention'
import MeRedirect from '../me'

const mockPush = jest.fn()
const mockApi = jest.fn()
const mockRedirect = jest.fn()
let mockRole = 'OWNER'
let mockOps: string[] = []

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => cb(), [cb])
  },
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href)
    return null
  },
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
  ApiError: class ApiError extends Error {},
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    activeClub: {
      role: mockRole,
      operationalRoles: mockOps,
      club: { id: 'club-1', name: 'SV Albatros', slug: 'sv-albatros', badgeUrl: null },
    },
  }),
}))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})

jest.mock('../../src/hooks/useEntitlements', () => ({
  useEntitlements: () => ({ plan: 'FOUNDATION', has: () => true, refresh: jest.fn() }),
}))
jest.mock('../../src/components/home/AnnounceSheet', () => ({ AnnounceSheet: () => null }))
jest.mock('../../src/components/billing/PaywallSheet', () => ({ PaywallSheet: () => null }))
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: null, EncodingType: { UTF8: 'utf8' } }))
jest.mock('expo-sharing', () => ({ isAvailableAsync: () => Promise.resolve(false) }))
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('../../src/utils/haptics', () => ({
  Haptics: { tap: jest.fn(), select: jest.fn(), success: jest.fn(), warning: jest.fn(), error: jest.fn() },
}))
jest.mock('../../src/launchFeatures', () => ({ COMPLIANCE_FEATURE_ENABLED: true }))
jest.mock('../../src/i18n', () => ({ getAppLanguage: () => 'de', getAppLocale: () => 'de-DE' }))

const INBOX: AdminInbox = {
  generatedAt: '2026-09-23T10:00:00.000Z',
  totalOpen: 10,
  memberCount: 126,
  teamCount: 8,
  joinRequests: { count: 2, items: [] },
  staffAccessRequests: { count: 0, items: [] },
  overdueDues: { count: 4, amount: 15000, currency: 'EUR', items: [] },
  teamsWithoutHeadCoach: { count: 1, items: [] },
  safeguarding: { count: 2, items: [] },
  unfilledOffices: { count: 1, items: [{ office: 'TREASURER' }] },
}

let retention = { enabled: false, messageRetentionDays: 365, attachmentRetentionDays: 365 }

function renderScreen() {
  mockApi.mockImplementation((path: string, init?: { method?: string; body?: unknown }) => {
    if (path.endsWith('/admin-inbox')) return Promise.resolve(INBOX)
    if (path.endsWith('/chat/retention')) {
      if (init?.method === 'PATCH') {
        retention = { ...retention, ...(init.body as object) }
      }
      return Promise.resolve(retention)
    }
    return Promise.resolve([])
  })
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <VereinScreen />
    </SafeAreaProvider>,
  )
}

describe('Verein tab', () => {
  beforeEach(() => {
    mockApi.mockReset()
    mockPush.mockReset()
    mockRedirect.mockReset()
    mockRole = 'OWNER'
    mockOps = []
    retention = { enabled: false, messageRetentionDays: 365, attachmentRetentionDays: 365 }
  })

  it('shows the club header with a human role label and one member count', async () => {
    const screen = renderScreen()
    expect(screen.getByText('SV Albatros')).toBeTruthy()
    expect(screen.getByText('verein.roleLabel.OWNER')).toBeTruthy()
    expect(await screen.findByText('verein.memberCount:126 · verein.teamCount:8')).toBeTruthy()
    expect(screen.queryByText(/SUPER/i)).toBeNull()
  })

  it('labels a treasurer as Kassenwart', () => {
    mockRole = 'ADMIN'
    mockOps = ['TREASURER']
    const screen = renderScreen()
    expect(screen.getByText('verein.roleLabel.TREASURER')).toBeTruthy()
  })

  it('pushes each workspace screen instead of opening modals', async () => {
    const screen = renderScreen()
    await screen.findByText('verein.memberCount:126 · verein.teamCount:8')
    fireEvent.press(screen.getByText('verein.members.list'))
    fireEvent.press(screen.getByText('verein.teams.manage'))
    fireEvent.press(screen.getByText('verein.finance.dues'))
    fireEvent.press(screen.getByText('verein.safeguarding.certificates'))
    fireEvent.press(screen.getByText('verein.safeguarding.offices'))
    expect(mockPush.mock.calls.map((call) => call[0])).toEqual([
      '/admin-members',
      '/team-management',
      '/admin-billing',
      '/compliance',
      '/club-staff',
    ])
  })

  it('shows the club handover to the owner only', () => {
    const owner = renderScreen()
    expect(owner.getByText('verein.settings.handover')).toBeTruthy()
    owner.unmount()
    mockRole = 'ADMIN'
    const admin = renderScreen()
    expect(admin.queryByText('verein.settings.handover')).toBeNull()
  })

  it('redirects members without admin rights back to home', () => {
    mockRole = 'PLAYER'
    renderScreen()
    expect(mockRedirect).toHaveBeenCalledWith('/(tabs)')
  })

  it('sets chat retention from a single picker row, confirming before deleting', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.()
    })
    const screen = renderScreen()
    await waitFor(() => expect(screen.getByText('verein.retention.forever')).toBeTruthy())
    fireEvent.press(screen.getByTestId('chat-retention-row'))
    fireEvent.press(await screen.findByText('verein.retention.years:1'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/chat/retention', {
        method: 'PATCH',
        body: { enabled: true, messageRetentionDays: 365, attachmentRetentionDays: 365 },
      }),
    )
    expect(alertSpy).toHaveBeenCalled()
  })
})

describe('retired routes redirect', () => {
  beforeEach(() => mockRedirect.mockReset())

  it('sends /admin-dashboard and /admin-chat-retention to the Verein tab and /me to Profile', () => {
    render(<AdminDashboardRedirect />)
    render(<AdminChatRetentionRedirect />)
    render(<MeRedirect />)
    expect(mockRedirect.mock.calls.map((call) => call[0])).toEqual([
      '/(tabs)/verein',
      '/(tabs)/verein',
      '/(tabs)/more',
    ])
  })
})
