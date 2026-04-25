import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Text } from 'react-native'
import PlayerLoanScreen from '../player-loan'
import { FALLBACK_THEME } from '../../src/theme/club-theme'

const mockTheme = {
  ...FALLBACK_THEME,
  clubPrimary: '#1E3A5F',
  primary: '#1E3A5F',
}

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
  },
  useLocalSearchParams: () => ({
    teamId: 'team-1',
  }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'loans.title': 'Spieler ausleihen',
        'loans.selectPlayer': 'Spieler wählen',
        'loans.selectTargetTeam': 'Zielmannschaft',
        'loans.endDate': 'Leih-Enddatum (optional)',
        'loans.submit': 'Ausleihe speichern',
      }

      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    activeClub: {
      club: {
        id: 'club-1',
      },
    },
    activeTeamId: 'team-1',
  }),
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => mockTheme,
  useIsDark: () => false,
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn((path: string) => {
    if (path.includes('/members')) {
      return Promise.resolve([
        {
          userId: 'player-1',
          name: 'Maximilian Spielername mit sehr langem Zusatz',
        },
      ])
    }

    return Promise.resolve([
      {
        teams: [
          { id: 'team-1', name: 'Quelle' },
          { id: 'team-2', name: 'U15 Aufbaukader mit sehr langem Namen' },
        ],
      },
    ])
  }),
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

describe('PlayerLoanScreen layout', () => {
  it('keeps selectable option labels multi-line safe for long names', async () => {
    let tree: ReturnType<typeof renderer.create>

    await act(async () => {
      tree = renderer.create(<PlayerLoanScreen />)
    })

    const longLabels = tree!.root.findAllByType(Text).filter((node: any) => {
      const value = typeof node.props.children === 'string' ? node.props.children : ''
      return value.includes('langem')
    })

    expect(longLabels).not.toHaveLength(0)
    for (const label of longLabels) {
      expect(label.props.numberOfLines).toBe(2)
    }
  })
})
