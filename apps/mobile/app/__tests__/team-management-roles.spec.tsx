// club-admin review fixes (M4): only admins can save coach assignments
// (server: assertClubAdministrator), so coaches get read-only team rows.
import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const mockApi = jest.fn()
const mockSheet = jest.fn()
let mockRole = 'COACH'
let mockParams: { teamId?: string } = {}

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o && 'count' in o ? `${k}:${String(o.count)}` : k),
  }),
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    activeClub: { role: mockRole, club: { id: 'club-1', name: 'SV Albatros' } },
    teamMembers: [],
  }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})
jest.mock('../../src/utils/haptics', () => ({
  Haptics: { tap: jest.fn(), select: jest.fn(), success: jest.fn(), warning: jest.fn(), error: jest.fn() },
}))
jest.mock('../../src/launchFeatures', () => ({ COMPLIANCE_FEATURE_ENABLED: false }))
jest.mock('../../src/components/admin/AssignStaffSheet', () => ({
  AssignStaffSheet: (props: { visible: boolean }) => {
    mockSheet(props.visible)
    return null
  },
}))

import TeamManagementScreen from '../team-management'

const GROUPS = [
  {
    id: 'g-1',
    displayName: 'Junioren',
    type: 'YOUTH',
    teams: [
      {
        id: 'team-d',
        displayName: 'D-Jugend (U13)',
        squadLabel: null,
        leagueName: null,
        memberCount: 14,
        coachAssignments: { headCoach: null, assistants: [] },
      },
    ],
  },
]

function renderScreen() {
  mockApi.mockImplementation((path: string) =>
    Promise.resolve(path.endsWith('/team-groups') ? GROUPS : []),
  )
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <TeamManagementScreen />
    </SafeAreaProvider>,
  )
}

describe('Mannschaften — who may assign coaches (M4)', () => {
  beforeEach(() => {
    mockApi.mockReset()
    mockSheet.mockReset()
    mockParams = {}
  })

  it('shows coaches read-only rows and never opens the assign sheet', async () => {
    mockRole = 'COACH'
    mockParams = { teamId: 'team-d' }
    const screen = renderScreen()
    const row = await screen.findByText('D-Jugend (U13)')
    fireEvent.press(row)
    expect(mockSheet).not.toHaveBeenCalledWith(true)
    expect(screen.getByText('verein.teams.readOnlyHint')).toBeTruthy()
  })

  it('lets admins open the assign sheet', async () => {
    mockRole = 'ADMIN'
    const screen = renderScreen()
    fireEvent.press(await screen.findByText('D-Jugend (U13)'))
    expect(mockSheet).toHaveBeenLastCalledWith(true)
    expect(screen.getByText('verein.teams.withoutCoachHint')).toBeTruthy()
  })
})
