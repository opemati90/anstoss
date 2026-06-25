import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Alert, Linking, ScrollView, Text } from 'react-native'
import MoreScreen from '../(tabs)/more/index'

const mockRouterPush = jest.fn()
const mockRouterReplace = jest.fn()
const mockSignOut = jest.fn(() => Promise.resolve())
const mockSetAuthExpiryHandlingSuspended = jest.fn()
const mockApi = jest.fn()
const mockWriteAsStringAsync = jest.fn(
  (_fileUri: string, _contents: string, _options?: unknown) => Promise.resolve(),
)
const mockShareAsync = jest.fn((_fileUri: string, _options?: unknown) =>
  Promise.resolve(),
)
const mockIsSharingAvailableAsync = jest.fn(() => Promise.resolve(true))

jest.mock('expo-router', () => ({
  router: {
    push: (...args: any[]) => mockRouterPush(...args),
    replace: (...args: any[]) => mockRouterReplace(...args),
    dismissTo: jest.fn(),
  },
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'more.title': 'Mehr',
        'more.sectionApp': 'Einstellungen',
        'more.sectionLegal': 'Konto',
        'notificationSettings.title': 'Benachrichtigungen',
        'more.language': 'Sprache',
        'more.exportData': 'Meine Daten exportieren',
        'more.about': 'Über Anstoss',
        'more.signOut': 'Abmelden',
        'accountNextStep.editProfileAction': 'Profil bearbeiten',
      }

      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      name: 'QA Admin',
      email: 'qa@example.com',
    },
    activeClub: {
      role: 'OWNER',
      club: {
        id: 'club-1',
        name: 'FC QA',
      },
    },
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
  setAuthExpiryHandlingSuspended: (...args: unknown[]) =>
    mockSetAuthExpiryHandlingSuspended(...args),
}))

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: (fileUri: string, contents: string, options?: unknown) =>
    mockWriteAsStringAsync(fileUri, contents, options),
}))

jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockIsSharingAvailableAsync(),
  shareAsync: (fileUri: string, options?: unknown) => mockShareAsync(fileUri, options),
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    clubPrimary: '#1E3A5F',
    clubPrimaryLight: '#DDE7F1',
  }),
  useIsDark: () => false,
}))

