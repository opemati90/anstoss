import { buildThreadRows, senderColor, fileSizeLabel } from './chatGrouping'
import type { ChatMessage } from '../../hooks/useChat'

const t = ((key: string) => key) as never
const at = (min: number) => new Date(Date.UTC(2026, 8, 24, 10, min)).toISOString()
const msg = (id: string, senderId: string, min: number, extra: Partial<ChatMessage> = {}): ChatMessage =>
  ({ id, teamId: 't', senderId, senderName: senderId, content: id, createdAt: at(min), ...extra }) as ChatMessage

describe('buildThreadRows (grouped bubbles, day pill, unread divider)', () => {
  it('groups one sender within 3 minutes; a longer gap starts a new group', () => {
    const rows = buildThreadRows({
      messages: [msg('a', 'tim', 0), msg('b', 'tim', 2), msg('c', 'tim', 9), msg('d', 'me', 10)],
      isGroupChat: true,
      myUserId: 'me',
      unreadOnOpen: 0,
      locale: 'de',
      t,
    }).filter((r) => r.type === 'message')
    const flags = rows.map((r) => (r.type === 'message' ? [r.message.id, r.firstInGroup, r.lastInGroup, r.showSender, r.showAvatar] : null))
    expect(flags).toEqual([
      ['a', true, false, true, false],
      ['b', false, true, false, true],
      ['c', true, true, true, true],
      // Own messages never show a name or avatar.
      ['d', true, true, false, false],
    ])
  })

  it('puts "Neue Nachrichten" before the first unread message from others', () => {
    const rows = buildThreadRows({
      messages: [msg('a', 'tim', 0), msg('b', 'me', 1), msg('c', 'tim', 2), msg('d', 'tim', 3)],
      isGroupChat: false,
      myUserId: 'me',
      unreadOnOpen: 2,
      locale: 'de',
      t,
    })
    const order = rows.map((r) => (r.type === 'message' ? r.message.id : r.type))
    expect(order).toEqual(['day', 'a', 'b', 'unread', 'c', 'd'])
  })

  it('never groups cards (lineup, poll) into a bubble run', () => {
    const rows = buildThreadRows({
      messages: [msg('a', 'tim', 0), msg('l', 'tim', 1, { messageType: 'LINEUP' }), msg('b', 'tim', 2)],
      isGroupChat: true,
      myUserId: 'me',
      unreadOnOpen: 0,
      locale: 'de',
      t,
    }).filter((r) => r.type === 'message')
    expect(rows.every((r) => r.type === 'message' && r.firstInGroup && r.lastInGroup)).toBe(true)
  })
})

describe('chat helpers', () => {
  it('gives a sender the same colour every time', () => {
    expect(senderColor('user-1', false)).toBe(senderColor('user-1', false))
    expect(senderColor('user-1', true)).not.toBe(senderColor('user-1', false))
  })

  it('formats file sizes per locale', () => {
    expect(fileSizeLabel(2_516_582, 'de')).toBe('2,4 MB')
    expect(fileSizeLabel(null, 'de')).toBeNull()
  })
})
