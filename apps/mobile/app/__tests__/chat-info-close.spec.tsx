import React from 'react'
import { Alert } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

const mockClose = jest.fn()
const mockRefresh = jest.fn()
const mockDismiss = jest.fn()
const mockMembers = jest.fn()
let mockCanClose = true
let mockKind = 'CUSTOM'
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { dismissTo: (...args: unknown[]) => mockDismiss(...args), push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: 'private-room', kind: 'channel', teamId: 'team' }),
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }), initReactI18next: { type: '3rdParty', init: () => {} },
}))
jest.mock('../../src/api/client', () => ({ api: () => Promise.resolve(null) }))
jest.mock('../../src/api/chat', () => ({
  closeChannel: (...args: unknown[]) => mockClose(...args),
  fetchChannelMembers: (...args: unknown[]) => mockMembers(...args),
}))
jest.mock('../../src/hooks/useConversationDetail', () => ({ useConversationDetail: () => ({
  status: 'ready', dm: null, seed: null, reload: jest.fn(), patch: jest.fn(),
  channel: { id: 'private-room', kind: mockKind, name: 'Private group', teamId: 'team',
    canWrite: true, canClose: mockCanClose, canManageMembers: false, memberCount: 0 },
}) }))
jest.mock('../../src/hooks/useInbox', () => ({
  patchInboxItem: jest.fn(), refreshInbox: (...args: unknown[]) => mockRefresh(...args),
}))
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'owner' }, activeClub: { club: { id: 'club' }, role: 'OWNER' }, activeTeamId: 'team',
}) }))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})
jest.mock('../../src/components/chat/ChatMediaSection', () => ({ ChatMediaSection: () => null }))
jest.mock('../../src/components/chat/UserReportSheet', () => ({ UserReportSheet: () => null }))
import ConversationInfoScreen from '../chat/[id]/info'

describe('private group close control', () => {
  beforeEach(() => {
    mockCanClose = true; mockKind = 'CUSTOM'
    mockClose.mockReset().mockResolvedValue({ archivedAt: new Date().toISOString() })
    mockRefresh.mockReset().mockResolvedValue(undefined)
    mockDismiss.mockReset()
    mockMembers.mockReset().mockResolvedValue([])
    jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it('requires destructive confirmation and returns to the refreshed inbox only on success', async () => {
    const screen = render(<ConversationInfoScreen />)
    fireEvent.press(await screen.findByTestId('chat-info-close'))
    expect(mockClose).not.toHaveBeenCalled()
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2]
    expect(buttons.map((button: { style: string }) => button.style)).toEqual(['cancel', 'destructive'])
    expect(buttons[0].onPress).toBeUndefined()
    await act(async () => { await buttons[1].onPress() })
    expect(mockClose).toHaveBeenCalledWith('club', 'private-room')
    expect(mockRefresh).toHaveBeenCalledWith('club')
    expect(mockDismiss).toHaveBeenCalledWith('/(tabs)/chat')
    expect(mockClose.mock.invocationCallOrder[0]).toBeLessThan(mockRefresh.mock.invocationCallOrder[0])
  })

  it.each([['CUSTOM', false], ['TEAM', true]])('hides close for %s with canClose=%s', async (kind, canClose) => {
    mockKind = kind as string; mockCanClose = canClose as boolean
    const screen = render(<ConversationInfoScreen />)
    await waitFor(() => expect(mockMembers).toHaveBeenCalled())
    expect(screen.queryByTestId('chat-info-close')).toBeNull()
  })

  it('keeps the group screen open and reports a failed close', async () => {
    mockClose.mockRejectedValueOnce(new Error('offline'))
    const screen = render(<ConversationInfoScreen />)
    fireEvent.press(await screen.findByTestId('chat-info-close'))
    const confirm = (Alert.alert as jest.Mock).mock.calls[0][2][1]
    await act(async () => { await confirm.onPress() })
    expect(mockDismiss).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
    expect(Alert.alert).toHaveBeenLastCalledWith('common.error', 'chatHub.info.closeGroupError')
  })
})
