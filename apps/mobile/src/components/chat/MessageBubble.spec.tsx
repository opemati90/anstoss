import React from 'react'
import { render } from '@testing-library/react-native'
import { MessageBubble } from './MessageBubble'

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('./MessageMenu', () => ({ MessageMenu: () => null }))
jest.mock('../../hooks/useSignedChatMediaUrl', () => ({ useSignedChatMediaUrl: () => null }))
jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({ primary: '#20549e', onPrimary: '#ffffff', textPrimary: '#111111',
    textTertiary: '#666666', surfaceSunken: '#eeeeee', borderDefault: '#dddddd', primary50: '#eeeeee' }),
  useIsDark: () => false,
}))

describe('MessageBubble timestamp accessibility', () => {
  it('renders one timestamp and exposes it once in the bubble label', () => {
    const message = { id: 'timestamp-test', teamId: 'team', senderId: 'player', senderName: 'Player',
      content: 'Hello team', messageType: 'TEXT', createdAt: '2026-11-03T12:30:00.000Z',
      reactions: [], deletedAt: null, editedAt: null } as any
    const screen = render(<MessageBubble message={message} isOwn showSender={false} readState="sent" />)
    const bubble = screen.getByTestId('chat-bubble-timestamp-test')
    const label = String(bubble.props.accessibilityLabel)
    expect(label).toContain('Hello team')
    expect(label.match(/\d{1,2}:\d{2}/g)).toHaveLength(1)
    const time = label.match(/\d{1,2}:\d{2}/)?.[0]
    expect(time).toBeTruthy()
    expect(screen.getAllByText(time!, { includeHiddenElements: true })).toHaveLength(1)
  })
})
