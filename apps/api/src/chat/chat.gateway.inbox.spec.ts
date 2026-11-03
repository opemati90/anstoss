import { ChatGateway } from './chat.gateway'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { io } from 'socket.io-client'
import { from } from 'rxjs'
import { GatewayMetadataExplorer } from '@nestjs/websockets/gateway-metadata-explorer'
import { MetadataScanner } from '@nestjs/core/metadata-scanner'

/**
 * Chat revamp: channel-authorized join/history/send, inbox:update fan-out to
 * per-user rooms, and push fan-out that skips muted readers.
 */
function makeGateway(overrides: {
  channelAccess?: Record<string, unknown>
  readers?: string[]
  unmutedReaders?: string[]
  dmParticipants?: string[]
  dmPeerMuted?: boolean
}) {
  const emitted: Array<{ room: string; event: string; payload: unknown }> = []
  const server = {
    to: jest.fn((room: string) => ({
      emit: (event: string, payload: unknown) => emitted.push({ room, event, payload }),
    })),
  }
  const prisma = {
    message: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'msg-1',
          teamId: data.teamId,
          channelId: data.channelId ?? null,
          content: data.content,
          isAnnouncement: data.isAnnouncement,
          replyToId: null,
          createdAt: new Date('2026-09-23T10:00:00Z'),
        }),
      ),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    team: { findFirst: jest.fn().mockResolvedValue({ id: 'team-anchor' }) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ preferredLanguage: 'de' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  }
  const push = {
    sendToUser: jest.fn().mockResolvedValue(undefined),
    sendToUserLocalized: jest.fn().mockResolvedValue(undefined),
    sendToTeam: jest.fn().mockResolvedValue(undefined),
  }
  const teams = { assertReadableAccess: jest.fn() }
  const channels = {
    getChannelAccess: jest.fn().mockResolvedValue(
      overrides.channelAccess ?? {
        canRead: true,
        canWrite: true,
        isManager: false,
        access: { membership: { role: 'PLAYER' }, activeTeamAccess: [{ role: 'PLAYER' }] },
        channel: { id: 'ch-1', clubId: 'club-1', teamId: 'team-1', kind: 'TEAM' },
      },
    ),
    isManagerAccess: jest.fn().mockReturnValue(false),
    listReadersForChannel: jest
      .fn()
      .mockImplementation((_id: string, opts?: any) =>
        Promise.resolve(
          opts?.excludeMuted
            ? (overrides.unmutedReaders ?? overrides.readers ?? [])
            : (overrides.readers ?? []),
        ),
      ),
  }
  const dm = {
    saveMessage: jest
      .fn()
      .mockImplementation((senderId: string, conversationId: string, input: any) =>
        Promise.resolve({
          id: 'dm-msg-1',
          conversationId,
          senderId,
          content: input.content,
          messageType: input.messageType,
          attachmentUrl: null,
          attachmentMeta: null,
          replyToId: input.replyToId ?? null,
          replyTo: null,
          sourceLanguage: null,
          translation: null,
          deletedAt: null,
          createdAt: '2026-09-23T10:00:00.000Z',
          sender: { id: senderId, name: 'Lukas Hoffmann', avatarUrl: null },
          reactions: [],
        }),
      ),
    getConversationClubId: jest.fn().mockResolvedValue('club-1'),
    listParticipantIds: jest.fn().mockResolvedValue(overrides.dmParticipants ?? []),
    getOtherParticipant: jest.fn().mockResolvedValue({ id: 'peer', name: 'Tim Weber' }),
    isParticipantMuted: jest.fn().mockResolvedValue(!!overrides.dmPeerMuted),
  }
  const translation = {
    detectAndPersistSource: jest.fn().mockResolvedValue(null),
    resolveTargetLanguage: jest.fn().mockReturnValue('de'),
    translateForReader: jest.fn().mockResolvedValue(null),
  }
  const moderation = { listBlockedUserIds: jest.fn().mockResolvedValue([]) }
  const gateway = new ChatGateway(
    prisma as any,
    push as any,
    teams as any,
    dm as any,
    translation as any,
    channels as any,
    moderation as any,
    {} as any,
  )
  gateway.server = server as any
  const client = {
    data: { userId: 'sender', userName: 'Lukas Hoffmann' },
    join: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
  } as any
  return { gateway, emitted, prisma, push, teams, channels, dm, client }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('ChatGateway channel:join', () => {
  it('refuses a channel the socket cannot read', async () => {
    const { gateway, client } = makeGateway({
      channelAccess: { canRead: false, channel: { id: 'ch-x', teamId: 'team-1' } },
    })
    await expect(gateway.handleChannelJoin(client, { channelId: 'ch-x' })).resolves.toEqual({
      event: 'error',
      data: { message: 'Forbidden for this channel' },
    })
    expect(client.join).not.toHaveBeenCalled()
  })

  it('joins the canonical room of a readable channel', async () => {
    const { gateway, client } = makeGateway({})
    await expect(gateway.handleChannelJoin(client, { channelId: 'ch-1' })).resolves.toEqual({
      event: 'channel:joined',
      data: { channelId: 'ch-1' },
    })
    expect(client.join).toHaveBeenCalledWith('channel:ch-1')
  })

  it('rejects malformed channel ids without touching the database', async () => {
    const { gateway, client, channels } = makeGateway({})
    await gateway.handleChannelJoin(client, { channelId: '../../etc' })
    expect(channels.getChannelAccess).not.toHaveBeenCalled()
  })
})

