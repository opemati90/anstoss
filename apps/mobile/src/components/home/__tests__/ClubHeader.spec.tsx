import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ClubHeader } from '../ClubHeader'
import { setChildrenSummary } from '../childrenSummary'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../../ClubSwitcher', () => ({ ClubSwitcher: () => null }))

jest.mock('react-i18next', () => {
  const t = (key: string, opts?: unknown) => {
    const o = (typeof opts === 'string' ? { defaultValue: opts } : opts) as
      | ({ defaultValue?: string } & Record<string, unknown>)
      | undefined
    return typeof o?.defaultValue === 'string' ? o.defaultValue : key
  }
  return { useTranslation: () => ({ t }) }
})

jest.mock('../../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../../theme/club-theme')
  return { useClubColors: () => ({ ...FALLBACK_THEME }), useIsDark: () => false }
})

const mockSetActiveTeam = jest.fn()
const mockSetActiveRoleMode = jest.fn()
const team = (id: string, name: string) => ({ team: { id, name, displayName: name, ageGroup: null } })
let mockAuth: Record<string, unknown> = {}

jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider
    initialMetrics={{
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
      frame: { x: 0, y: 0, width: 320, height: 568 },
    }}
  >
    {ui}
  </SafeAreaProvider>
)

describe('ClubHeader', () => {
  beforeEach(() => {
    mockSetActiveTeam.mockReset()
    mockSetActiveRoleMode.mockReset()
    mockAuth = {
      activeClub: { role: 'PLAYER', club: { id: 'c1', name: 'SV Albatros', badgeUrl: null } },
      activeTeamAccess: team('t1', '1. Herren'),
      activeRoleMode: 'PLAYER',
      availableRoleModes: ['PLAYER'],
      setActiveRoleMode: mockSetActiveRoleMode,
      teamsForActiveClub: [team('t1', '1. Herren')],
      setActiveTeam: mockSetActiveTeam,
      memberships: [{}],
    }
    act(() => setChildrenSummary([]))
  })

  it('collapses identity into one row: crest, "Role · Club" over the team, bell', () => {
    const { getByText, getAllByLabelText, getByLabelText } = render(
      wrap(<ClubHeader resolvedRoleMode="PLAYER" />),
    )
    // Redesign screen 08: "Trainer · SV Spreewiese" over "1. Herren".
    expect(getByText('Player · SV Albatros')).toBeTruthy()
    expect(getByText('1. Herren')).toBeTruthy()
    // The bell keeps its target (notification settings).
    fireEvent.press(getByLabelText('Notifications'))
    expect(require('expo-router').router.push).toHaveBeenCalledWith('/notification-settings')
    // Crest + identity are ONE accessible element, not the club name twice.
    expect(getAllByLabelText('Player · SV Albatros, 1. Herren')).toHaveLength(1)
  })

  it('opens one sheet to switch team and role when there is a choice', () => {
    mockAuth = {
      ...mockAuth,
      availableRoleModes: ['PLAYER', 'COACH'],
      teamsForActiveClub: [team('t1', '1. Herren'), team('t2', 'A-Jugend')],
    }
    const { getByLabelText, getByText } = render(wrap(<ClubHeader resolvedRoleMode="PLAYER" />))
    fireEvent.press(getByLabelText('Player · SV Albatros, 1. Herren'))
    expect(getByText('Team and role')).toBeTruthy()
    fireEvent.press(getByText('A-Jugend'))
    expect(mockSetActiveTeam).toHaveBeenCalledWith('t2')
  })

  it("names the children's teams for parents, not the parent's membership", () => {
    mockAuth = {
      ...mockAuth,
      activeRoleMode: 'PARENT',
      activeTeamAccess: team('senior', 'Senior Team'),
    }
    const { getByText, queryByText } = render(wrap(<ClubHeader resolvedRoleMode="PARENT" />))
    expect(getByText('SV Albatros · Parent')).toBeTruthy()
    act(() =>
      setChildrenSummary([
        { id: 'leo', name: 'Leo', team: 'U15' },
        { id: 'mia', name: 'Mia', team: 'U11' },
      ]),
    )
    expect(getByText('Leo · U15, Mia · U11')).toBeTruthy()
    expect(queryByText(/Senior Team/)).toBeNull()
  })
})
