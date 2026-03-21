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
import { CHAT } from '@anstoss/shared'

/**
 * Socket.io gateway for team chat.
 *
 * - JWT auth on connection (Clerk token)
 * - Room per team: `team:{teamId}`
 * - Messages persisted to Postgres
 * - Redis adapter for horizontal scaling
 * - Rate limited: 1 msg/sec per user
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

  // Simple in-memory rate limit tracker (per-user last send timestamp)
  private lastSend = new Map<string, number>()

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Wire Redis adapter for multi-instance pub/sub.
   */
  afterInit(server: Server) {
    const redisUrl = process.env.UPSTASH_REDIS_URL
    if (!redisUrl) {
      this.logger.warn('UPSTASH_REDIS_URL not set — chat running without Redis adapter (single-instance only)')
      return
    }

    const pubClient = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true })
    const subClient = pubClient.duplicate()

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
    @MessageBody() data: { teamId: string; clubId: string; content: string },
  ) {
    const userId = client.data.userId as string
    if (!userId) return

    // Rate limit check
    const now = Date.now()
    const last = this.lastSend.get(userId) || 0
    if (now - last < 1000 / CHAT.MESSAGES_PER_SECOND) {
      return { event: 'error', data: { message: 'Too fast' } }
    }
    this.lastSend.set(userId, now)

    // Validate content
    const content = data.content?.trim()
    if (!content || content.length > CHAT.MAX_MESSAGE_LENGTH) {
      return { event: 'error', data: { message: 'Invalid message' } }
    }

    // Persist message
    const message = await this.prisma.message.create({
      data: {
        teamId: data.teamId,
        clubId: data.clubId,
        senderId: userId,
        content,
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
      createdAt: message.createdAt,
    })

    return { event: 'sent', data: { id: message.id } }
  }

  /**
   * Fetch message history — cursor-based pagination.
   */
  @SubscribeMessage('history')
  async handleHistory(
    @MessageBody() data: { teamId: string; cursor?: string },
  ) {
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
