import React from 'react'
import { Alert, Linking } from 'react-native'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import MoreScreen from '../(tabs)/more/index'

const mockRouterPush = jest.fn()
const mockRouterReplace = jest.fn()
const mockSignOut = jest.fn(() => Promise.resolve())
const mockSetAuthExpiryHandlingSuspended = jest.fn()
const mockApi = jest.fn()
const mockUseStreaks = jest.fn((_options?: unknown) => ({ data: null }))
const mockWriteAsStringAsync = jest.fn((..._args: unknown[]) => Promise.resolve())
const mockShareAsync = jest.fn((..._args: unknown[]) => Promise.resolve())

type MockAuth = {
  role: string
  mode: string | null
  modes: string[]
  memberships: number
  registrationRole: string
  team: { role: string; team: { displayName: string } } | null
  hasClub: boolean
}
let mockAuth: MockAuth
let mockChildren: Array<{ id: string; name: string; team: string }> = []

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockRouterPush(...args),
    replace: (...args: unknown[]) => mockRouterReplace(...args),
  },
  useFocusEffect: jest.fn(),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'version' in options ? `${key}:${String(options.version)}` : key,
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u-1',
      name: 'Mara Schulte',
      email: 'mara@sv-albatros.example',
      avatarUrl: null,
      registrationRole: mockAuth.registrationRole,
    },
    activeClub: mockAuth.hasClub
      ? { role: mockAuth.role, operationalRoles: [], club: { id: 'club-1', name: 'SV Albatros' } }
      : null,
    activeTeamAccess: mockAuth.team,
    memberships: Array.from({ length: mockAuth.memberships }, (_, i) => ({ id: `m-${i}` })),
    activeRoleMode: mockAuth.mode,
    availableRoleModes: mockAuth.modes,
    setActiveRoleMode: jest.fn(),
    refreshUser: jest.fn(),
    signOut: mockSignOut,
  }),
}))

jest.mock('../../src/api/client', () => ({
  ApiError: class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
  api: (...args: unknown[]) => mockApi(...args),
  setAuthExpiryHandlingSuspended: (...args: unknown[]) => mockSetAuthExpiryHandlingSuspended(...args),
}))

jest.mock('../../src/hooks/useStreaks', () => ({
  useStreaks: (options?: unknown) => mockUseStreaks(options),
}))
jest.mock('../../src/components/home/childrenSummary', () => ({
  useChildrenSummary: () => mockChildren,
}))
jest.mock('../../src/components/profile/VerifiedPlayerCard', () => ({
  VerifiedPlayerCard: () => {
    const { Text } = require('react-native')
    return <Text>player-card</Text>
  },
}))
jest.mock('../../src/components/ClubSwitcher', () => ({ ClubSwitcher: () => null }))
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
}))
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => Promise.resolve(true),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' } }))
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('../../src/utils/haptics', () => ({
  Haptics: { tap: jest.fn(), select: jest.fn(), success: jest.fn(), warning: jest.fn(), error: jest.fn() },
}))
jest.mock('../../src/i18n', () => ({
  getAppLanguage: jest.fn(() => 'de'),
  getLanguageLabel: jest.fn(() => 'Deutsch'),
}))

function renderMore(overrides: Partial<MockAuth> = {}) {
  mockAuth = {
    role: 'PLAYER',
    mode: null,
    modes: [],
    memberships: 1,
    registrationRole: 'PLAYER',
    team: { role: 'PLAYER', team: { displayName: 'Herren I' } },
    hasClub: true,
    ...overrides,
  }
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <MoreScreen />
    </SafeAreaProvider>,
  )
}

describe('Profile tab', () => {
  let alertSpy: jest.SpyInstance
  beforeEach(() => {
    jest.clearAllMocks()
    mockChildren = []
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  })

  it('players keep the player card with streaks', () => {
    const screen = renderMore()
    expect(screen.getByText('player-card')).toBeTruthy()
    expect(mockUseStreaks).toHaveBeenCalledWith({ enabled: true })
  })

  it('coaches see a team card, not streaks', () => {
    const screen = renderMore({
      role: 'COACH',
      team: { role: 'HEAD_COACH', team: { displayName: 'Herren I' } },
    })
    expect(screen.queryByText('player-card')).toBeNull()
    expect(screen.getByTestId('profile-card-coach')).toBeTruthy()
    expect(screen.getByText('Herren I · teamRoles.HEAD_COACH')).toBeTruthy()
    expect(mockUseStreaks).toHaveBeenCalledWith({ enabled: false })
  })

  it('parents see "Meine Kinder"', () => {
    mockChildren = [{ id: 'kid-1', name: 'Leo', team: 'E-Jugend (U11)' }]
    const screen = renderMore({ role: 'PARENT', team: null })
    expect(screen.getByText('profileHub.myChildren')).toBeTruthy()
    expect(screen.getByText('Leo')).toBeTruthy()
    expect(screen.queryByText('player-card')).toBeNull()
  })

  it('admins get the Verein shortcut and owners the club handover', () => {
    const screen = renderMore({ role: 'OWNER', mode: 'ADMIN', team: null })
    fireEvent.press(screen.getByText('profileHub.openVerein'))
    expect(mockRouterPush).toHaveBeenCalledWith('/(tabs)/verein')
    expect(screen.getByText('ownership.title')).toBeTruthy()
    expect(screen.queryByText('player-card')).toBeNull()
  })

  it('hides the club handover for everyone but the owner', () => {
    const screen = renderMore({ role: 'ADMIN', mode: 'ADMIN', team: null })
    expect(screen.queryByText('ownership.title')).toBeNull()
  })

  it('routes "create club" to the club setup wizard', () => {
    const screen = renderMore({ role: 'OWNER', mode: 'ADMIN', team: null })
    fireEvent.press(screen.getByText('club.createClub'))
    expect(mockRouterPush).toHaveBeenCalledWith('/club-setup')
  })

  it('has the account, club, app and data sections with appearance', () => {
    const screen = renderMore()
    for (const key of [
      'profileHub.sectionAccount',
      'profileHub.sectionClub',
      'profileHub.sectionApp',
      'profileHub.sectionData',
      'profileHub.editProfile',
      'notificationSettings.title',
      'contributions.myTitle',
      'more.language',
      'profileHub.appearance',
      'more.legal',
    ]) {
      expect(screen.getByText(key)).toBeTruthy()
    }
    expect(screen.queryByText('rankings.title')).toBeNull()
  })

  it('signs out only after confirmation and resumes expiry handling on cancel', () => {
    const screen = renderMore()
    fireEvent.press(screen.getByText('more.signOut'))
    expect(mockSetAuthExpiryHandlingSuspended).toHaveBeenCalledWith(true)
    const buttons = alertSpy.mock.calls[0][2] as Array<{ style?: string; onPress?: () => void }>
    buttons.find((b) => b.style === 'cancel')?.onPress?.()
    expect(mockSetAuthExpiryHandlingSuspended).toHaveBeenLastCalledWith(false)
    buttons.find((b) => b.style === 'destructive')?.onPress?.()
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/welcome')
  })

  it('exports account data as a shared JSON file', async () => {
    mockApi.mockResolvedValue({ user: { id: 'u-1' } })
    const screen = renderMore()
    fireEvent.press(screen.getByText('more.exportData'))
    await waitFor(() => expect(mockShareAsync).toHaveBeenCalled())
    expect(mockApi).toHaveBeenCalledWith('/me/export')
    expect(mockWriteAsStringAsync).toHaveBeenCalled()
  })
})
