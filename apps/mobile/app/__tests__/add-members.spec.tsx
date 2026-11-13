import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import AddMembersScreen, { parseRosterLines } from '../add-members'
import { api } from '../../src/api/client'

const mockRole = { value: 'OWNER' }
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ teamId: 'team-1' }),
}))
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'count' in options ? `${key} ${String(options.count)}` : key,
  }),
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    activeClub: { role: mockRole.value, club: { id: 'club-1' } },
    activeTeamId: 'team-1',
  }),
}))
jest.mock('../../src/api/client', () => ({ api: jest.fn() }))

const mockApi = api as jest.MockedFunction<typeof api>

describe('parseRosterLines', () => {
  it('reads an optional shirt number in front of each name', () => {
    expect(parseRosterLines('4 Tom Novak\n\n10. Mert Yilmaz\nSinan Kaya')).toEqual([
      { fullName: 'Tom Novak', jerseyNumber: 4 },
      { fullName: 'Mert Yilmaz', jerseyNumber: 10 },
      { fullName: 'Sinan Kaya' },
    ])
  })
})

describe('AddMembersScreen', () => {
  beforeEach(() => {
    mockRole.value = 'OWNER'
    mockApi.mockReset()
    mockApi.mockImplementation(((path: string, options?: { method?: string }) =>
      Promise.resolve(
        options?.method === 'POST'
          ? []
          : [{ id: 's1', fullName: 'Kofi Osei', jerseyNumber: 9, claimedByUserId: null }],
      )) as unknown as typeof api)
  })

  it('lists the roster slots and creates one per added name', async () => {
    const screen = render(<AddMembersScreen />)
    await waitFor(() => screen.getByText('Kofi Osei'))
    fireEvent.changeText(screen.getByTestId('add-members-name'), 'Lukas Becker')
    fireEvent.changeText(screen.getByTestId('add-members-number'), '6')
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-members-add'))
    })
    expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/teams/team-1/roster-slots', {
      method: 'POST',
      body: { slots: [{ fullName: 'Lukas Becker', jerseyNumber: 6 }] },
    })
  })

  it('does not offer the form to members without admin rights', () => {
    mockRole.value = 'MEMBER'
    const screen = render(<AddMembersScreen />)
    expect(screen.getByTestId('add-members-denied')).toBeTruthy()
    expect(screen.queryByTestId('add-members-name')).toBeNull()
  })
})