describe('ChatGateway channel history', () => {
  it('authorizes by the channel, not by the client-selected team', async () => {
    const { gateway, client, teams, channels, prisma } = makeGateway({})
    await gateway.handleHistory(client, { teamId: 'some-other-team', channelId: 'ch-1' })
    expect(channels.getChannelAccess).toHaveBeenCalledWith('sender', 'ch-1')
    expect(teams.assertReadableAccess).not.toHaveBeenCalled()
    expect(prisma.message.findMany.mock.calls[0][0].where).toMatchObject({ channelId: 'ch-1' })
    expect(prisma.message.findMany.mock.calls[0][0].where.teamId).toBeUndefined()
  })

  it('denies history for an unreadable channel', async () => {
    const { gateway, client, prisma } = makeGateway({
      channelAccess: { canRead: false, channel: { id: 'ch-1', teamId: 'team-1' } },
    })
    await expect(
      gateway.handleHistory(client, { teamId: 'team-1', channelId: 'ch-1' }),
    ).resolves.toEqual({ event: 'error', data: { message: 'Forbidden for this channel' } })
    expect(prisma.message.findMany).not.toHaveBeenCalled()
  })
})

describe('ChatGateway send fan-out', () => {
  it('emits inbox:update to every reader and pushes only unmuted readers', async () => {
    const { gateway, client, emitted, push, channels } = makeGateway({
      readers: ['sender', 'reader-a', 'reader-muted'],
      unmutedReaders: ['sender', 'reader-a'],
    })
    const ack = await gateway.handleMessage(client, {
      teamId: 'team-1',
      clubId: 'club-1',
      content: 'Treffpunkt 17:30 am Vereinsheim',
      channelId: 'ch-1',
    })
    await flush()
    // H4: the inbox fan-out is coalesced; flush the pending window.
    await gateway.flushInboxUpdate('ch-1')
    expect(ack).toMatchObject({ ok: true, id: 'msg-1' })

    const inboxRooms = emitted.filter((e) => e.event === 'inbox:update').map((e) => e.room)
    expect(inboxRooms.sort()).toEqual(['user:reader-a', 'user:reader-muted', 'user:sender'])
    expect(emitted.find((e) => e.event === 'inbox:update')?.payload).toEqual({
      type: 'CHANNEL',
      id: 'ch-1',
    })

    expect(channels.listReadersForChannel).toHaveBeenCalledWith('ch-1', { excludeMuted: true })
    expect(push.sendToUser).toHaveBeenCalledTimes(1)
    expect(push.sendToUser.mock.calls[0][0]).toBe('reader-a')
    expect(push.sendToUser.mock.calls[0][3]).toMatchObject({
      kind: 'CHAT_MESSAGE',
      channelId: 'ch-1',
      teamId: 'team-1',
      // M3: the tap can switch to the right club first.
      clubId: 'club-1',
    })
  })

  it('rejects a post to a channel the sender cannot write', async () => {
    const { gateway, client, prisma } = makeGateway({
      channelAccess: {
        canRead: true,
        canWrite: false,
        channel: { id: 'ch-ann', clubId: 'club-1', teamId: 'team-1', kind: 'ANNOUNCEMENTS' },
      },
    })
    await expect(
      gateway.handleMessage(client, {
        teamId: 'team-1',
        clubId: 'club-1',
        content: 'hi',
        channelId: 'ch-ann',
      }),
    ).resolves.toEqual({ event: 'error', data: { message: 'Forbidden for this channel' } })
    expect(prisma.message.create).not.toHaveBeenCalled()
  })

  it('treats a coach send in Ankündigungen as an announcement', async () => {
    const { gateway, client, prisma, push } = makeGateway({
      channelAccess: {
        canRead: true,
        canWrite: true,
        isManager: true,
        access: { membership: { role: 'COACH' }, activeTeamAccess: [] },
        channel: { id: 'ch-ann', clubId: 'club-1', teamId: 'team-1', kind: 'ANNOUNCEMENTS' },
      },
      readers: ['sender', 'reader-a'],
    })
    await gateway.handleMessage(client, {
      teamId: 'team-1',
      clubId: 'club-1',
      content: 'Training fällt aus',
      channelId: 'ch-ann',
    })
    await flush()
    expect(prisma.message.create.mock.calls[0][0].data.isAnnouncement).toBe(true)
    // L2: localized title (no emoji) resolved per recipient.
    expect(push.sendToUserLocalized.mock.calls[0][1]).toBe('ANNOUNCEMENT')
    expect(push.sendToUserLocalized.mock.calls[0][3]).toMatchObject({
      kind: 'announcement',
      channelId: 'ch-ann',
      clubId: 'club-1',
    })
    expect(push.sendToUserLocalized.mock.calls[0][4]).toMatchObject({ category: 'announcements' })
    expect(push.sendToTeam).not.toHaveBeenCalled()
  })

  it('anchors club-channel messages on a team of that club', async () => {
    const { gateway, client, prisma } = makeGateway({
      channelAccess: {
        canRead: true,
        canWrite: true,
        isManager: false,
        access: { membership: { role: 'PLAYER' }, activeTeamAccess: [] },
        channel: { id: 'ch-news', clubId: 'club-1', teamId: null, kind: 'CLUB_NEWS' },
      },
    })
    await gateway.handleMessage(client, {
      teamId: 'team-1',
      clubId: 'club-1',
      content: 'Sommerfest am Samstag',
      channelId: 'ch-news',
    })
    expect(prisma.team.findFirst).toHaveBeenCalledWith({
      where: { id: 'team-1', clubId: 'club-1' },
      select: { id: true },
    })
    expect(prisma.message.create.mock.calls[0][0].data).toMatchObject({
      teamId: 'team-anchor',
      clubId: 'club-1',
      channelId: 'ch-news',
    })
  })
})

