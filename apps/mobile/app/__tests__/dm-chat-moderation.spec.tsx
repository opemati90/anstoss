import React from 'react'
import { ActionSheetIOS, Alert } from 'react-native'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import DmChatScreen, { getDmEmptyStateTransform } from '../dm-chat'

const mockApi = jest.fn().mockResolvedValue({ ok: true })

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ conversationId: 'conversation-1', userName: 'Alex' }),
  router: { back: jest.fn() },
}))
jest.mock('../../src/api/client', () => ({
  API_URL: 'https://api.test',
  api: (...args: unknown[]) => mockApi(...args),
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'me' },
    token: 'token',
    activeClub: { club: { id: 'club-1' } },
  }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME }
})
jest.mock('../../src/hooks/useDmChat', () => ({
  useDmChat: () => ({
    messages: [{ id: 'dm-1', conversationId: 'conversation-1', senderId: 'other-1', senderName: 'Alex', content: 'bad message', createdAt: new Date().toISOString() }],
    connectionState: 'connected',
    lastError: null,
    typingUsers: [],
    hasMore: false,
    sendMessage: jest.fn(),
    sendTyping: jest.fn(),
    markAsRead: jest.fn(),
    loadMore: jest.fn(),
    reconnect: jest.fn(),
  }),
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: { name?: string }) => options?.name ? `${key}:${options.name}` : key }),
}))
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

describe('DM moderation controls', () => {
  beforeEach(() => jest.clearAllMocks())

  it('reports an incoming DM from the long-press action', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.[0]?.onPress?.()
    })
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_options, callback) => callback(1))
    const screen = render(<DmChatScreen />)

    fireEvent(screen.getByLabelText('Alex: bad message'), 'longPress')

    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/direct-messages/dm-1/report', {
      method: 'POST',
      body: { reason: 'ABUSE' },
    }))
    expect(alert).toHaveBeenCalled()
  })
})

describe('DM empty state orientation', () => {
  it('counteracts Android inverted-list scaling on both axes', () => {
    expect(getDmEmptyStateTransform('android')).toEqual([{ scale: -1 }])
    expect(getDmEmptyStateTransform('ios')).toEqual([{ scaleY: -1 }])
  })
})
