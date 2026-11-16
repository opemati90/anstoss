import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
const mockApi = jest.fn()
let mockRole = 'OWNER'
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('../../src/api/client', () => ({ api: (...args: unknown[]) => mockApi(...args), ApiError: class extends Error {} }))
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'actor' },
  activeClub: { role: mockRole, club: { id: 'club-1', name: 'QA' } } }) }))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})
jest.mock('../../src/utils/haptics', () => ({ Haptics: { tap: jest.fn(), select: jest.fn() } }))
jest.mock('../../src/components/MultiSelectSheet', () => ({ MultiSelectSheet: () => null }))
jest.mock('../../src/components/SelectionSheet', () => ({ SelectionSheet: (props: any) => {
  const { View, Text, Pressable } = require('react-native')
  return props.visible ? <View>{props.options.map((option: any) =>
    <Pressable key={option.value} testID={`choice-${option.value}`} onPress={() => props.onSelect(option.value)}>
      <Text>{option.label}</Text>
    </Pressable>)}</View> : null
} }))
import ClubStaffScreen from '../club-staff'
const player = { id: 'membership-player', userId: 'player', role: 'PLAYER', operationalRoles: [],
  user: { id: 'player', name: 'A Player', email: '', avatarUrl: null, teamAccess: [] } }
beforeEach(() => {
  mockRole = 'OWNER'
  mockApi.mockReset().mockImplementation((path: string) => Promise.resolve(path.endsWith('/members') ? [player] : []))
})
it('lets the owner select an ordinary player and add admin authority', async () => {
  const screen = render(<ClubStaffScreen />)
  fireEvent.press(await screen.findByTestId('club-staff-change-member-role'))
  fireEvent.press(await screen.findByTestId('choice-player'))
  fireEvent.press(await screen.findByTestId('choice-ADMIN'))
  await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/members/player/role', {
    method: 'PATCH', body: { role: 'ADMIN' },
  }))
})
it('allows an admin to reassign player/coach roles but reserves admin promotion for the owner', async () => {
  mockRole = 'ADMIN'
  const screen = render(<ClubStaffScreen />)
  fireEvent.press(await screen.findByTestId('club-staff-change-member-role'))
  fireEvent.press(await screen.findByTestId('choice-player'))
  expect(screen.queryByTestId('choice-ADMIN')).toBeNull()
  fireEvent.press(await screen.findByTestId('choice-COACH'))
  await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/members/player/role', {
    method: 'PATCH', body: { role: 'COACH' },
  }))
})
it('does not expose role assignment to a coach', async () => {
  mockRole = 'COACH'
  const screen = render(<ClubStaffScreen />)
  expect(screen.queryByTestId('club-staff-change-member-role')).toBeNull()
  expect(mockApi).not.toHaveBeenCalled()
})