describe('ChatGateway DM fan-out', () => {
  it('acknowledges history and send over the real Nest Socket.IO adapter', async () => {
    const { gateway, client, dm } = makeGateway({ dmParticipants: ['sender', 'peer'] })
    ;(gateway as any).isChatRateLimited = jest.fn().mockResolvedValue(false)
    ;(dm as any).getMessages = jest.fn().mockResolvedValue({ messages: [], hasMore: false })
    const adapter = new IoAdapter()
    const server = adapter.createIOServer(0)
    const mappings = new GatewayMetadataExplorer(new MetadataScanner()).explore(gateway)
      .filter((handler) => ['history', 'message', 'dm:history', 'dm:message'].includes(handler.message))
    expect(mappings).toHaveLength(4)
    expect(mappings.every((handler) => handler.isAckHandledManually)).toBe(true)
    server.on('connection', (socket: any) => {
      socket.data = client.data
      adapter.bindMessageHandlers(
        socket,
        mappings.map((handler) => ({ ...handler, callback: (data: any, ack: any) => handler.callback.call(gateway, socket, data, ack) })),
        (result: any) => from(Promise.resolve(result)),
      )
    })
    const socket = io(`http://127.0.0.1:${server.httpServer.address().port}`, {
      transports: ['websocket'],
      reconnection: false,
    })
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve)
        socket.once('connect_error', reject)
      })
      const history = await socket
        .timeout(2000)
        .emitWithAck('dm:history', { conversationId: 'conv-1' })
      expect(history).toMatchObject({ event: 'dm:history', data: { messages: [], hasMore: false } })
      const sent = await socket
        .timeout(2000)
        .emitWithAck('dm:message', {
          conversationId: 'conv-1',
          content: 'Hallo',
          clientMessageId: 'client-1',
        })
      expect(sent).toMatchObject({ ok: true, id: 'dm-msg-1', clientMessageId: 'client-1' })
      const denied = await socket
        .timeout(2000)
        .emitWithAck('dm:message', { conversationId: 'conv-1', content: '' })
      expect(denied).toMatchObject({ event: 'error', data: { message: 'Invalid message' } })
      ;(dm as any).getMessages.mockRejectedValueOnce(new Error('sensitive database details'))
      const failedHistory = await socket
        .timeout(2000)
        .emitWithAck('dm:history', { conversationId: 'conv-1' })
      expect(failedHistory).toMatchObject({
        ok: false,
        data: { message: 'Message history is temporarily unavailable' },
      })
      expect(JSON.stringify(failedHistory)).not.toContain('sensitive')
      ;(gateway as any).fanOutDirectMessage = jest
        .fn()
        .mockRejectedValue(new Error('provider down'))
      const saved = await socket
        .timeout(2000)
        .emitWithAck('dm:message', {
          conversationId: 'conv-1',
          content: 'Saved despite notification failure',
        })
      expect(saved).toMatchObject({ ok: true, id: 'dm-msg-1' })
      const channelHistory = await socket.timeout(2000).emitWithAck('history', { teamId: 'team-1', channelId: 'ch-1' })
      expect(channelHistory).toMatchObject({ event: 'history', data: { messages: [] } })
      const channelSent = await socket.timeout(2000).emitWithAck('message', { teamId: 'team-1', channelId: 'ch-1', content: 'Channel ack' })
      expect(channelSent).toMatchObject({ ok: true, id: 'msg-1' })
    } finally {
      socket.disconnect()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('updates both inboxes and skips the push when the peer muted the chat', async () => {
    const { gateway, client, emitted, push, dm } = makeGateway({
      dmParticipants: ['sender', 'peer'],
      dmPeerMuted: true,
    })
    ;(gateway as any).isChatRateLimited = jest.fn().mockResolvedValue(false)
    await gateway.handleDmMessage(client, { conversationId: 'conv-1', content: 'Hallo' })
    await flush()
    expect(dm.isParticipantMuted).toHaveBeenCalledWith('conv-1', 'peer')
    expect(push.sendToUser).not.toHaveBeenCalled()
    const rooms = emitted.filter((e) => e.event === 'inbox:update').map((e) => e.room)
    expect(rooms.sort()).toEqual(['user:peer', 'user:sender'])
  })

  it('pushes the peer when not muted', async () => {
    const { gateway, client, push } = makeGateway({ dmParticipants: ['sender', 'peer'] })
    ;(gateway as any).isChatRateLimited = jest.fn().mockResolvedValue(false)
    await gateway.handleDmMessage(client, { conversationId: 'conv-1', content: 'Hallo' })
    await flush()
    expect(push.sendToUser).toHaveBeenCalledWith(
      'peer',
      'Lukas Hoffmann',
      'Hallo',
      {
        type: 'dm',
        kind: 'DM_MESSAGE',
        conversationId: 'conv-1',
        messageId: 'dm-msg-1',
        clubId: 'club-1',
      },
      { clubId: 'club-1', category: 'chat' },
    )
  })

  it('replays a saved DM to connected participants without a duplicate push', async () => {
    const { gateway, emitted, push } = makeGateway({ dmParticipants: ['sender', 'peer'] })
    const message = { id: 'dm-msg-1', conversationId: 'conv-1', senderId: 'sender', messageType: 'IMAGE',
      content: '', sender: { id: 'sender', name: 'Lukas', avatarUrl: null } } as any
    await gateway.onDirectMessageRecovered({ message, clientMessageId: 'retry' })
    expect(emitted).toContainEqual(expect.objectContaining({ room: 'dm:conv-1', event: 'dm:message',
      payload: expect.objectContaining({ id: 'dm-msg-1', clientMessageId: 'retry' }) }))
    expect(push.sendToUser).not.toHaveBeenCalled()
    expect(push.sendToUserLocalized).not.toHaveBeenCalled()
  })
})

