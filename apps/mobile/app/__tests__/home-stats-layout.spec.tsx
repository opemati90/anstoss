import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Text, View } from 'react-native'
import HomeScreen from '../(tabs)/index'

const mockRouterPush = jest.fn()
const mockTheme = {
  clubPrimary: '#1E3A5F',
  clubPrimaryLight: '#DDE7F1',
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
        'roles.OWNER': 'OWNER',
        'clubStats.members': 'Mitglieder',
        'clubStats.teams': 'Mannschaften',
        'clubStats.upcomingEvents': 'Anstehende Events',
        'clubStats.rsvpRate': 'Rückmeldequote',
        'home.actionEvents': 'Termine',
        'home.actionChat': 'Chat',
        'home.actionRoster': 'Kader',
        'home.actionFussball': 'Spiel-Sync',
        'home.pendingTrialsEyebrow': 'Trials',
        'home.pendingTrialsBody': 'Body',
        'home.reviewTrialsCta': 'Prüfen',
        'home.nextEventEyebrow': 'Als Nächstes',
        'home.nextFixtureEyebrow': 'Fixture',
        'home.noUpcomingEventsTitle': 'Keine Termine',
        'home.noUpcomingEventsBody': 'Leer',
        'home.noUpcomingEventsCta': 'Erstellen',
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
      role: 'OWNER',
      team: {
        displayName: 'Herren I',
      },
    },
    teamsForActiveClub: [],
  }),
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => mockTheme,
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

jest.mock('../../src/components/IllustratedEmptyState', () => ({
  IllustratedEmptyState: () => null,
}))

jest.mock('../../src/components/TeamSwitcher', () => ({
  TeamSwitcher: () => null,
}))

jest.mock('../../src/components/EventFilter', () => ({
  EventFilter: () => null,
}))

jest.mock('../../src/illustrations', () => ({
  illustrations: {
    emptyEvents: 1,
    emptyCalendar: 2,
  },
}))

jest.mock('../../src/i18n', () => ({
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
  it('renders dashboard stat labels with multi-line protection in a wrapped grid', async () => {
    let tree: ReturnType<typeof renderer.create>

    await act(async () => {
      tree = renderer.create(<HomeScreen />)
    })

    const textNodes = tree!.root.findAllByType(Text)
    const membersLabel = textNodes.find((node: any) => collectText(node) === 'Mitglieder')
    const teamsLabel = textNodes.find((node: any) => collectText(node) === 'Mannschaften')
    const statsRow = tree!.root.findAllByType(View).find((node: any) => {
      const style = flattenStyle(node.props.style)
      return style?.flexWrap === 'wrap' && style?.justifyContent === 'space-between'
    })

    expect(membersLabel?.props.numberOfLines).toBe(2)
    expect(teamsLabel?.props.numberOfLines).toBe(2)
    expect(statsRow).toBeTruthy()
  })
})
