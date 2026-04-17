import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { ScrollView, Text, View } from 'react-native'
import HomeScreen from '../(tabs)/index'
import { FALLBACK_THEME } from '../../src/theme/club-theme'

const mockRouterPush = jest.fn()
const mockTheme = {
  ...FALLBACK_THEME,
  clubPrimary: '#1E3A5F',
  clubPrimaryLight: '#DDE7F1',
  primary: '#1E3A5F',
  primary50: '#DDE7F1',
}
const mockClubStats = {
  memberCount: 18,
  teamCount: 6,
  upcomingEventCount: 12,
  overallRsvpRate: 84,
}

jest.mock('expo-router', () => ({
  router: {
    push: (...args: any[]) => mockRouterPush(...args),
  },
  useFocusEffect: (callback: () => void) => {
    const React = require('react')
    React.useEffect(() => {
      callback()
    }, [callback])
  },
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'home.pendingTrialsTitle') {
        return `${options?.count} pending trials`
      }

      const map: Record<string, string> = {
        'home.greetingMorning': 'Guten Morgen',
        'home.greetingAfternoon': 'Guten Tag',
        'home.greetingEvening': 'Guten Abend',
        'home.fallbackName': 'Spieler',
        'roles.OWNER': 'Super Admin',
        'teamRoles.HEAD_COACH': 'Cheftrainer',
        'home.nextEvent': 'Nächster Termin',
        'home.quickActions': 'Schnellzugriffe',
        'adminDashboard.clubOverview': 'Vereinsüberblick',
        'adminDashboard.members': 'Mitglieder',
        'adminDashboard.teams': 'Mannschaften',
        'tabs.events': 'Termine',
        'home.actionEvents': 'Termine',
        'home.actionChat': 'Chat',
        'home.actionRoster': 'Kader',
        'home.actionFussball': 'Spiel-Sync',
        'home.pendingTrialsEyebrow': 'Trials',
        'home.pendingTrialsBody': 'Body',
        'home.reviewTrialsCta': 'Prüfen',
        'home.noUpcomingEventsTitle': 'Keine Termine',
        'home.noUpcomingEventsBody': 'Leer',
        'home.openSchedule': 'Plan öffnen',
        'adminDashboard.title': 'Verwaltung',
      }

      return map[key] ?? key
    },
    i18n: {
      resolvedLanguage: 'de',
    },
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      name: 'QA Admin',
    },
    activeClub: {
      role: 'OWNER',
      club: {
        id: 'club-1',
        name: 'FC QA',
        badgeUrl: null,
      },
    },
    activeTeamId: 'team-1',
    activeTeamAccess: {
      role: 'HEAD_COACH',
      team: {
        displayName: 'Herren I',
      },
    },
    teamsForActiveClub: [],
  }),
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => mockTheme,
  useIsDark: () => false,
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn((path: string) => {
    if (path.includes('/stats')) {
      return Promise.resolve(mockClubStats)
    }

    return Promise.resolve([])
  }),
}))

jest.mock('../../src/utils/cache', () => ({
  staleWhileRevalidate: <T,>(_key: string, fetcher: () => Promise<T>) => fetcher(),
}))

jest.mock('../../src/components/EmptyState', () => ({
  EmptyState: () => null,
}))

jest.mock('../../src/components/TeamSwitcher', () => ({
  TeamSwitcher: () => null,
}))

jest.mock('../../src/components/EventFilter', () => ({
  EventFilter: () => null,
}))


jest.mock('../../src/i18n', () => ({
  getAppLanguage: () => 'de',
  getAppLocale: () => 'de-DE',
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
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

describe('HomeScreen stats layout', () => {
  it('renders a compact administration summary strip on home', async () => {
    let tree: ReturnType<typeof renderer.create>

    await act(async () => {
      tree = renderer.create(<HomeScreen />)
    })

    const textNodes = tree!.root.findAllByType(Text)
    const membersLabel = textNodes.find((node: any) => collectText(node) === 'Mitglieder')
    const teamsLabel = textNodes.find((node: any) => collectText(node) === 'Mannschaften')
    const upcomingLabel = textNodes.find((node: any) => collectText(node) === 'Termine')
    const summaryRow = tree!.root.findAllByType(View).find((node: any) => {
      const style = flattenStyle(node.props.style)
      return style?.flexDirection === 'row' && style?.paddingHorizontal != null && style?.gap != null
    })
    const adminEntry = tree!.root.findAllByProps({ accessibilityLabel: 'Verwaltung' })

    expect(membersLabel).toBeTruthy()
    expect(teamsLabel).toBeTruthy()
    expect(upcomingLabel).toBeTruthy()
    expect(summaryRow).toBeTruthy()
    expect(adminEntry.length).toBeGreaterThan(0)
  })

  it('keeps owner copy ahead of head-coach copy for club founders', async () => {
    let tree: ReturnType<typeof renderer.create>

    await act(async () => {
      tree = renderer.create(<HomeScreen />)
    })

    const textContent = tree!.root
      .findAllByType(Text)
      .map((node: any) => collectText(node))

    expect(textContent).toContain('Super Admin')
    expect(textContent).not.toContain('Herren I · Cheftrainer')
    expect(textContent).not.toContain('Cheftrainer')
  })

  it('uses compact bottom clearance above the tab bar', async () => {
    let tree: ReturnType<typeof renderer.create>

    await act(async () => {
      tree = renderer.create(<HomeScreen />)
    })

    const scrollView = tree!.root.findByType(ScrollView)
    const style = flattenStyle(scrollView.props.contentContainerStyle)

    expect(style.paddingBottom).toBe(24)
  })
})
