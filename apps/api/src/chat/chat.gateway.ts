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
import { forwardRef, Inject, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Server, Socket } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { Redis } from 'ioredis'
import { verifySessionToken } from '../auth/otp/jwt.util'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { DmService } from '../dm/dm.service'
import { CHAT } from '@anstoss/shared'
import { TeamsService } from '../teams/teams.service'
import { activeTeamAccessWhere } from '../teams/active-team-access'
import { TranslationService } from '../translation/translation.service'
import { ChannelsService } from '../channels/channels.service'
import { ModerationService } from '../moderation/moderation.service'
import { getSocketCorsOptions } from '../realtime/socket-cors'
import { ChatService } from './chat.service'

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
  cors: getSocketCorsOptions(),
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
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
   *
   * When channelId is provided the emit is scoped to the per-channel
   * room (`team:{teamId}:channel:{channelId}`) so that COACHES_ONLY /
   * PARENTS_ONLY channel content is never broadcast to users who didn't
   * join that room. Without channelId the message belongs to the legacy
   * team-wide stream and is sent to the `team:{teamId}` room as before.
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
    channelId?: string | null,
  ) {
    if (!this.server) return
    const room = channelId ? `channel:${channelId}` : `team:${teamId}`
    this.server.to(room).emit('chat:event', payload)
  }

  // Redis client for rate limiting (shared with adapter connection)
  private rateLimitRedis: Redis | null = null
  private readonly localRateLimits = new Map<string, number>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
    private readonly teamsService: TeamsService,
    private readonly dmService: DmService,
    private readonly translation: TranslationService,
    private readonly channelsService: ChannelsService,
    private readonly moderationService: ModerationService,
    // forwardRef: ChatService injects this gateway (for REST→socket broadcast),
    // so the dependency is mutual.
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
  ) {}

  /**
   * Wire Redis adapter for multi-instance pub/sub + rate limiting.
   */
  afterInit(server: Server) {
    const redisUrl = process.env.REDIS_URL
    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL not set — chat running without Redis adapter (single-instance only)',
      )
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

  private async isChatRateLimited(userId: string): Promise<boolean> {
    const ttlMs = Math.ceil(1000 / CHAT.MESSAGES_PER_SECOND)
    if (this.rateLimitRedis) {
      try {
        const result = await this.rateLimitRedis.set(`chat:rate:${userId}`, '1', 'PX', ttlMs, 'NX')
        return !result
      } catch {
        this.logger.warn('Chat rate limit Redis unavailable; using bounded local fallback')
      }
    }

    const now = Date.now()
    const blockedUntil = this.localRateLimits.get(userId) ?? 0
    if (blockedUntil > now) return true
    this.localRateLimits.set(userId, now + ttlMs)
    // Keep the emergency map bounded during prolonged Redis outages.
    if (this.localRateLimits.size > 10_000) {
      for (const [key, expiry] of this.localRateLimits) {
        if (expiry <= now) this.localRateLimits.delete(key)
      }
    }
    return false
  }

  /**
   * Authenticate on connection — verify the HS256 session JWT from the
   * auth/query param (same token the REST guard verifies).
   */
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
        select: { id: true, name: true },
      })

      if (!user) {
        client.disconnect()
        return
      }

      // Store user info on socket for later use
      client.data.userId = user.id
      client.data.userName = user.name
      // Per-user room so the server can live-subscribe this socket to a
      // newly-created/joined channel's rooms (see onChannelMemberAdded)
      // without waiting for a reconnect.
      await client.join(`user:${user.id}`)
    } catch {
      client.disconnect()
    }
  }

  /**
   * When a user is added to (or creates) a CUSTOM channel, join their open
   * sockets to that channel's rooms immediately. Without this the channel's
   * realtime room set is frozen at the last `join`, so a freshly-added member
   * gets no live messages until they reconnect.
   */
  @OnEvent('channel.member.added')
  async onChannelMemberAdded(payload: {
    userId: string
    teamId: string | null
    channelId: string
  }) {
    if (!this.server) return
    const sockets = await this.server.in(`user:${payload.userId}`).fetchSockets()
    if (sockets.length === 0) return
    const rooms = [`channel:${payload.channelId}`]
    if (payload.teamId) {
      rooms.push(`team:${payload.teamId}:channel:${payload.channelId}`)
    }
    for (const socket of sockets) {
      for (const room of rooms) socket.join(room)
    }
  }

  /**
   * Drop open sockets whenever membership/channel access changes. The mobile
   * client reconnects automatically and rebuilds rooms from current DB access,
   * preventing a removed member from retaining stale private-room delivery.
   */
  @OnEvent('realtime.access.changed')
  async onRealtimeAccessChanged(payload: { userId: string }) {
    if (!this.server) return
    const sockets = await this.server.in(`user:${payload.userId}`).fetchSockets()
    for (const socket of sockets) socket.disconnect(true)
  }

  handleDisconnect(_client: Socket) {
    // Cleanup if needed
  }

  /**
   * Join a team chat room. Also subscribes the socket to per-channel
   * rooms for every channel the user is allowed to read, so private
   * channel emits don't leak via the team-wide broadcast.
   */
  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() data: { teamId: string }) {
    const userId = client.data.userId as string | undefined
    if (!userId) {
      return { event: 'error', data: { message: 'Unauthorized' } }
    }

    await this.teamsService.assertReadableAccess(userId, data.teamId)
    const room = `team:${data.teamId}`
    await client.join(room)

    // Per-channel rooms: only join the ones this user can read. A
    // parent's socket never joins `team:X:channel:coaches`, so emits
    // scoped to that room can't leak to them — even if the client
    // chose to ignore its own filter.
    try {
      const channels = await this.channelsService.listForUser(userId, data.teamId)
      await Promise.all(
        channels.flatMap((c) => [
          client.join(`team:${data.teamId}:channel:${c.id}`),
          // Canonical per-channel room. REST-posted messages (announcements,
          // SYSTEM "X joined") and club-level channels (which span multiple
          // teams) broadcast here, since they have no single team room. Joined
          // only for channels listForUser deems readable, so privacy holds.
          client.join(`channel:${c.id}`),
        ]),
      )
    } catch {
      // listForUser failures shouldn't kick the socket; the team room
      // still receives team-wide messages.
    }
    return { event: 'joined', data: { teamId: data.teamId } }
  }

  /**
   * Leave a team chat room (plus all per-channel rooms for this team).
   */
  @SubscribeMessage('leave')
  async handleLeave(@ConnectedSocket() client: Socket, @MessageBody() data: { teamId: string }) {
    const room = `team:${data.teamId}`
    await client.leave(room)
    const channelRoomPrefix = `team:${data.teamId}:channel:`
    for (const r of client.rooms) {
      if (r.startsWith(channelRoomPrefix)) {
        await client.leave(r)
      }
    }
    // NB: the canonical `channel:${id}` rooms are intentionally NOT left here.
    // Club-level channels are shared across every team a user belongs to, so
    // leaving team A must not silently cut off a club channel they still read
    // via team B. Stale canonical subscriptions are harmless (membership was
    // gated at join) and a full socket teardown (channel switch / disconnect)
    // clears them anyway.
    return { event: 'left', data: { teamId: data.teamId } }
  }

  /**
   * Send a message to a team chat room.
   * Rate limited: 1 msg/sec per user.
   */
  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      teamId: string
      clubId: string
      content: string
      isAnnouncement?: boolean
      channelId?: string | null
      replyToId?: string | null
    },
  ) {
    const userId = client.data.userId as string
    if (!userId) return

    const access = await this.teamsService.assertReadableAccess(userId, data.teamId)

    // Rate limit check (Redis-backed for cluster safety)
    if (await this.isChatRateLimited(userId)) {
      return { event: 'error', data: { message: 'Too fast' } }
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
      access.activeTeamAccess.some(
        (entry: any) => entry.role === 'HEAD_COACH' || entry.role === 'ASSISTANT_COACH',
      )

    // Use server-side clubId from team lookup — never trust client-sent clubId
    const clubId = access.team.clubId

    // Optional reply target — sent by the new chat UI when replying.
    const replyToId = typeof data.replyToId === 'string' ? data.replyToId : null

    // Optional channel scope — when the rail picks "Coaches" or
    // "Announcements", the client passes the channelId. Without it,
    // the message lands in the team-wide stream (legacy / general
    // chat). Server validates the channel actually belongs to this
    // team before persisting.
    let channelId: string | null = null
    if (typeof data.channelId === 'string' && data.channelId.length > 0) {
      const ch = await this.prisma.channel.findFirst({
        where: {
          id: data.channelId,
          OR: [{ teamId: data.teamId }, { teamId: null, clubId }],
        },
        select: { id: true },
      })
      if (!ch) {
        return { event: 'error', data: { message: 'Invalid channel for team' } }
      }
      // Channel-aware authz: belongs-to-team is necessary but not
      // sufficient. A parent who knows the Coaches channelId could post
      // there without this check. assertWritable validates against the
      // channel's visibility (COACHES_ONLY / PARENTS_ONLY / etc.).
      try {
        await this.channelsService.assertWritable(userId, ch.id)
      } catch {
        return { event: 'error', data: { message: 'Forbidden for this channel' } }
      }
      channelId = ch.id
    }

    // Persist message
    const message = await this.prisma.message.create({
      data: {
        teamId: data.teamId,
        clubId,
        channelId: channelId ?? undefined,
        senderId: userId,
        content,
        isAnnouncement: !!data.isAnnouncement && canAnnounce,
        replyToId: replyToId ?? undefined,
      },
    })

    // Detect source language eagerly; after detection broadcast the result so
    // clients can show translated content without waiting for history reload.
    void this.translation
      .detectAndPersistSource('channel', message.id, content)
      .then((sourceLanguage) => {
        if (sourceLanguage) {
          this.server.to(room).emit('message:source', {
            messageId: message.id,
            sourceLanguage,
          })
        }
      })
      .catch(() => undefined)

    // Channel-aware emit. Without a channelId, the message lands in the
    // legacy team-wide stream and goes to every team socket. With a
    // channelId, scope to `team:${teamId}:channel:${channelId}` — a
    // socket only joined that room if `handleJoin` confirmed the user
    // can read the channel, so private channels never leak content even
    // if a misbehaving client tried to subscribe.
    const room = channelId ? `channel:${channelId}` : `team:${data.teamId}`
    this.server.to(room).emit('message', {
      id: message.id,
      teamId: message.teamId,
      channelId: message.channelId,
      senderId: userId,
      senderName: client.data.userName,
      content: message.content,
      sourceLanguage: null,
      translation: null,
      isAnnouncement: message.isAnnouncement,
      replyToId: message.replyToId,
      createdAt: message.createdAt,
    })

    const senderName = (client.data.userName as string) || ''
    const preview = content.length > 100 ? content.slice(0, 97) + '...' : content

    // Resolve the reply-parent author so they get a "replied" push rather
    // than a generic one.
    let replyParentId: string | null = null
    if (replyToId) {
      const parent = await this.prisma.message.findUnique({
        where: { id: replyToId },
        select: { senderId: true },
      })
      replyParentId = parent?.senderId && parent.senderId !== userId ? parent.senderId : null
    }

    // Resolve @firstname mentions to teammate ids.
    const mentionedNames = parseMentions(content)
    const mentioned = new Set<string>()
    if (mentionedNames.length > 0) {
      const teamUsers = await this.prisma.user.findMany({
        where: { teamAccess: { some: { teamId: data.teamId, ...activeTeamAccessWhere() } } },
        select: { id: true, name: true },
      })
      for (const u of teamUsers as Array<{ id: string; name: string }>) {
        if (u.id === userId) continue
        const first = u.name?.split(/\s+/)[0]?.toLowerCase()
        if (first && mentionedNames.includes(first)) mentioned.add(u.id)
      }
    }

    if (message.isAnnouncement) {
      // Announcements: a single team-wide push (existing behavior).
      this.pushService
        .sendToTeam(
          data.teamId,
          `📢 ${senderName}`,
          preview,
          { type: 'announcement', teamId: data.teamId, messageId: message.id },
          userId,
          { clubId, category: 'announcements' },
        )
        .catch((err) => this.logger.error('Failed to send announcement push', err))
    } else {
      // Normal message: WhatsApp-style fan-out to every reader except the
      // sender, picking the most specific reason (reply > mention > message)
      // so nobody gets two buzzes for one message. Channel-scoped messages
      // resolve readers via listChannelReaderIds, so a Coaches-only message
      // never previews to players/parents.
      const readerIdsPromise = data.channelId
        ? this.channelsService.listChannelReaderIds(data.teamId, data.channelId)
        : this.prisma.user
            .findMany({
              where: {
                teamAccess: { some: { teamId: data.teamId, ...activeTeamAccessWhere() } },
              },
              select: { id: true },
            })
            .then((us) => us.map((u) => u.id))
      readerIdsPromise
        .then((readerIds) =>
          Promise.all(
            readerIds
              .filter((rid) => rid !== userId)
              .map((rid) => {
                const isReply = rid === replyParentId
                const isMention = mentioned.has(rid)
                const title = isReply
                  ? `${senderName} replied`
                  : isMention
                    ? `${senderName} mentioned you`
                    : senderName
                const kind = isReply ? 'MESSAGE_REPLY' : isMention ? 'MENTION' : 'CHAT_MESSAGE'
                return this.pushService.sendToUser(
                  rid,
                  title,
                  preview,
                  {
                    kind,
                    messageId: message.id,
                    teamId: data.teamId,
                    channelId: data.channelId ?? '',
                  },
                  { clubId },
                )
              }),
          ),
        )
        .catch(() => undefined)
    }

    return { event: 'sent', data: { id: message.id } }
  }

  /**
   * Broadcast typing indicators to everyone else in the room.
   */
  @SubscribeMessage('typing')
  async handleTyping(@ConnectedSocket() client: Socket, @MessageBody() data: { teamId: string }) {
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

    // Channel-aware authz: search returns ALL team messages by default,
    // including private-channel content. Scope to channels this user
    // can read (always include the legacy null-channel stream so the
    // General tab still works pre-migration).
    const visibleChannels = await this.channelsService.listForUser(userId, data.teamId)
    const visibleChannelIds = visibleChannels.map((c) => c.id)
    const blockedUserIds = await this.moderationService.listBlockedUserIds(userId)

    const messages = await this.prisma.message.findMany({
      where: {
        teamId: data.teamId,
        content: { contains: query, mode: 'insensitive' },
        OR: [{ channelId: null }, { channelId: { in: visibleChannelIds } }],
        ...(blockedUserIds.length > 0 && {
          // NULL senderId (SYSTEM messages) must not be excluded by the block filter
          AND: [{ OR: [{ senderId: null }, { senderId: { notIn: blockedUserIds } }] }],
        }),
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
    @MessageBody() data: { teamId: string; cursor?: string; channelId?: string | null },
  ) {
    const userId = client.data.userId as string | undefined
    if (!userId) {
      return { event: 'error', data: { message: 'Unauthorized' } }
    }

    await this.teamsService.assertReadableAccess(userId, data.teamId)

    // Channel-aware authz: a parent who knows the Coaches channelId
    // could otherwise paginate through Coaches history without ever
    // joining the channel. assertWritable would reject writes but
    // history is a read; channelsService.listForUser already filters
    // visible channels — use it as the membership oracle.
    let channelFilter: { channelId: string } | { channelId: null }
    let isClubChannel = false
    if (typeof data.channelId === 'string' && data.channelId.length > 0) {
      const visibleChannels = await this.channelsService.listForUser(userId, data.teamId)
      const allowed = visibleChannels.some((c) => c.id === data.channelId)
      if (!allowed) {
        return { event: 'error', data: { message: 'Forbidden for this channel' } }
      }
      channelFilter = { channelId: data.channelId }
      const selected = visibleChannels.find((c) => c.id === data.channelId)
      isClubChannel = selected?.teamId === null
    } else {
      // General tab: legacy team-wide stream (no channelId).
      channelFilter = { channelId: null }
    }

    const blockedUserIds = await this.moderationService.listBlockedUserIds(userId)

    const messages = await this.prisma.message.findMany({
      where: {
        ...(!isClubChannel ? { teamId: data.teamId } : {}),
        ...channelFilter,
        ...(data.cursor ? { createdAt: { lt: new Date(data.cursor) } } : {}),
        ...(blockedUserIds.length > 0 && {
          // NULL senderId (SYSTEM messages) must not be excluded by the block filter
          OR: [{ senderId: null }, { senderId: { notIn: blockedUserIds } }],
        }),
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
   * Mark a whole channel read for the calling user. Seeds read receipts for
   * every unread message in the channel so its unread badge clears. Authz
   * mirrors `history`: team read access + the channel must be in the user's
   * listForUser set (so a parent can't clear/peek a Coaches channel).
   */
  @SubscribeMessage('markChannelRead')
  async handleMarkChannelRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { teamId: string; channelId?: string | null },
  ) {
    const userId = client.data.userId as string | undefined
    if (!userId) {
      return { event: 'error', data: { message: 'Unauthorized' } }
    }
    // Only channel-scoped streams carry an unread badge; skip the legacy
    // team-wide (null channelId) stream.
    if (typeof data.channelId !== 'string' || data.channelId.length === 0) {
      return { event: 'marked', data: { marked: 0 } }
    }

    await this.teamsService.assertReadableAccess(userId, data.teamId)
    const visibleChannels = await this.channelsService.listForUser(userId, data.teamId)
    if (!visibleChannels.some((c) => c.id === data.channelId)) {
      return { event: 'error', data: { message: 'Forbidden for this channel' } }
    }

    const result = await this.chatService.markChannelRead(userId, data.channelId)
    return { event: 'marked', data: result }
  }

  /**
   * For each message, attempt to translate to the reader's preferred
   * language. The `translation` field is null when source matches target
   * (no translation needed) or when the translation service is unavailable.
   */
  private async enrichMessagesWithTranslation<
    M extends { id: string; content: string; sourceLanguage: string | null; messageType: string },
  >(
    userId: string,
    messages: M[],
  ): Promise<Array<M & { translation: { content: string; sourceLanguage: string } | null }>> {
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
    if (await this.isChatRateLimited(userId)) {
      return { event: 'error', data: { message: 'Too fast' } }
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
        .sendToUser(otherUser.id, client.data.userName || 'Message', preview, {
          type: 'dm',
          conversationId: data.conversationId,
        })
        .catch((err) => this.logger.error('Failed to send DM push', err))
    }

    // Ack shape matches the mobile useDmChat hook expectation:
    // { ok: true, id }. Without `ok` the client treated every send as
    // a failure and surfaced "send_error" even though the message was
    // persisted server-side. Keeping the legacy event/data fields too
    // for any future Socket.io client that reads them.
    return { ok: true, id: message.id, event: 'dm:sent', data: { id: message.id } }
  }

  /**
   * Handles messages posted via the REST path (e.g. AnnounceSheet).
   * Broadcasts the new message to the appropriate Socket.io room so
   * connected clients see it immediately without a history reload.
   * Also sends a push notification when the message is an announcement.
   */
  @OnEvent('channel.message.created')
  async handleRestMessage(payload: {
    message: {
      id: string
      content: string
      teamId: string
      channelId: string
      senderId: string | null
      createdAt: Date
      isAnnouncement: boolean
      messageType: string
    }
    channelId: string
    clubId: string
    teamId: string | null
  }) {
    if (!this.server) return
    const { message, channelId, teamId } = payload

    // Emit to the per-channel room so only subscribed clients receive it.
    this.server.to(`channel:${channelId}`).emit('message', {
      id: message.id,
      content: message.content,
      channelId,
      userId: message.senderId,
      senderId: message.senderId,
      createdAt: message.createdAt.toISOString(),
      messageType: message.messageType ?? 'TEXT',
      isAnnouncement: message.isAnnouncement,
    })

    // Push notification for team-scoped announcement channels.
    if (message.isAnnouncement && teamId) {
      this.pushService
        .sendToTeam(
          teamId,
          '📢 Announcement',
          message.content.length > 100 ? message.content.slice(0, 97) + '...' : message.content,
          { type: 'announcement', teamId, messageId: message.id },
          message.senderId ?? undefined,
          // Respect quiet-hours + mutedAnnouncements (the socket announcement
          // path already passes these; the REST path leaked to muted users).
          { clubId: payload.clubId, category: 'announcements' },
        )
        .catch((err) => this.logger.error('Failed to send REST announcement push', err))
    }
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
