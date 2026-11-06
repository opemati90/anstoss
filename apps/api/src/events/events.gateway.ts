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
import { OnEvent } from '@nestjs/event-emitter'
import { assertLaunchBirthDate, assertLaunchParticipant } from '../auth/launch-access-policy'

/**
 * Socket.io gateway for live event updates.
 *
 * - JWT auth on connection (HS256 session token, same as the REST guard /
 *   chat gateway).
 * - Room per team: `team:{teamId}`.
 * - Emits:
 *     - `event:upsert` — when an event or availability changes; clients refetch
 *                        the authorized, roster-filtered event feed.
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
        select: { id: true, dateOfBirth: true },
      })
      if (!user) {
        client.disconnect()
        return
      }
      assertLaunchBirthDate(user.dateOfBirth ?? new Date(NaN))

      client.data.userId = user.id
      if (typeof client.join === 'function') {
        await client.join(`user:${user.id}`)
      }
    } catch {
      client.disconnect()
    }
  }

  @OnEvent('realtime.access.changed')
  async onRealtimeAccessChanged(payload: { userId: string }) {
    if (!this.server) return
    const sockets = await this.server.in(`user:${payload.userId}`).fetchSockets()
    for (const socket of sockets) socket.disconnect(true)
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
      await assertLaunchParticipant(this.prisma, userId)
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
   * Invalidate the event feed after an RSVP change. The feed's authoritative
   * counts exclude inactive and loaned-out players; raw RSVP counts do not.
   */
  async emitRsvpUpdate(teamId: string, eventId: string) {
    if (!this.server) return
    try {
      this.server.to(`team:${teamId}`).emit('event:upsert', { eventId, teamId })
    } catch (err) {
      this.logger.warn(
        `Failed to emit event:upsert for ${eventId}: ${
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
