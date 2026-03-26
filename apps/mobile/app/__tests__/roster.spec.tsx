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
    'loans.title': 'Spieler ausleihen',
    'roster.manageFamiliesCta': 'Familien',
    'roles.OWNER': 'Owner',
    'teamRoles.HEAD_COACH': 'Cheftrainer',
  }

  return map[key] ?? key
}

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
  },
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
    i18n: {
      resolvedLanguage: 'de',
    },
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => mockTheme,
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn(() =>
    Promise.resolve([
      {
        id: 'member-1',
        role: 'HEAD_COACH',
        phase: 'FULL',
        status: 'ACTIVE',
        createdAt: '2026-03-26T10:00:00.000Z',
        user: {
          id: 'user-1',
          name: 'Player One',
          avatarUrl: null,
        },
      },
    ]),
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
  if (typeof node === 'string') return [node]
  if (!node?.children) return []
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
