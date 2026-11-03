// club-admin review fixes: server-side member export (H1/H2) and the
// admin-mode guard on the Verein tab (M5).
import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import VereinScreen from '../(tabs)/verein/index'

const mockApi = jest.fn()
const mockRedirect = jest.fn()
const mockWrite = jest.fn()
const mockDelete = jest.fn()
const mockShare = jest.fn()
let mockSharingAvailable = true
let mockRoleMode: string | null = null

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
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
    activeRoleMode: mockRoleMode,
    activeClub: {
      role: 'OWNER',
      operationalRoles: [],
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
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: (...args: unknown[]) => mockWrite(...args),
  deleteAsync: (...args: unknown[]) => mockDelete(...args),
}))
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => Promise.resolve(mockSharingAvailable),
  shareAsync: (...args: unknown[]) => mockShare(...args),
}))
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('../../src/utils/haptics', () => ({
  Haptics: { tap: jest.fn(), select: jest.fn(), success: jest.fn(), warning: jest.fn(), error: jest.fn() },
}))
jest.mock('../../src/launchFeatures', () => ({ COMPLIANCE_FEATURE_ENABLED: false, OPTIONAL_CLUB_FEATURES: { marketplace: false, statistics: false, sponsorship: false } }))
jest.mock('../../src/i18n', () => ({ getAppLanguage: () => 'de', getAppLocale: () => 'de-DE' }))

const EXPORT = {
  fileName: 'sv-albatros-mitglieder-2026-09-24.csv',
  csv: '﻿"Name";"Rolle"\r\n',
  rowCount: 1,
  includeEmails: false,
}

function renderScreen() {
  mockApi.mockImplementation((path: string) => {
    if (path.includes('/members/export')) return Promise.resolve(EXPORT)
    if (path.endsWith('/chat/retention')) {
      return Promise.resolve({ enabled: false, messageRetentionDays: 365, attachmentRetentionDays: 365 })
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

type AlertButton = { text?: string; onPress?: () => void }
function pressAlertButton(callIndex: number, text: string) {
  const buttons = (jest.mocked(Alert.alert).mock.calls[callIndex]?.[2] ?? []) as AlertButton[]
  const button = buttons.find((entry) => entry.text === text)
  if (!button?.onPress) throw new Error(`no alert button ${text}`)
  button.onPress()
}

describe('Verein member export', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    mockApi.mockReset()
    mockWrite.mockReset().mockResolvedValue(undefined)
    mockDelete.mockReset().mockResolvedValue(undefined)
    mockShare.mockReset().mockResolvedValue(undefined)
    mockRedirect.mockReset()
    mockSharingAvailable = true
    mockRoleMode = null
  })
  afterEach(() => jest.restoreAllMocks())

  it('asks first and exports without emails by default', async () => {
    const screen = renderScreen()
    fireEvent.press(screen.getByText('verein.settings.export'))
    expect(Alert.alert).toHaveBeenCalledWith(
      'verein.export.confirmTitle',
      'verein.export.confirmBody',
      expect.any(Array),
    )
    expect(mockApi).not.toHaveBeenCalledWith(expect.stringContaining('/members/export'))
    pressAlertButton(0, 'verein.export.withoutEmails')
    await waitFor(() => expect(mockShare).toHaveBeenCalled())
    expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/members/export')
    expect(mockWrite).toHaveBeenCalledWith(
      'file:///cache/sv-albatros-mitglieder-2026-09-24.csv',
      EXPORT.csv,
      { encoding: 'utf8' },
    )
    // The file is removed once the share sheet resolves.
    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith('file:///cache/sv-albatros-mitglieder-2026-09-24.csv', {
        idempotent: true,
      }),
    )
    expect(mockDelete.mock.invocationCallOrder[0]).toBeGreaterThan(mockShare.mock.invocationCallOrder[0])
  })

  it('needs a second confirmation before including emails', async () => {
    const screen = renderScreen()
    fireEvent.press(screen.getByText('verein.settings.export'))
    pressAlertButton(0, 'verein.export.withEmails')
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'verein.export.emailsConfirmTitle',
      'verein.export.emailsConfirmBody',
      expect.any(Array),
    )
    expect(mockApi).not.toHaveBeenCalledWith(expect.stringContaining('/members/export'))
    pressAlertButton(1, 'verein.export.emailsConfirm')
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/members/export?includeEmails=true'),
    )
  })

  it('deletes the file even when sharing fails and shows an error', async () => {
    mockShare.mockRejectedValueOnce(new Error('cancelled'))
    const screen = renderScreen()
    fireEvent.press(screen.getByText('verein.settings.export'))
    pressAlertButton(0, 'verein.export.withoutEmails')
    await waitFor(() => expect(mockDelete).toHaveBeenCalled())
    expect(Alert.alert).toHaveBeenLastCalledWith('common.errorTitle', 'verein.export.error')
  })

  it('shows an error instead of pasting the CSV into a text share when sharing is unavailable', async () => {
    mockSharingAvailable = false
    const screen = renderScreen()
    fireEvent.press(screen.getByText('verein.settings.export'))
    pressAlertButton(0, 'verein.export.withoutEmails')
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith('common.errorTitle', 'verein.export.shareUnavailable'),
    )
    expect(mockApi).not.toHaveBeenCalledWith(expect.stringContaining('/members/export'))
    expect(mockWrite).not.toHaveBeenCalled()
  })
})

describe('Verein tab outside admin mode (M5)', () => {
  it('redirects home when the admin switched to coach mode', () => {
    mockRoleMode = 'COACH'
    renderScreen()
    expect(mockRedirect).toHaveBeenCalledWith('/(tabs)')
  })

  it('stays when the mode is admin', () => {
    mockRedirect.mockReset()
    mockRoleMode = 'ADMIN'
    renderScreen()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
