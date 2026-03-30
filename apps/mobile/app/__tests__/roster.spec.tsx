import React from 'react'
import renderer, { act } from 'react-test-renderer'
import RosterScreen from '../(tabs)/roster/index'

const mockAuthState = {
  activeClub: {
    role: 'OWNER',
    club: {
      id: 'club-1',
      name: 'FC QA',
    },
  },
  activeTeamId: 'team-1',
  activeTeamAccess: {
    role: 'HEAD_COACH',
  },
}

const mockTheme = {
  clubPrimary: '#1E3A5F',
  clubPrimaryLight: '#DDE7F1',
}

const mockT = (key: string, options?: Record<string, unknown>) => {
  if (key === 'roster.memberCount') {
    return `${options?.count} Mitglieder`
  }

  const map: Record<string, string> = {
    'roster.screenTitle': 'Kader',
    'roster.workspace.squad': 'Kader',
    'roster.activeSquadTitle': 'Aktiver Kader',
    'roster.noPosition': 'Keine Position vergeben',
    'loans.title': 'Spieler ausleihen',
    'roster.manageFamiliesCta': 'Familien',
    'teamRoles.HEAD_COACH': 'Cheftrainer',
    'roles.PLAYER': 'Spieler',
  }

  return map[key] ?? key
}

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
  },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => mockTheme,
}))

jest.mock('../../src/i18n', () => ({
  getAppLanguage: jest.fn(() => 'de'),
  getAppLocale: jest.fn(() => 'de-DE'),
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn(() =>
    Promise.resolve({
      team: {
        id: 'team-1',
        displayName: '1. Herren',
      },
      squad: [
        {
          id: 'access-1',
          userId: 'user-1',
          name: 'Player One',
          avatarUrl: null,
          role: 'HEAD_COACH',
          phase: 'FULL',
          status: 'ACTIVE',
          position: null,
          jerseyNumber: null,
          operationalStatus: 'ACTIVE',
          createdAt: '2026-03-26T10:00:00.000Z',
          loanedFromTeamId: null,
          loanedFromTeamName: null,
        },
      ],
      operations: {
        trials: [],
        newPlayers: [],
        inactive: [],
      },
      medic: {
        active: [],
        recentlyCleared: [],
      },
      kit: {
        pending: [],
        recent: [],
      },
    }),
  ),
}))

jest.mock('../../src/components/IllustratedEmptyState', () => ({
  IllustratedEmptyState: () => null,
}))

jest.mock('../../src/illustrations', () => ({
  illustrations: {
    emptyRoster: 1,
  },
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

function collectText(node: any): string[] {
  if (typeof node === 'string') {
    return [node]
  }

  if (!node?.children) {
    return []
  }

  return node.children.flatMap((child: any) => collectText(child))
}

describe('RosterScreen', () => {
  it('renders the translated player-loan action instead of the raw i18n key', async () => {
    let tree: ReturnType<typeof renderer.create>

    await act(async () => {
      tree = renderer.create(<RosterScreen />)
    })

    const textContent = collectText(tree!.toJSON()).join(' ')

    expect(textContent).toContain('Spieler ausleihen')
    expect(textContent).not.toContain('loans.loanPlayer')
  })
})
