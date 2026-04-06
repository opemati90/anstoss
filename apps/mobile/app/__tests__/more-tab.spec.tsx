import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { ScrollView, Text, TouchableOpacity } from 'react-native'
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
        'more.sectionClub': 'Verein',
        'more.sectionApp': 'App',
        'more.invitePlayers': 'Spieler einladen',
        'more.about': 'Über Anstoss',
        'clubStats.title': 'Vereinsstatistik',
        'more.signOut': 'Abmelden',
        'parentSchedule.title': 'Familienspielplan',
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
}))

jest.mock('expo-constants', () => ({
  expoConfig: {
    version: '1.0.0',
  },
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
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

function findButton(root: ReturnType<typeof renderer.create>, label: string) {
  const button = root.root.findAllByType(TouchableOpacity).find((node: any) =>
    node.findAllByType(Text).some((textNode: any) => collectText(textNode) === label),
  )

  if (!button) {
    throw new Error(`Button "${label}" not found`)
  }

  return button
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

  it('opens the invite composer from the invite players shortcut', () => {
    let tree: ReturnType<typeof renderer.create>

    act(() => {
      tree = renderer.create(<MoreScreen />)
    })

    act(() => {
      findButton(tree!, 'Spieler einladen').props.onPress()
    })

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/invite',
      params: { returnTo: '/(tabs)/more' },
    })
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
    expect(style.borderWidth).toBe(1)
    expect(style.borderRadius).toBe(8)
  })
})
