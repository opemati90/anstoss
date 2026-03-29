import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import NotificationSettingsScreen from '../notification-settings'
import { api } from '../../src/api/client'

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    push: jest.fn(),
  },
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

const translationMap: Record<string, string> = {
  'notificationSettings.title': 'Notifications',
  'notificationSettings.description': 'Choose which updates you receive.',
  'notificationSettings.quietHoursHint': 'Quiet hours pause pushes overnight.',
  'notificationSettings.clubWide': 'All teams',
  'notificationSettings.bulkHint': 'Apply the same settings to every team below.',
  'notificationSettings.defaultBadge': 'Bulk',
  'notificationSettings.muteChat': 'Mute chat messages',
  'notificationSettings.muteEvents': 'Mute event reminders',
  'notificationSettings.muteAnnouncements': 'Mute announcements',
  'notificationSettings.quietHours': 'Quiet hours',
  'common.error': 'Error',
  'errors.server': 'Server error',
}

const mockTranslate = (key: string) => translationMap[key] ?? key

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockTranslate,
  }),
}))

const mockAuthState = {
  activeClub: {
    club: {
      id: 'club-1',
      name: 'FC Test',
    },
  },
  teamsForActiveClub: [
    {
      team: {
        id: 'team-1',
        name: 'Herren I',
        displayName: 'Herren I',
      },
    },
    {
      team: {
        id: 'team-2',
        name: 'U19',
        displayName: 'U19',
      },
    },
  ],
}

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    clubPrimary: '#7A0019',
    clubPrimaryLight: '#F5D6DD',
  }),
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
}))

jest.mock('../../src/components/ModalHeader', () => ({
  ModalHeader: ({ title }: { title: string }) => title,
}))

const mockApi = api as jest.Mock

describe('NotificationSettingsScreen', () => {
  beforeEach(() => {
    mockApi.mockReset()
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn())
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('fans out the bulk row toggle into one save per team', async () => {
    mockApi
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })

    const { getByText, getAllByRole } = render(<NotificationSettingsScreen />)

    await waitFor(() => {
      expect(getByText('All teams')).toBeTruthy()
      expect(getByText('Herren I')).toBeTruthy()
      expect(getByText('U19')).toBeTruthy()
    })

    const [bulkChatSwitch] = getAllByRole('switch')

    fireEvent(bulkChatSwitch, 'valueChange', true)

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledTimes(3)
    })

    expect(mockApi).toHaveBeenNthCalledWith(
      2,
      '/clubs/club-1/notification-preferences',
      expect.objectContaining({
        method: 'PUT',
        body: expect.objectContaining({
          teamId: 'team-1',
          mutedChat: true,
        }),
      }),
    )
    expect(mockApi).toHaveBeenNthCalledWith(
      3,
      '/clubs/club-1/notification-preferences',
      expect.objectContaining({
        method: 'PUT',
        body: expect.objectContaining({
          teamId: 'team-2',
          mutedChat: true,
        }),
      }),
    )
    expect(Alert.alert).not.toHaveBeenCalled()
  })
})
