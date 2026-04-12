import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Pressable, Text } from 'react-native'
import { TeamSwitcher } from '../TeamSwitcher'

const mockSetActiveTeam = jest.fn()
let mockTeams: any[] = []
let mockActiveTeamId = 'team-1'

jest.useFakeTimers()

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'teamSwitcher.title': 'Switch Team',
        'teamSwitcher.current': 'Current',
        'teamRoles.HEAD_COACH': 'Head Coach',
        'teamRoles.PLAYER': 'Player',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    activeTeamId: mockActiveTeamId,
    teamsForActiveClub: mockTeams,
    setActiveTeam: mockSetActiveTeam,
  }),
}))

jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({
    primary: '#D50000',
    clubPrimary: '#D50000',
    clubPrimaryLight: '#FFEBEE',
  }),
  useIsDark: () => false,
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

function collectText(node: any): string {
  if (typeof node === 'string') return node
  if (!node?.children) return ''
  return node.children.map((c: any) => collectText(c)).join('')
}

function renderWithAct(element: React.ReactElement) {
  let tree: any
  act(() => {
    tree = renderer.create(element)
  })
  // Flush animated spring timers
  act(() => {
    jest.runAllTimers()
  })
  return tree!
}

describe('TeamSwitcher', () => {
  const onClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockActiveTeamId = 'team-1'
    mockTeams = [
      {
        team: { id: 'team-1', name: 'First Team', displayName: 'Erste', ageGroup: 'U19' },
        role: 'HEAD_COACH',
      },
      {
        team: { id: 'team-2', name: 'Second Team', displayName: 'Zweite', ageGroup: null },
        role: 'PLAYER',
      },
    ]
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
  })

  it('returns null when there is only one team', () => {
    mockTeams = [
      { team: { id: 'team-1', name: 'Only', displayName: 'Only', ageGroup: null }, role: 'PLAYER' },
    ]

    const tree = renderWithAct(
      <TeamSwitcher visible={true} onClose={onClose} />,
    )

    expect(tree.toJSON()).toBeNull()
  })

  it('renders team rows with display names', () => {
    const tree = renderWithAct(
      <TeamSwitcher visible={true} onClose={onClose} />,
    )

    const allTexts = tree.root.findAllByType(Text)
    const textValues = allTexts.map((t: any) => collectText(t))

    expect(textValues).toContain('Switch Team')
    expect(textValues).toContain('Erste')
    expect(textValues).toContain('Zweite')
  })

  it('shows age group for teams that have one', () => {
    const tree = renderWithAct(
      <TeamSwitcher visible={true} onClose={onClose} />,
    )

    const allTexts = tree.root.findAllByType(Text)
    const textValues = allTexts.map((t: any) => collectText(t))

    expect(textValues).toContain('U19')
  })

  it('calls setActiveTeam and onClose when a team is selected', () => {
    const tree = renderWithAct(
      <TeamSwitcher visible={true} onClose={onClose} />,
    )

    // Find all Pressables that have an onPress handler calling handleSelect
    // Team row Pressables are the ones whose direct Text children include the team name
    const pressables = tree.root.findAllByType(Pressable)
    const teamRows = pressables.filter((p: any) => {
      // Team rows have the teamRow style (minHeight 64) — check direct children for team name
      try {
        const directTexts = p.findAllByType(Text)
        return directTexts.some((t: any) => collectText(t) === 'Zweite') &&
               directTexts.some((t: any) => collectText(t) === 'Player')
      } catch {
        return false
      }
    })

    // The last match is the deepest (most specific) Pressable — the team row itself
    const teamRow = teamRows[teamRows.length - 1]
    expect(teamRow).toBeTruthy()
    expect(teamRow.props.onPress).toBeDefined()

    act(() => {
      teamRow.props.onPress()
    })

    expect(mockSetActiveTeam).toHaveBeenCalledWith('team-2')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows role labels for each team', () => {
    const tree = renderWithAct(
      <TeamSwitcher visible={true} onClose={onClose} />,
    )

    const allTexts = tree.root.findAllByType(Text)
    const textValues = allTexts.map((t: any) => collectText(t))

    expect(textValues).toContain('Head Coach')
    expect(textValues).toContain('Player')
  })
})