jest.mock('expo-constants', () => ({
  expoConfig: {
    version: '1.0.0',
  },
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('../../src/utils/haptics', () => ({
  Haptics: {
    tap: jest.fn(),
    select: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('../../src/i18n', () => ({
  setAppLanguage: jest.fn(() => Promise.resolve()),
  getAppLanguage: jest.fn(() => 'de'),
  getLanguageLabel: jest.fn((lang: string) => lang === 'de' ? 'Deutsch' : 'English'),
}))

function collectText(node: any): string {
  if (typeof node === 'string') return node
  if (!node?.children) return ''
  return node.children.map((child: any) => collectText(child)).join('')
}

function flattenStyle(style: any): any {
  if (typeof style === 'function') return flattenStyle(style({ pressed: false }))
  if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(flattenStyle))
  return style ?? {}
}

describe('MoreScreen', () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  const openUrlSpy = jest
    .spyOn(Linking, 'openURL')
    .mockResolvedValue({} as never)

  beforeEach(() => {
    jest.clearAllMocks()
    mockSignOut.mockResolvedValue(undefined)
    mockApi.mockResolvedValue({})
    mockWriteAsStringAsync.mockResolvedValue(undefined)
    mockIsSharingAvailableAsync.mockResolvedValue(true)
    mockShareAsync.mockResolvedValue(undefined)
  })

  afterAll(() => {
    alertSpy.mockRestore()
    openUrlSpy.mockRestore()
  })

  it('keeps More focused on personal settings instead of club operations', () => {
    let tree: ReturnType<typeof renderer.create>

    act(() => {
      tree = renderer.create(<MoreScreen />)
    })

    const textContent = tree!.root.findAllByType(Text).map((node: any) => collectText(node))

    expect(textContent).toContain('Benachrichtigungen')
    expect(textContent).toContain('Sprache')
    expect(textContent).toContain('Meine Daten exportieren')
    expect(textContent).not.toContain('Spieler einladen')
    expect(textContent).not.toContain('Vereinsstatistik')
  })

  it('keeps the bottom clearance above the tab bar compact', () => {
    let tree: ReturnType<typeof renderer.create>

    act(() => {
      tree = renderer.create(<MoreScreen />)
    })

    const scrollView = tree!.root.findByType(ScrollView)
    const style = flattenStyle(scrollView.props.contentContainerStyle)

    expect(style.paddingBottom).toBe(48)
  })

  it('renders the sign-out action as a destructive editorial row', () => {
    let tree: ReturnType<typeof renderer.create>

    act(() => {
      tree = renderer.create(<MoreScreen />)
    })

    const signOutRow = tree!.root.findByProps({ accessibilityLabel: 'Abmelden' })
    expect(signOutRow).toBeTruthy()
  })

  it('routes to the signed-out welcome screen immediately after confirmed logout', () => {
    let tree: ReturnType<typeof renderer.create>
    mockSignOut.mockReturnValueOnce(new Promise(() => {}))

    act(() => {
      tree = renderer.create(<MoreScreen />)
    })

    const signOutRow = tree!.root.findByProps({ accessibilityLabel: 'Abmelden' })

    act(() => {
      signOutRow.props.onPress()
    })

    const buttons = alertSpy.mock.calls[0][2] as Array<{ onPress?: () => void }>

    act(() => {
      buttons[1].onPress?.()
    })

    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/welcome')
    expect(mockSetAuthExpiryHandlingSuspended).toHaveBeenCalledWith(true)
  })

  it('resumes session-expiry handling when logout is cancelled', () => {
    let tree: ReturnType<typeof renderer.create>

    act(() => {
      tree = renderer.create(<MoreScreen />)
    })

    const signOutRow = tree!.root.findByProps({ accessibilityLabel: 'Abmelden' })

    act(() => {
      signOutRow.props.onPress()
    })

    const buttons = alertSpy.mock.calls[0][2] as Array<{ onPress?: () => void }>

    act(() => {
      buttons[0].onPress?.()
    })

    expect(mockSignOut).not.toHaveBeenCalled()
    expect(mockRouterReplace).not.toHaveBeenCalled()
    expect(mockSetAuthExpiryHandlingSuspended).toHaveBeenNthCalledWith(1, true)
    expect(mockSetAuthExpiryHandlingSuspended).toHaveBeenNthCalledWith(2, false)
  })

  it('exports account data as a shared JSON file', async () => {
    let tree: ReturnType<typeof renderer.create>
    mockApi.mockResolvedValueOnce({ profile: { email: 'qa@example.com' } })

    act(() => {
      tree = renderer.create(<MoreScreen />)
    })

    const exportRow = tree!.root.findByProps({ accessibilityLabel: 'Meine Daten exportieren' })

    await act(async () => {
      await exportRow.props.onPress()
    })

    expect(mockApi).toHaveBeenCalledWith('/me/export')
    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/cache\/anstoss-data-export-\d+\.json$/),
      expect.stringContaining('"qa@example.com"'),
      { encoding: 'utf8' },
    )
    expect(mockShareAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/cache\/anstoss-data-export-\d+\.json$/),
      expect.objectContaining({ mimeType: 'application/json' }),
    )
    expect(openUrlSpy).not.toHaveBeenCalled()
  })

  it('does not open the manual export mail when auth has expired', async () => {
    let tree: ReturnType<typeof renderer.create>
    const { ApiError } = require('../../src/api/client') as {
      ApiError: new (message: string, status: number) => Error & { status: number }
    }
    mockApi.mockRejectedValueOnce(new ApiError('expired', 401))

    act(() => {
      tree = renderer.create(<MoreScreen />)
    })

    const exportRow = tree!.root.findByProps({ accessibilityLabel: 'Meine Daten exportieren' })

    await act(async () => {
      await exportRow.props.onPress()
    })

    expect(openUrlSpy).not.toHaveBeenCalled()
    expect(mockShareAsync).not.toHaveBeenCalled()
  })

  it('shows an error instead of opening support mail for server export failures', async () => {
    let tree: ReturnType<typeof renderer.create>
    const { ApiError } = require('../../src/api/client') as {
      ApiError: new (message: string, status: number) => Error & { status: number }
    }
    mockApi.mockRejectedValueOnce(new ApiError('server down', 500))

    act(() => {
      tree = renderer.create(<MoreScreen />)
    })

    const exportRow = tree!.root.findByProps({ accessibilityLabel: 'Meine Daten exportieren' })

    await act(async () => {
      await exportRow.props.onPress()
    })

    expect(alertSpy).toHaveBeenCalledWith('common.error', 'more.exportError')
    expect(openUrlSpy).not.toHaveBeenCalled()
  })
})
