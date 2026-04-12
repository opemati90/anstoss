import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { ScrollView, Text, StyleSheet } from 'react-native'
import MoreScreen from '../(tabs)/more/index'

const mockRouterPush = jest.fn()

jest.mock('expo-router', () => ({
  router: {
    push: (...args: any[]) => mockRouterPush(...args),
    replace: jest.fn(),
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
    signOut: jest.fn(() => Promise.resolve()),
  }),
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

function flattenStyle(style: any) {
  return Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean))
    : style
}

describe('MoreScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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

    expect(style.paddingBottom).toBe(24)
  })

  it('renders the sign-out action as a compact outlined button', () => {
    let tree: ReturnType<typeof renderer.create>

    act(() => {
      tree = renderer.create(<MoreScreen />)
    })

    const signOutButton = tree!.root.findByProps({ testID: 'more-sign-out' })
    const style = flattenStyle(signOutButton.props.style)

    expect(style.minHeight).toBe(48)
    expect(style.borderWidth).toBe(StyleSheet.hairlineWidth)
    expect(style.borderRadius).toBe(16)
  })
})
