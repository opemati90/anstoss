import { ChatInboxService, inboxPreview } from './chat-inbox.service'

describe('ChatInboxService', () => {
  it('merges channels and DMs into one list, newest activity first', async () => {
    const channels = {
      listInboxChannels: jest.fn().mockResolvedValue([
        {
          id: 'ch-team',
          clubId: 'club-1',
          teamId: 'team-1',
          slug: 'team',
          kind: 'TEAM',
          name: 'Team',
          description: null,
          visibility: 'MEMBERS',
          canWrite: true,
          unreadCount: 3,
          lastMessage: null,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
          teamName: 'Herren I',
          muted: false,
          mutedUntil: null,
          lastMessageRaw: {
            senderId: 'u-2',
            senderName: 'Tim Weber',
            content: 'Bin dabei!',
            type: 'TEXT',
            createdAt: '2026-09-22T18:00:00.000Z',
          },
        },
        {
          id: 'ch-ann',
          clubId: 'club-1',
          teamId: 'team-1',
          slug: 'announcements',
          kind: 'ANNOUNCEMENTS',
          name: 'Announcements',
          description: null,
          visibility: 'MEMBERS',
          canWrite: false,
          unreadCount: 0,
          lastMessage: null,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
          teamName: 'Herren I',
          muted: true,
          mutedUntil: null,
          lastMessageRaw: null,
        },
      ]),
    }
    const dm = {
      listConversations: jest.fn().mockResolvedValue([
        {
          id: 'conv-1',
          otherUser: { id: 'u-3', name: 'Lukas Hoffmann', avatarUrl: 'https://x/a.png' },
          lastMessage: {
            content: 'Fahrgemeinschaft Samstag?',
            senderId: 'u-3',
            senderName: 'Lukas Hoffmann',
            createdAt: new Date('2026-09-23T08:00:00.000Z'),
          },
          unreadCount: 2,
          muted: false,
          mutedUntil: null,
          createdAt: new Date('2026-09-10T00:00:00.000Z'),
          updatedAt: new Date('2026-09-23T08:00:00.000Z'),
        },
      ]),
    }
    const service = new ChatInboxService(channels as never, dm as never)
    const items = await service.getInbox('me', 'club-1')

    expect(items.map((i) => i.id)).toEqual(['conv-1', 'ch-team', 'ch-ann'])
    expect(items[0]).toMatchObject({
      type: 'DM',
      kind: 'DM',
      title: 'Lukas Hoffmann',
      otherUserId: 'u-3',
      unreadCount: 2,
      lastMessage: { preview: 'Fahrgemeinschaft Samstag?', type: 'TEXT' },
    })
    expect(items[1]).toMatchObject({
      type: 'CHANNEL',
      kind: 'TEAM',
      teamName: 'Herren I',
      unreadCount: 3,
      lastMessage: { senderName: 'Tim Weber', preview: 'Bin dabei!' },
    })
    expect(items[2]).toMatchObject({ muted: true, lastMessage: null, canWrite: false })
  })
})

describe('inboxPreview', () => {
  it('returns raw content, flattened and trimmed to 80 chars', () => {
    expect(inboxPreview('Wer fährt?\n\nAbfahrt 9:00')).toBe('Wer fährt? Abfahrt 9:00')
    expect(inboxPreview('x'.repeat(120))).toHaveLength(80)
    expect(inboxPreview(null)).toBe('')
  })
})
