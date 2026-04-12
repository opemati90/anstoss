import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import CreateEventScreen from '../create-event'
import { api } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'

const mockApi = api as jest.Mock
const mockUseAuth = useAuth as jest.Mock
const mockRouterBack = jest.fn()
const mockSetActiveTeam = jest.fn()
const mockT = (key: string) => {
  const map: Record<string, string> = {
    'common.errorTitle': 'Error',
    'common.accessDenied': 'Access denied',
    'errors.server': 'Server error',
    'event.newScreenTitle': 'Create event',
    'event.createScreenHint': 'Plan the next session for your club.',
    'event.teamLabel': 'Team',
    'event.teamLockedHint': 'Using your active squad',
    'event.currentTeam': 'Current team',
    'event.permissionDenied': 'No permission',
    'event.noEligibleTeamTitle': 'No squad available',
    'event.noEligibleTeamBody': 'Create a team first.',
    'event.typeLabel': 'Type',
    'event.type.TRAINING': 'Training',
    'event.type.MATCH': 'Match',
    'event.type.OTHER': 'Other',
    'event.title': 'Title',
    'event.date': 'Date',
    'event.time': 'Time',
    'event.locationOptional': 'Location',
    'event.notesOptional': 'Notes',
    'event.placeholders.TRAINING': 'Training session',
    'event.placeholders.MATCH': 'Matchday',
    'event.placeholders.OTHER': 'Event title',
    'event.placeholders.location': 'Training ground',
    'event.placeholders.notes': 'Optional notes',
    'event.createButton': 'Create event',
    'event.noTeamSelected': 'Select a team first.',
    'event.dateRequiredTitle': 'Date required',
    'event.datePastError': 'Date cannot be in the past.',
    'event.titleRequiredTitle': 'Title required',
    'event.createErrorBody': 'Could not create event.',
    'event.createErrorTitle': 'Event failed',
  }

  return map[key] ?? key
}

jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockRouterBack(...args),
  },
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children, style }: { children?: React.ReactNode; style?: any }) => {
    const React = require('react')
    const { View } = require('react-native')

    return React.createElement(View, { style }, children)
  },
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    clubPrimary: '#1E3A5F',
    clubPrimaryLight: '#DDE7F1',
    background: '#FAFAF8',
    surface: '#FFFFFF',
    textPrimary: '#1A1A18',
    textSecondary: '#6B6B69',
    textTertiary: '#9E9E9C',
    textInverse: '#FFFFFF',
    border: '#E5E5E3',
    borderStrong: '#D1D1CC',
  }),
  useIsDark: () => false,
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
  ApiError: class ApiError extends Error {},
}))

jest.mock('../../src/components/ModalHeader', () => ({
  ModalHeader: () => null,
}))

jest.mock('../../src/components/ScrollPicker', () => ({
  ScrollPicker: () => null,
}))

describe('CreateEventScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAuth.mockReturnValue({
      activeClub: {
        role: 'OWNER',
        permissions: {},
        club: { id: 'club-1', name: 'FC QA' },
      },
      activeTeamAccess: null,
      activeTeamId: null,
      setActiveTeam: mockSetActiveTeam,
    })
  })

  it('creates an event for a selected team even when no active team is preset', async () => {
    mockApi
      .mockResolvedValueOnce([
        {
          id: 'group-1',
          displayName: 'Academy',
          teams: [
            {
              id: 'team-1',
              displayName: 'U15',
              squadLabel: 'U15',
              leagueName: 'League A',
            },
            {
              id: 'team-2',
              displayName: 'U17',
              squadLabel: 'U17',
              leagueName: 'League B',
            },
          ],
        },
      ])
      .mockResolvedValueOnce({ id: 'event-1' })

    const screen = render(<CreateEventScreen />)

    await waitFor(() => {
      expect(screen.getByTestId('event-team-team-2')).toBeTruthy()
    })

    fireEvent.press(screen.getByTestId('event-team-team-2'))
    fireEvent.changeText(
      screen.getByPlaceholderText('Training session'),
      'Abschlusstraining',
    )
    fireEvent.press(screen.getByTestId('event-create-submit'))

    await waitFor(() => {
      expect(mockApi).toHaveBeenLastCalledWith(
        '/clubs/club-1/events',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            teamId: 'team-2',
            title: 'Abschlusstraining',
            type: 'TRAINING',
          }),
        }),
      )
    })

    expect(mockSetActiveTeam).toHaveBeenCalledWith('team-2')
    expect(mockRouterBack).toHaveBeenCalled()
  })

  it('shows an empty state when the club has no teams to create events for', async () => {
    mockApi.mockResolvedValueOnce([])

    const screen = render(<CreateEventScreen />)

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/team-groups')
    })

    await waitFor(() => {
      expect(screen.getByText('No squad available')).toBeTruthy()
      expect(screen.getByText('Create a team first.')).toBeTruthy()
    })
  })
})
