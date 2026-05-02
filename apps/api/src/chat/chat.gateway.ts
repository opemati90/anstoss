import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { Redis } from 'ioredis'
import { verifyToken } from '@clerk/backend'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { DmService } from '../dm/dm.service'
import { CHAT } from '@anstoss/shared'
import { TeamsService } from '../teams/teams.service'
import { TranslationService } from '../translation/translation.service'

/**
 * Socket.io gateway for team chat.
 *
 * - JWT auth on connection (Clerk token)
 * - Room per team: `team:{teamId}`
 * - Messages persisted to Postgres
 * - Redis adapter for horizontal scaling
 * - Rate limited: 1 msg/sec per user (Redis-backed for cluster safety)
 */
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  private readonly logger = new Logger(ChatGateway.name)

  @WebSocketServer()
  server: Server

  // ---------------------------------------------------------------------

  // (mention parser shared with the message handler)

  /**
   * Broadcast helper used by ChatService for non-gateway-originated
   * mutations (REST reactions, edits, deletes, media posts). Emits a
   * neutral `chat:event` payload that the client can use to patch its
   * local message state.
   */
  broadcastChatEvent(
    teamId: string,
    payload: {
      kind:
        | 'reaction-added'
        | 'reaction-removed'
        | 'edited'
        | 'deleted'
        | 'media'
        | 'poll'
        | 'rsvp-poll'
        | 'lineup'
      message?: unknown
      messageId?: string
      emoji?: string
      userId?: string
    },
  ) {
    if (!this.server) return
    this.server.to(`team:${teamId}`).emit('chat:event', payload)
  }

  // Redis client for rate limiting (shared with adapter connection)
  private rateLimitRedis: Redis | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
    private readonly teamsService: TeamsService,
    private readonly dmService: DmService,
    private readonly translation: TranslationService,
  ) {}

  /**
   * Wire Redis adapter for multi-instance pub/sub + rate limiting.
   */
  afterInit(server: Server) {
    const redisUrl = process.env.REDIS_URL
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not set — chat running without Redis adapter (single-instance only)')
      return
    }

    const pubClient = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true })
    const subClient = pubClient.duplicate()

    // Dedicated client for rate limiting (non-blocking, separate from pub/sub)
    this.rateLimitRedis = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true })
    this.rateLimitRedis.connect().catch((err) => {
      this.logger.error('Failed to connect rate-limit Redis', err)
      this.rateLimitRedis = null
    })

    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        server.adapter(createAdapter(pubClient, subClient))
        this.logger.log('Redis adapter connected for chat')
      })
      .catch((err) => {
        this.logger.error('Failed to connect Redis adapter', err)
      })
  }

  /**
   * Authenticate on connection — verify Clerk JWT from auth query param.
   */
  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string)

      if (!token) {
        client.disconnect()
        return
      }

      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      })

      const clerkId = payload.sub
      if (!clerkId) {
        client.disconnect()
        return
      }

      const user = await this.prisma.user.findUnique({
        where: { clerkId },
        select: { id: true, name: true },
      })

      if (!user) {
        client.disconnect()
        return
      }

      // Store user info on socket for later use
      client.data.userId = user.id
      client.data.userName = user.name
    } catch {
      client.disconnect()
    }
  }

  handleDisconnect(_client: Socket) {
    // Cleanup if needed
  }

  /**
   * Join a team chat room.
   */
  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { teamId: string },
  ) {
    const userId = client.data.userId as string | undefined
    if (!userId) {
      return { event: 'error', data: { message: 'Unauthorized' } }
    }

    await this.teamsService.assertReadableAccess(userId, data.teamId)
    const room = `team:${data.teamId}`
    await client.join(room)
    return { event: 'joined', data: { teamId: data.teamId } }
  }

  /**
   * Leave a team chat room.
   */
  @SubscribeMessage('leave')
  async handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { teamId: string },
  ) {
    const room = `team:${data.teamId}`
    await client.leave(room)
    return { event: 'left', data: { teamId: data.teamId } }
  }

  /**
   * Send a message to a team chat room.
   * Rate limited: 1 msg/sec per user.
   */
  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { teamId: string; clubId: string; content: string; isAnnouncement?: boolean },
  ) {
    const userId = client.data.userId as string
    if (!userId) return

    const access = await this.teamsService.assertReadableAccess(userId, data.teamId)

    // Rate limit check (Redis-backed for cluster safety)
    const rateLimitKey = `chat:rate:${userId}`
    if (this.rateLimitRedis) {
      try {
        const result = await this.rateLimitRedis.set(
          rateLimitKey,
          '1',
          'PX',
          Math.ceil(1000 / CHAT.MESSAGES_PER_SECOND),
          'NX',
        )
        if (!result) {
          return { event: 'error', data: { message: 'Too fast' } }
        }
      } catch {
        // Redis unavailable — allow the message rather than blocking all chat
        this.logger.warn('Chat rate limit Redis unavailable, allowing message')
      }
    }

    // Validate content
    const content = data.content?.trim()
    if (!content || content.length > CHAT.MAX_MESSAGE_LENGTH) {
      return { event: 'error', data: { message: 'Invalid message' } }
    }

    const canAnnounce =
      access.membership?.role === 'OWNER' ||
      access.membership?.role === 'ADMIN' ||
      access.membership?.role === 'COACH' ||
      access.activeTeamAccess.some((entry: any) =>
        entry.role === 'HEAD_COACH' || entry.role === 'ASSISTANT_COACH',
      )

    // Use server-side clubId from team lookup — never trust client-sent clubId
    const clubId = access.team.clubId

    // Optional reply target — sent by the new chat UI when replying.
    const replyToId =
      typeof (data as { replyToId?: unknown }).replyToId === 'string'
        ? ((data as { replyToId?: string }).replyToId as string)
        : null

    // Persist message
    const message = await this.prisma.message.create({
      data: {
        teamId: data.teamId,
        clubId,
        senderId: userId,
        content,
        isAnnouncement: !!data.isAnnouncement && canAnnounce,
        replyToId: replyToId ?? undefined,
      },
    })

    // Detect source language eagerly so the first reader doesn't pay the
    // detection cost. Fire-and-forget — translation service must never
    // delay or break message delivery.
    void this.translation.detectAndPersistSource('channel', message.id, content).catch(() => undefined)

    // Broadcast to room
    const room = `team:${data.teamId}`
    this.server.to(room).emit('message', {
      id: message.id,
      teamId: message.teamId,
      senderId: userId,
      senderName: client.data.userName,
      content: message.content,
      sourceLanguage: null,
      translation: null,
      isAnnouncement: message.isAnnouncement,
      replyToId: message.replyToId,
      createdAt: message.createdAt,
    })

    // Reply push: notify the parent author when someone else replies.
    if (replyToId) {
      this.prisma.message
        .findUnique({
          where: { id: replyToId },
          select: { senderId: true },
        })
        .then((parent) => {
          if (!parent || parent.senderId === userId) return
          return this.pushService.sendToUser(
            parent.senderId,
            `${client.data.userName} replied`,
            content.length > 100 ? content.slice(0, 97) + '...' : content,
            {
              kind: 'MESSAGE_REPLY',
              messageId: message.id,
              teamId: data.teamId,
            },
            { clubId },
          )
        })
        .catch(() => undefined)
    }

    // Mention push: parse @firstname and DM the matching teammate.
    const mentionedNames = parseMentions(content)
    if (mentionedNames.length > 0) {
      const teamUsers = await this.prisma.user.findMany({
        where: {
          teamAccess: {
            some: { teamId: data.teamId, status: 'ACTIVE' },
          },
        },
        select: { id: true, name: true },
      })
      const senderName = (client.data.userName as string) || ''
      const mentioned = new Set<string>()
      for (const u of teamUsers as Array<{ id: string; name: string }>) {
        if (u.id === userId) continue
        const first = u.name.split(/\s+/)[0]?.toLowerCase()
        if (!first) continue
        if (mentionedNames.includes(first)) mentioned.add(u.id)
      }
      for (const targetId of mentioned) {
        this.pushService
          .sendToUser(
            targetId,
            `${senderName} mentioned you`,
            content.length > 100 ? content.slice(0, 97) + '...' : content,
            {
              kind: 'MENTION',
              messageId: message.id,
              teamId: data.teamId,
            },
            { clubId },
          )
          .catch(() => undefined)
      }
    }

    // Push notification for announcements (immediate, not batched)
    if (message.isAnnouncement) {
      this.pushService
        .sendToTeam(
          data.teamId,
          `📢 ${client.data.userName}`,
          content.length > 100 ? content.slice(0, 97) + '...' : content,
          { type: 'announcement', teamId: data.teamId, messageId: message.id },
          userId,
        )
        .catch((err) => this.logger.error('Failed to send announcement push', err))
    }

    return { event: 'sent', data: { id: message.id } }
  }

  /**
   * Broadcast typing indicators to everyone else in the room.
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { teamId: string },
  ) {
    const userId = client.data.userId as string | undefined
    const userName = client.data.userName as string | undefined

    if (!userId || !userName || !data.teamId) {
      return
    }

    await this.teamsService.assertReadableAccess(userId, data.teamId)

    client.to(`team:${data.teamId}`).emit('typing', {
      userId,
      userName,
    })
  }

  /**
   * Search messages in a team chat room.
   * Returns up to 20 results matching the query.
   */
  @SubscribeMessage('search')
  async handleSearch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { teamId: string; query: string },
  ) {
    const userId = client.data.userId as string | undefined
    if (!userId) {
      return { event: 'error', data: { message: 'Unauthorized' } }
    }

    const query = data.query?.trim()
    if (!query || query.length < 2) {
      return { event: 'search_results', data: { messages: [] } }
    }

    await this.teamsService.assertReadableAccess(userId, data.teamId)

    const messages = await this.prisma.message.findMany({
      where: {
        teamId: data.teamId,
        content: { contains: query, mode: 'insensitive' },
      },
      include: {
        sender: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return {
      event: 'search_results',
      data: { messages: messages.reverse() },
    }
  }

  /**
   * Fetch message history — cursor-based pagination.
   */
  @SubscribeMessage('history')
  async handleHistory(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { teamId: string; cursor?: string },
  ) {
    const userId = client.data.userId as string | undefined
    if (!userId) {
      return { event: 'error', data: { message: 'Unauthorized' } }
    }

    await this.teamsService.assertReadableAccess(userId, data.teamId)

    const messages = await this.prisma.message.findMany({
      where: {
        teamId: data.teamId,
        ...(data.cursor ? { createdAt: { lt: new Date(data.cursor) } } : {}),
      },
      include: {
        sender: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: CHAT.PAGE_SIZE,
    })

    const enriched = await this.enrichMessagesWithTranslation(userId, messages)

    return {
      event: 'history',
      data: {
        messages: enriched.reverse(),
        hasMore: messages.length === CHAT.PAGE_SIZE,
      },
    }
  }

  /**
   * For each message, attempt to translate to the reader's preferred
   * language. The `translation` field is null when source matches target
   * (no translation needed) or when the translation service is unavailable.
   */
  private async enrichMessagesWithTranslation<
    M extends { id: string; content: string; sourceLanguage: string | null; messageType: string },
  >(userId: string, messages: M[]): Promise<Array<M & { translation: { content: string; sourceLanguage: string } | null }>> {
    if (messages.length === 0) return messages.map((m) => ({ ...m, translation: null }))
    const reader = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferredLanguage: true },
    })
    const target = this.translation.resolveTargetLanguage(reader?.preferredLanguage, null)
    return Promise.all(
      messages.map(async (m) => {
        // Translation only makes sense for text-based content. Voice / image /
        // poll messages have synthetic content placeholders and are skipped.
        if (m.messageType !== 'TEXT' && m.messageType !== 'SYSTEM') {
          return { ...m, translation: null }
        }
        const result = await this.translation.translateForReader(
          'channel',
          m.id,
          m.sourceLanguage,
          m.content,
          target,
        )
        return { ...m, translation: result }
      }),
    )
  }

  // ─── Direct Message Events ──────────────────────────────

  /**
   * Join a DM conversation room.
   */
  @SubscribeMessage('dm:join')
  async handleDmJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.userId as string | undefined
    if (!userId) {
      return { event: 'error', data: { message: 'Unauthorized' } }
    }

    // assertConversationAccess is called inside getMessages
    await this.dmService.getMessages(userId, data.conversationId)
    const room = `dm:${data.conversationId}`
    await client.join(room)
    return { event: 'dm:joined', data: { conversationId: data.conversationId } }
  }

  /**
   * Send a direct message.
   */
  @SubscribeMessage('dm:message')
  async handleDmMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; content: string },
  ) {
    const userId = client.data.userId as string
    if (!userId) return

    const content = data.content?.trim()
    if (!content || content.length > CHAT.MAX_MESSAGE_LENGTH) {
      return { event: 'error', data: { message: 'Invalid message' } }
    }

    // Rate limit (reuse team chat rate limiter)
    const rateLimitKey = `chat:rate:${userId}`
    if (this.rateLimitRedis) {
      try {
        const result = await this.rateLimitRedis.set(
          rateLimitKey, '1', 'PX',
          Math.ceil(1000 / CHAT.MESSAGES_PER_SECOND), 'NX',
        )
        if (!result) {
          return { event: 'error', data: { message: 'Too fast' } }
        }
      } catch {
        this.logger.warn('DM rate limit Redis unavailable, allowing message')
      }
    }

    const message = await this.dmService.saveMessage(userId, data.conversationId, content)

    // Broadcast to DM room
    const room = `dm:${data.conversationId}`
    this.server.to(room).emit('dm:message', {
      id: message.id,
      conversationId: data.conversationId,
      senderId: userId,
      senderName: client.data.userName,
      content: message.content,
      createdAt: message.createdAt,
    })

    // Push notification to the other participant
    const otherUser = await this.dmService.getOtherParticipant(data.conversationId, userId)
    if (otherUser) {
      const preview = content.length > 100 ? content.slice(0, 97) + '...' : content
      this.pushService
        .sendToUser(
          otherUser.id,
          client.data.userName || 'Message',
          preview,
          { type: 'dm', conversationId: data.conversationId },
        )
        .catch((err) => this.logger.error('Failed to send DM push', err))
    }

    return { event: 'dm:sent', data: { id: message.id } }
  }

  /**
   * DM typing indicator.
   */
  @SubscribeMessage('dm:typing')
  async handleDmTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.userId as string | undefined
    const userName = client.data.userName as string | undefined
    if (!userId || !userName) return

    client.to(`dm:${data.conversationId}`).emit('dm:typing', {
      userId,
      userName,
    })
  }

  /**
   * Mark DM conversation as read.
   */
  @SubscribeMessage('dm:read')
  async handleDmRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.userId as string | undefined
    if (!userId) return

    await this.dmService.markAsRead(userId, data.conversationId)

    client.to(`dm:${data.conversationId}`).emit('dm:read', {
      userId,
      conversationId: data.conversationId,
    })
  }

  /**
   * Fetch DM history (cursor-based pagination).
   */
  @SubscribeMessage('dm:history')
  async handleDmHistory(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; cursor?: string },
  ) {
    const userId = client.data.userId as string | undefined
    if (!userId) {
      return { event: 'error', data: { message: 'Unauthorized' } }
    }

    const result = await this.dmService.getMessages(userId, data.conversationId, data.cursor)

    return {
      event: 'dm:history',
      data: result,
    }
  }
}

function parseMentions(content: string): string[] {
  const found = new Set<string>()
  const regex = /(^|\s)@([\p{L}][\p{L}\p{N}_-]{0,40})/giu
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    if (match[2]) found.add(match[2].toLowerCase())
  }
  return Array.from(found)
}