describe('Chat review fixes on the socket', () => {
  it('L3: rejects a send without a channel and never pushes', async () => {
    const { gateway, client, prisma, push } = makeGateway({ readers: ['sender', 'reader-a'] })
    await expect(
      gateway.handleMessage(client, { teamId: 'team-1', clubId: 'club-1', content: 'hi' }),
    ).resolves.toEqual({ event: 'error', data: { message: 'Channel required' } })
    await expect(gateway.handleHistory(client, { teamId: 'team-1' })).resolves.toEqual({
      event: 'error',
      data: { message: 'Channel required' },
    })
    expect(prisma.message.create).not.toHaveBeenCalled()
    expect(push.sendToUser).not.toHaveBeenCalled()
    expect(push.sendToTeam).not.toHaveBeenCalled()
  })

  it('L5: rejects a reply to a message of another channel', async () => {
    const { gateway, client, prisma } = makeGateway({})
    const ack = await gateway.handleMessage(client, {
      content: 'Genau',
      channelId: 'ch-1',
      replyToId: 'msg-in-coaches-channel',
    })
    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: { id: 'msg-in-coaches-channel', channelId: 'ch-1' },
      select: { id: true, senderId: true },
    })
    expect(ack).toEqual({ event: 'error', data: { message: 'Invalid reply target' } })
    expect(prisma.message.create).not.toHaveBeenCalled()
  })

  it('L4: typing goes to the channel room, never the team room', async () => {
    const { gateway, emitted } = makeGateway({ readers: ['sender', 'reader-a'] })
    const roomEmit = jest.fn()
    const typingClient = {
      data: { userId: 'sender', userName: 'Lukas Hoffmann' },
      to: jest.fn(() => ({ emit: roomEmit })),
    } as any
    await gateway.handleTyping(typingClient, { teamId: 'team-1', channelId: 'ch-1' })
    expect(typingClient.to).toHaveBeenCalledWith('channel:ch-1')
    expect(typingClient.to).not.toHaveBeenCalledWith('team:team-1')
    expect(roomEmit).toHaveBeenCalledWith('typing', {
      userId: 'sender',
      userName: 'Lukas Hoffmann',
      channelId: 'ch-1',
    })
    expect(emitted.filter((e) => e.event === 'inbox:typing').map((e) => e.room)).toEqual([
      'user:reader-a',
    ])
  })

  it('L4: typing into an unreadable channel is dropped', async () => {
    const { gateway } = makeGateway({
      channelAccess: { canRead: false, canWrite: false, channel: { id: 'ch-x', teamId: 'team-1' } },
    })
    const roomEmit = jest.fn()
    const typingClient = {
      data: { userId: 'sender', userName: 'Lukas Hoffmann' },
      to: jest.fn(() => ({ emit: roomEmit })),
    } as any
    await gateway.handleTyping(typingClient, { channelId: 'ch-x' })
    expect(roomEmit).not.toHaveBeenCalled()
  })

  it('H4: bursts in one channel coalesce into one inbox fan-out', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] })
    try {
      const { gateway, channels } = makeGateway({ readers: ['sender', 'reader-a'] })
      for (let i = 0; i < 5; i += 1) void gateway.emitInboxUpdateForChannel('ch-1')
      jest.advanceTimersByTime(1_600)
      await flush()
      const plainReads = channels.listReadersForChannel.mock.calls.filter((c: any[]) => !c[1])
      expect(plainReads).toHaveLength(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('H5: an under-16 without consent cannot connect or send', async () => {
    const { gateway } = makeGateway({})
    const ageGate = { isAllowed: jest.fn().mockResolvedValue(false) }
    ;(gateway as any).ageGate = ageGate
    const blocked = {
      data: { userId: 'kid', userName: 'Mia' },
      disconnect: jest.fn(),
    } as any
    await expect(
      gateway.handleMessage(blocked, { content: 'hi', channelId: 'ch-1' }),
    ).resolves.toEqual({ event: 'error', data: { message: 'Age verification required' } })
    expect(blocked.disconnect).toHaveBeenCalled()
    expect(ageGate.isAllowed).toHaveBeenCalledWith('kid', {})
  })

  it('H5: consent is checked for the channel club/team scope', async () => {
    const { gateway, client, prisma } = makeGateway({})
    const ageGate = {
      isAllowed: jest.fn((_u: string, scope: any) => Promise.resolve(!scope.clubId)),
    }
    ;(gateway as any).ageGate = ageGate
    client.disconnect = jest.fn()
    await expect(
      gateway.handleMessage(client, { content: 'hi', channelId: 'ch-1' }),
    ).resolves.toEqual({ event: 'error', data: { message: 'Age verification required' } })
    expect(ageGate.isAllowed).toHaveBeenCalledWith('sender', { clubId: 'club-1', teamId: 'team-1' })
    expect(prisma.message.create).not.toHaveBeenCalled()
  })

  it('L5 (DM): a reply target outside the conversation is refused by the service', async () => {
    const { gateway, client, dm } = makeGateway({})
    ;(gateway as any).isChatRateLimited = jest.fn().mockResolvedValue(false)
    dm.saveMessage.mockRejectedValueOnce(new Error('Invalid reply target'))
    await expect(
      gateway.handleDmMessage(client, {
        conversationId: 'conv-1',
        content: 'Ja',
        replyToId: 'dm-other',
      }),
    ).resolves.toEqual({ event: 'error', data: { message: 'Invalid reply target' } })
    expect(dm.saveMessage).toHaveBeenCalledWith('sender', 'conv-1', {
      messageType: 'TEXT',
      content: 'Ja',
      replyToId: 'dm-other',
    })
  })

  it('H5: inbox:update only reaches readers who pass the age gate for the channel', async () => {
    const { gateway, emitted, prisma } = makeGateway({ readers: ['adult', 'kid-no-consent'] })
    ;(prisma as any).channel = {
      findUnique: jest.fn().mockResolvedValue({ clubId: 'club-1', teamId: 'team-1' }),
    }
    const ageGate = {
      filterAllowedUserIds: jest.fn(async (ids: string[]) =>
        ids.filter((id) => id !== 'kid-no-consent'),
      ),
    }
    ;(gateway as any).ageGate = ageGate
    await gateway.flushInboxUpdate('ch-1')
    expect(ageGate.filterAllowedUserIds).toHaveBeenCalledWith(['adult', 'kid-no-consent'], {
      clubId: 'club-1',
      teamId: 'team-1',
    })
    expect(emitted.filter((e) => e.event === 'inbox:update').map((e) => e.room)).toEqual([
      'user:adult',
    ])
  })

  it('H5: dm events are gated for the conversation club', async () => {
    const { gateway, client, dm } = makeGateway({})
    ;(gateway as any).isChatRateLimited = jest.fn().mockResolvedValue(false)
    const ageGate = { isAllowed: jest.fn(async (_u: string, scope: any) => !scope.clubId) }
    ;(gateway as any).ageGate = ageGate
    client.disconnect = jest.fn()
    await expect(
      gateway.handleDmMessage(client, { conversationId: 'conv-1', content: 'Hallo' }),
    ).resolves.toEqual({ event: 'error', data: { message: 'Age verification required' } })
    expect(ageGate.isAllowed).toHaveBeenCalledWith('sender', { clubId: 'club-1' })
    expect(dm.saveMessage).not.toHaveBeenCalled()
  })
})
