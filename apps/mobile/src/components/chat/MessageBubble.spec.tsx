import { render } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import type { ChatMessage } from '../../hooks/useChat'
import { MessageBubble } from './MessageBubble'

jest.mock('react-native-reanimated', () => ({
  ...require('react-native-reanimated/mock'),
  useReducedMotion: () => false,
}))
jest.mock('react-native-gesture-handler', () => {
  const chain: Record<string, jest.Mock> = {}
  for (const key of ['enabled', 'activeOffsetX', 'failOffsetY', 'onUpdate', 'onEnd']) {
    chain[key] = jest.fn(() => chain)
  }
  return { Gesture: { Pan: () => chain }, GestureDetector: ({ children }: { children: unknown }) => children }
})
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => options?.count == null ? key : `${key}:${options.count}`,
    i18n: { language: 'de' },
  }),
}))
jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => require('../../theme/colors').lightTheme,
}))
jest.mock('../../hooks/useSignedChatMediaUrl', () => ({ useSignedChatMediaUrl: () => null }))
jest.mock('./MessageMenu', () => ({ MessageMenu: () => null }))
jest.mock('./VoiceMessagePlayer', () => ({ VoiceMessagePlayer: () => null }))
jest.mock('./EventCardMessage', () => ({ EventCardMessage: () => null }))
jest.mock('./PollCardMessage', () => ({ PollCardMessage: () => null }))
jest.mock('./LineupCardMessage', () => ({ LineupCardMessage: () => null }))

const message: ChatMessage = {
  id: 'layout-regression', teamId: 'team', senderId: 'me', senderName: 'Markus',
  content: "Bis Samstag, auf geht’s!", messageType: 'TEXT', createdAt: '2026-11-13T21:33:00Z',
}

describe('MessageBubble metadata layout', () => {
  it('shows the API read count below the final own channel bubble without overlaying metadata', () => {
    const screen = render(<MessageBubble message={{ ...message, readCount: 14 }} isOwn isGroupChat showSender={false} />)
    expect(screen.getByText('chatThread.readBy:14')).toBeTruthy()
    const meta = screen.getByTestId('message-meta-layout-regression', { includeHiddenElements: true })
    expect(StyleSheet.flatten(meta.props.style).position).not.toBe('absolute')
  })

  it.each([
    { isOwn: false, isGroupChat: true, lastInGroup: true, readCount: 14 },
    { isOwn: true, isGroupChat: false, lastInGroup: true, readCount: 14 },
    { isOwn: true, isGroupChat: true, lastInGroup: false, readCount: 14 },
    { isOwn: true, isGroupChat: true, lastInGroup: true, readCount: 0 },
    { isOwn: true, isGroupChat: true, lastInGroup: true, readCount: undefined },
    { isOwn: true, isGroupChat: true, lastInGroup: true, readCount: 14, deletedAt: '2026-11-13T21:35:00Z' },
  ])('does not invent or repeat read counts for %j', ({ readCount, deletedAt, ...props }) => {
    const screen = render(<MessageBubble message={{ ...message, readCount, deletedAt }} {...props} showSender={false} />)
    expect(screen.queryByTestId('chat-read-count-layout-regression')).toBeNull()
  })

  it.each([
    {},
    { content: 'A long message '.repeat(30), editedAt: '2026-11-13T21:34:00Z' },
    { translation: { content: 'Translated message', sourceLanguage: 'en' } },
    { reactions: [{ emoji: '👍', count: 1, userIds: ['me'] }] },
    { messageType: 'IMAGE', content: 'Photo caption' },
    { messageType: 'VIDEO', content: 'Video caption' },
    { messageType: 'VOICE', content: '' },
    { deletedAt: '2026-11-13T21:35:00Z', messageType: 'IMAGE', content: '' },
  ] as Partial<ChatMessage>[])('keeps the timestamp in normal flow for %j', (overrides) => {
    const screen = render(<MessageBubble message={{ ...message, ...overrides }} isOwn showSender={false} readState="read" />)
    const meta = screen.getByTestId('message-meta-layout-regression', { includeHiddenElements: true })
    expect(StyleSheet.flatten(meta.props.style)).toMatchObject({ alignSelf: 'flex-end' })
    expect(StyleSheet.flatten(meta.props.style).position).not.toBe('absolute')
  })

  it.each(['IMAGE', 'VIDEO'] as const)('overlays only uncaptioned %s media', (messageType) => {
    const screen = render(<MessageBubble message={{ ...message, content: '', messageType }} isOwn showSender={false} />)
    const meta = screen.getByTestId('message-meta-layout-regression', { includeHiddenElements: true })
    expect(StyleSheet.flatten(meta.props.style).position).toBe('absolute')
  })
})
