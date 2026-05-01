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
import { verifyToken } from '@clerk/backend'
import { PrismaService } from '../prisma/prisma.service'
import { TeamsService } from '../teams/teams.service'

/**
 * Socket.io gateway for live match streaming.
 *
 * Room model: `live:{fixtureId}`
 * Events:
 *   client → 'live:join' { fixtureId }
 *   client ← 'live:state' { score, minute, status }
 *   client ← 'live:event' { kind, minute, player, side, detail? }
 *   client ← 'live:final' { resultHome, resultAway }
 *
 * Pushed by the FussballService poller as it detects state changes
 * (see fussball.service.ts upsertImportedFixture diff hooks).
 */
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/live',
})
export class LiveGateway implements OnGatewayConnection, OnGatewayInit {
  private readonly logger = new Logger(LiveGateway.name)

  @WebSocketServer()
  server: Server

  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
  ) {}

  afterInit(server: Server) {
    const redisUrl = process.env.REDIS_URL
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not set — live gateway running without Redis adapter')
      return
    }

    const pubClient = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true })
    const subClient = pubClient.duplicate()
    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        server.adapter(createAdapter(pubClient, subClient))
        this.logger.log('Redis adapter connected for live gateway')
      })
      .catch((err) => {
        this.logger.error('Failed to connect Redis adapter on live gateway', err)
      })
  }

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

  @SubscribeMessage('live:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { fixtureId: string },
  ) {
    const userId = client.data.userId as string | undefined
    if (!userId) return { event: 'error', data: { message: 'Unauthorized' } }

    const fixture = await this.prisma.importedFixture.findUnique({
      where: { id: data.fixtureId },
      select: { id: true, teamId: true, status: true, resultHome: true, resultAway: true },
    })
    if (!fixture) return { event: 'error', data: { message: 'Fixture not found' } }

    await this.teamsService.assertReadableAccess(userId, fixture.teamId)
    const room = `live:${fixture.id}`
    await client.join(room)

    return {
      event: 'live:state',
      data: {
        fixtureId: fixture.id,
        status: fixture.status,
        resultHome: fixture.resultHome,
        resultAway: fixture.resultAway,
      },
    }
  }

  /**
   * Broadcast helper used by FussballService when a fixture status changes.
   */
  broadcastEvent(
    fixtureId: string,
    event: {
      kind: 'goal' | 'sub' | 'yellow' | 'red' | 'pen' | 'own_goal' | 'state'
      minute?: number
      player?: string
      side?: 'home' | 'away'
      detail?: string
      status?: string
      resultHome?: number | null
      resultAway?: number | null
    },
  ) {
    if (!this.server) return
    this.server.to(`live:${fixtureId}`).emit(
      event.kind === 'state' ? 'live:state' : 'live:event',
      event,
    )
  }
}
