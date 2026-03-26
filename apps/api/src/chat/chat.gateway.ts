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
import { CHAT } from '@anstoss/shared'
import { TeamsService } from '../teams/teams.service'

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

  // Redis client for rate limiting (shared with adapter connection)
  private rateLimitRedis: Redis | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
    private readonly teamsService: TeamsService,
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

    // Persist message
    const message = await this.prisma.message.create({
      data: {
        teamId: data.teamId,
        clubId,
        senderId: userId,
        content,
        isAnnouncement: !!data.isAnnouncement && canAnnounce,
      },
    })

    // Broadcast to room
    const room = `team:${data.teamId}`
    this.server.to(room).emit('message', {
      id: message.id,
      teamId: message.teamId,
      senderId: userId,
      senderName: client.data.userName,
      content: message.content,
      isAnnouncement: message.isAnnouncement,
      createdAt: message.createdAt,
    })

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

    return {
      event: 'history',
      data: {
        messages: messages.reverse(),
        hasMore: messages.length === CHAT.PAGE_SIZE,
      },
    }
  }
}
