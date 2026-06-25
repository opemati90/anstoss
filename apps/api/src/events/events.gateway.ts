import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { Redis } from 'ioredis'
import { verifySessionToken } from '../auth/otp/jwt.util'
import { PrismaService } from '../prisma/prisma.service'
import { getSocketCorsOptions } from '../realtime/socket-cors'
import { TeamsService } from '../teams/teams.service'

/**
 * Socket.io gateway for live event updates.
 *
 * - JWT auth on connection (HS256 session token, same as the REST guard /
 *   chat gateway).
 * - Room per team: `team:{teamId}`.
 * - Emits:
 *     - `event:rsvp`   — when an RSVP is created/changed; carries the event id
 *                        and fresh yes/maybe/no/response counts so clients can
 *                        patch their cached feed without a refetch.
 *     - `event:upsert` — when an event is created or updated.
 * - Redis adapter for horizontal scaling (mirrors the chat gateway). Without
 *   REDIS_URL it runs single-instance, which is fine for dev/staging.
 *
 * The events feed itself is still fetched over REST; this gateway only pushes
 * deltas so stale RSVP counts self-heal in realtime.
 */
@WebSocketGateway({
  cors: getSocketCorsOptions(),
  namespace: '/events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayInit {
  private readonly logger = new Logger(EventsGateway.name)

  @WebSocketServer()
  server: Server

  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
  ) {}

  afterInit(server: Server) {
    const redisUrl = process.env.REDIS_URL
    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL not set — events gateway running without Redis adapter (single-instance only)',
      )
      return
    }

    const pubClient = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true })
    const subClient = pubClient.duplicate()

    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        server.adapter(createAdapter(pubClient, subClient))
        this.logger.log('Redis adapter connected for events')
      })
      .catch((err) => {
        this.logger.error('Failed to connect Redis adapter for events', err)
      })
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) || (client.handshake.query?.token as string)

      if (!token) {
        client.disconnect()
        return
      }

      const payload = verifySessionToken(token)
      const userId = payload.sub
      if (!userId) {
        client.disconnect()
        return
      }

      const user = await this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { id: true },
      })
      if (!user) {
        client.disconnect()
        return
      }

      client.data.userId = user.id
    } catch {
      client.disconnect()
    }
  }

  /**
   * Join a team's event room. Authorized against team read access so a
   * socket can only subscribe to teams the user may actually see.
   */
  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() data: { teamId: string }) {
    const userId = client.data.userId as string | undefined
    if (!userId || !data?.teamId) {
      return { event: 'error', data: { message: 'Unauthorized' } }
    }

    try {
      await this.teamsService.assertReadableAccess(userId, data.teamId)
    } catch {
      return { event: 'error', data: { message: 'Forbidden' } }
    }

    await client.join(`team:${data.teamId}`)
    return { event: 'joined', data: { teamId: data.teamId } }
  }

  @SubscribeMessage('leave')
  async handleLeave(@ConnectedSocket() client: Socket, @MessageBody() data: { teamId: string }) {
    if (data?.teamId) {
      await client.leave(`team:${data.teamId}`)
    }
    return { event: 'left', data: { teamId: data?.teamId } }
  }

  /**
   * Broadcast fresh RSVP counts for an event to its team room. Called by
   * EventsService after an RSVP upsert. Counts are recomputed server-side
   * so every client converges on the same totals.
   */
  async emitRsvpUpdate(teamId: string, eventId: string) {
    if (!this.server) return
    try {
      const grouped = await this.prisma.rsvp.groupBy({
        by: ['status'],
        where: { eventId },
        _count: { status: true },
      })
      const countFor = (status: string) =>
        grouped.find((g: { status: string }) => g.status === status)?._count.status ?? 0
      const yesCount = countFor('YES')
      const maybeCount = countFor('MAYBE')
      const noCount = countFor('NO')
      this.server.to(`team:${teamId}`).emit('event:rsvp', {
        eventId,
        teamId,
        yesCount,
        maybeCount,
        noCount,
        responseCount: yesCount + maybeCount + noCount,
      })
    } catch (err) {
      this.logger.warn(
        `Failed to emit event:rsvp for ${eventId}: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      )
    }
  }

  /**
   * Broadcast an event create/update to its team room so connected clients
   * can refresh the affected event without a full refetch.
   */
  emitEventUpsert(teamId: string, eventId: string) {
    if (!this.server) return
    this.server.to(`team:${teamId}`).emit('event:upsert', { eventId, teamId })
  }
}
