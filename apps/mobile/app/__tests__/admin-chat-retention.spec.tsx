import React from 'react'
import { Switch } from 'react-native'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import AdminChatRetentionScreen from '../admin-chat-retention'
import { api } from '../../src/api/client'

const mockApi = api as jest.Mock
const authState = {
  activeClub: { club: { id: 'club-1', name: 'FC Test' }, role: 'OWNER' },
}

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
  },
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const value = typeof options?.defaultValue === 'string' ? options.defaultValue : key
      return value.replace(/\{\{(\w+)\}\}/g, (_, token) => String(options?.[token] ?? ''))
    },
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => authState,
}))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({
      ...FALLBACK_THEME,
      clubPrimary: '#0B7FAB',
      clubPrimaryLight: '#E2F3F8',
      surface: '#FFFFFF',
      surfaceSunken: '#F7F7F4',
      borderStrong: '#D1D1CC',
    }),
    useIsDark: () => false,
  }
})

jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
}))

describe('AdminChatRetentionScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    authState.activeClub = { club: { id: 'club-1', name: 'FC Test' }, role: 'OWNER' }
    mockApi.mockResolvedValue({
      clubId: 'club-1',
      enabled: false,
      messageRetentionDays: 365,
      attachmentRetentionDays: 90,
    })
  })

  it('loads chat retention settings for club admins', async () => {
    const { getByText } = render(<AdminChatRetentionScreen />)

    await waitFor(() => {
      expect(getByText('Chat retention')).toBeTruthy()
      expect(getByText('365 days')).toBeTruthy()
      expect(getByText('90 days')).toBeTruthy()
    })

    expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/chat/retention')
  })

  it('saves the enable switch and retention window independently', async () => {
    mockApi
      .mockResolvedValueOnce({
        clubId: 'club-1',
        enabled: false,
        messageRetentionDays: 365,
        attachmentRetentionDays: 90,
      })
      .mockResolvedValueOnce({
        clubId: 'club-1',
        enabled: true,
        messageRetentionDays: 365,
        attachmentRetentionDays: 90,
      })
      .mockResolvedValueOnce({
        clubId: 'club-1',
        enabled: true,
        messageRetentionDays: 90,
        attachmentRetentionDays: 90,
      })

    const screen = render(<AdminChatRetentionScreen />)

    await waitFor(() => {
      expect(screen.getByText('Enable retention lifecycle')).toBeTruthy()
    })

    const toggle = screen.UNSAFE_getByType(Switch)
    fireEvent(toggle, 'valueChange', true)

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/chat/retention', {
        method: 'PATCH',
        body: { enabled: true },
      })
    })

    fireEvent.press(screen.getByLabelText('Messages: 90 days'))

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/chat/retention', {
        method: 'PATCH',
        body: { messageRetentionDays: 90 },
      })
    })
  })

  it('keeps non-admin roles out of retention settings', () => {
    authState.activeClub = { club: { id: 'club-1', name: 'FC Test' }, role: 'COACH' }

    const { getByText } = render(<AdminChatRetentionScreen />)

    expect(getByText('Access denied')).toBeTruthy()
    expect(mockApi).not.toHaveBeenCalled()
  })
})
