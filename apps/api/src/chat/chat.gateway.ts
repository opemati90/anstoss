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
import { forwardRef, Inject, Logger, Optional } from '@nestjs/common'
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
import { TranslationService } from '../translation/translation.service'
import { ChannelsService } from '../channels/channels.service'
import { ModerationService } from '../moderation/moderation.service'
import { getSocketCorsOptions } from '../realtime/socket-cors'
import { ChatService } from './chat.service'
import { PlatformSettingsService } from '../admin/platform-settings.service'
import { AgeGateService, type AgeGateScope } from '../auth/age-gate.service'
import type { DirectMessageItem } from '@anstoss/shared'

/** H5: how long a socket's passed age-gate check is trusted before re-checking. */
const AGE_GATE_RECHECK_MS = 60_000
/** H4: inbox:update fan-out per channel is coalesced into one emit per window. */
const INBOX_UPDATE_COALESCE_MS = 1_500
/** Reader lists for typing previews in the inbox are cached briefly. */
const TYPING_READERS_TTL_MS = 30_000

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
  /**
   * Deliver a server-originated message (a SYSTEM notice) to the clients
   * already reading the channel, using the same `message` event and payload
   * shape a user-sent message uses so the client renders it identically.
   */
  emitServerMessage(
    teamId: string,
    channelId: string | null,
    payload: Record<string, unknown>,
  ) {
    // L3: the legacy team-wide stream is gone; a notice without a channel
    // has no audience room.
    if (!channelId) return
    this.server.to(`channel:${channelId}`).emit('message', payload)
    void this.emitInboxUpdateForChannel(channelId)
  }

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

  /**
   * Tell each user's open sockets (any screen, via the per-user room joined on
   * connect) that an inbox row changed, so the inbox refetches without
   * polling. Payload is only the row key; the client re-reads via REST, which
   * re-authorizes.
   */
  emitInboxUpdate(userIds: string[], payload: { type: 'CHANNEL' | 'DM'; id: string }) {
    if (!this.server) return
    for (const userId of new Set(userIds)) {
      this.server.to(`user:${userId}`).emit('inbox:update', payload)
    }
  }

  /**
   * inbox:update to every reader of a channel (muted readers included).
   * H4: bursts are coalesced per channel: the first message schedules one
   * fan-out INBOX_UPDATE_COALESCE_MS later and later messages in that window
   * ride along, so a busy match-day thread costs one reader lookup + one
   * emit per reader per window instead of per message.
   */
  private readonly pendingInboxUpdates = new Map<string, ReturnType<typeof setTimeout>>()

  emitInboxUpdateForChannel(channelId: string | null | undefined): Promise<void> {
    if (!this.server || !channelId) return Promise.resolve()
    if (this.pendingInboxUpdates.has(channelId)) return Promise.resolve()
    const timer = setTimeout(() => {
      this.pendingInboxUpdates.delete(channelId)
      void this.flushInboxUpdate(channelId)
    }, INBOX_UPDATE_COALESCE_MS)
    timer.unref?.()
    this.pendingInboxUpdates.set(channelId, timer)
    return Promise.resolve()
  }

  async flushInboxUpdate(channelId: string): Promise<void> {
    try {
      const readers = await this.channelsService.listReadersForChannel(channelId)
      const scope = await this.channelScope(channelId)
      this.emitInboxUpdate(await this.allowedIds(readers, scope), { type: 'CHANNEL', id: channelId })
    } catch (err) {
      this.logger.warn(`inbox:update fan-out failed for ${channelId}: ${String(err)}`)
    }
  }

  private readonly typingReaders = new Map<string, { ids: string[]; at: number }>()

  private async cachedReaders(channelId: string): Promise<string[]> {
    const cached = this.typingReaders.get(channelId)
    if (cached && Date.now() - cached.at < TYPING_READERS_TTL_MS) return cached.ids
    const ids = await this.channelsService.listReadersForChannel(channelId)
    this.typingReaders.set(channelId, { ids, at: Date.now() })
    if (this.typingReaders.size > 5_000) this.typingReaders.clear()
    return ids
  }

  /**
   * H5: the REST age gate, applied to sockets. An under-16 without approved
   * parental consent (or with withdrawn consent) cannot open or keep using a
   * chat socket. Uses the same AgeGateService as the global HTTP guard.
   */
  async passesAgeGate(userId: string, scope: AgeGateScope = {}): Promise<boolean> {
    if (!this.ageGate) return true
    try {
      return await this.ageGate.isAllowed(userId, scope)
    } catch {
      return false
    }
  }

  /**
   * Per-event gate with a short trust window per scope (consent can be
   * withdrawn; withdrawal also emits realtime.access.changed, which drops
   * the socket). A socket that fails the unscoped gate is disconnected.
   */
  private async ensureAgeGate(client: Socket, scope: AgeGateScope = {}): Promise<boolean> {
    const userId = client.data.userId as string | undefined
    if (!userId) return false
    const key = `${scope.clubId ?? ''}:${scope.teamId ?? ''}`
    const checks = (client.data.ageGateChecks ??= {}) as Record<string, number>
    const checkedAt = checks[key]
    if (checkedAt && Date.now() - checkedAt < AGE_GATE_RECHECK_MS) return true
    if (await this.passesAgeGate(userId, scope)) {
      checks[key] = Date.now()
      return true
    }
    if (!scope.clubId) client.disconnect(true)
    return false
  }

  private ageGateError() {
    return { event: 'error', data: { message: 'Age verification required' } }
  }

  /** Realtime fan-out only reaches users who pass the age gate for the scope. */
  private async allowedIds(userIds: string[], scope: AgeGateScope): Promise<string[]> {
    if (!this.ageGate || userIds.length === 0) return userIds
    try {
      return await this.ageGate.filterAllowedUserIds(userIds, scope)
    } catch {
      return []
    }
  }

  private async channelScope(channelId: string): Promise<AgeGateScope> {
    const channel = await this.prisma.channel
      ?.findUnique({ where: { id: channelId }, select: { clubId: true, teamId: true } })
      .catch(() => null)
    return channel ? { clubId: channel.clubId, teamId: channel.teamId } : {}
  }

  /** DM events are scoped to the conversation's club. */
  private async ensureDmAgeGate(client: Socket, conversationId: string): Promise<boolean> {
    const clubId = await this.dmService.getConversationClubId?.(conversationId).catch(() => null)
    return this.ensureAgeGate(client, clubId ? { clubId } : {})
  }

  // Redis client for rate limiting (shared with adapter connection)
  private rateLimitRedis: Redis | null = null
  private warnedRateLimitRedisUnavailable = false
  private readonly localRateLimits = new Map<string, { count: number; resetAt: number }>()
  private readonly localTypingRateLimits = new Map<string, number>()

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
    private readonly platformSettings?: PlatformSettingsService,
    @Optional() private readonly ageGate?: AgeGateService,
  ) {}

  private async isChatDisabled() {
    return (await this.platformSettings?.get('kill_switch_chat')) === 'true'
  }

  private chatDisabledError() {
    return { event: 'error', data: { message: 'Chat is temporarily unavailable' } }
  }

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

  private async isChatRateLimited(
    userId: string,
    kind: 'channel' | 'dm' = 'channel',
  ): Promise<boolean> {
    const ttlMs = 60_000
    const limit = kind === 'dm' ? 30 : 60
    const key = `chat:rate:${kind}:${userId}`
    if (this.rateLimitRedis) {
      try {
        const count = await this.rateLimitRedis.incr(key)
        if (count === 1) await this.rateLimitRedis.pexpire(key, ttlMs)
        this.warnedRateLimitRedisUnavailable = false
        return count > limit
      } catch {
        if (!this.warnedRateLimitRedisUnavailable) {
          this.warnedRateLimitRedisUnavailable = true
          this.logger.warn('Chat rate limit Redis unavailable; using bounded local fallback')
        }
      }
    }

    const now = Date.now()
    const current = this.localRateLimits.get(key)
    const next = !current || current.resetAt <= now
      ? { count: 1, resetAt: now + ttlMs }
      : { count: current.count + 1, resetAt: current.resetAt }
    this.localRateLimits.set(key, next)
    // Keep the emergency map bounded during prolonged Redis outages.
    if (this.localRateLimits.size > 10_000) {
      for (const [entryKey, value] of this.localRateLimits) {
        if (value.resetAt <= now) this.localRateLimits.delete(entryKey)
      }
    }
    return next.count > limit
  }

  private async isTypingRateLimited(userId: string, conversationId: string): Promise<boolean> {
    const ttlMs = 1_500
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(conversationId)) return true
    // The user-wide key must be checked first. Otherwise an attacker can use
    // arbitrary conversation IDs to force a fresh authorization query each
    // time and bypass per-conversation coalescing.
    if (await this.claimTypingWindow(`chat:typing-user:${userId}`, ttlMs)) return true
    const key = `chat:typing:${userId}:${conversationId}`
    return this.claimTypingWindow(key, ttlMs)
  }

  private async claimTypingWindow(key: string, ttlMs: number): Promise<boolean> {
    if (this.rateLimitRedis) {
      try {
        const result = await this.rateLimitRedis.set(key, '1', 'PX', ttlMs, 'NX')
        return !result
      } catch {
        this.logger.warn('Typing rate limit Redis unavailable; using bounded local fallback')
      }
    }
    const now = Date.now()
    const blockedUntil = this.localTypingRateLimits.get(key) ?? 0
    if (blockedUntil > now) return true
    this.localTypingRateLimits.set(key, now + ttlMs)
    if (this.localTypingRateLimits.size > 10_000) {
      for (const [entryKey, expiry] of this.localTypingRateLimits) {
        if (expiry <= now) this.localTypingRateLimits.delete(entryKey)
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

      // H5: same age gate as the REST controllers.
      if (!(await this.passesAgeGate(user.id))) {
        client.disconnect()
        return
      }
      client.data.ageGateChecks = { ':': Date.now() }

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
    if (await this.isChatDisabled()) return this.chatDisabledError()
    if (!(await this.ensureAgeGate(client))) return this.ageGateError()

    const teamAccess = await this.teamsService.assertReadableAccess(userId, data.teamId)
    // H5: consent is per club/team.
    if (!(await this.ensureAgeGate(client, { clubId: teamAccess.team.clubId, teamId: data.teamId }))) {
      return this.ageGateError()
    }
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
   * Join one channel's canonical room, authorized by the channel itself (not
   * by whichever team the client has selected). Used by the conversation
   * screen for club channels and groups.
   */
  @SubscribeMessage('channel:join')
  async handleChannelJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId?: string },
  ) {
    const userId = client.data.userId as string | undefined
    if (!userId) return { event: 'error', data: { message: 'Unauthorized' } }
    if (await this.isChatDisabled()) return this.chatDisabledError()
    if (!(await this.ensureAgeGate(client))) return this.ageGateError()
    if (typeof data?.channelId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.channelId)) {
      return { event: 'error', data: { message: 'Invalid channel' } }
    }
    let access
    try {
      access = await this.channelsService.getChannelAccess(userId, data.channelId)
    } catch {
      return { event: 'error', data: { message: 'Forbidden for this channel' } }
    }
    if (!access.canRead) {
      return { event: 'error', data: { message: 'Forbidden for this channel' } }
    }
    if (
      !(await this.ensureAgeGate(client, {
        clubId: access.channel.clubId,
        teamId: access.channel.teamId,
      }))
    ) {
      return this.ageGateError()
    }
    await client.join(`channel:${data.channelId}`)
    if (access.channel.teamId) {
      await client.join(`team:${access.channel.teamId}:channel:${data.channelId}`)
    }
    return { event: 'channel:joined', data: { channelId: data.channelId } }
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
   * Send a message to a channel. The channel is the authority (so club
   * channels and groups work whatever team the client has selected).
   * L3: the legacy channel-less team stream is closed — sends without a
   * channelId are rejected and never pushed.
   * Rate limited per user (Redis-backed for cluster safety).
   */
  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      teamId?: string
      clubId?: string
      content: string
      clientMessageId?: string | null
      isAnnouncement?: boolean
      channelId?: string | null
      replyToId?: string | null
    },
  ) {
    const userId = client.data.userId as string
    if (!userId) return
    if (await this.isChatDisabled()) {
      return { event: 'error', data: { message: 'Chat is temporarily unavailable' } }
    }
    if (!(await this.ensureAgeGate(client))) return this.ageGateError()

    if (typeof data?.channelId !== 'string' || data.channelId.length === 0) {
      return { event: 'error', data: { message: 'Channel required' } }
    }

    let channelAccess
    try {
      channelAccess = await this.channelsService.getChannelAccess(userId, data.channelId)
    } catch {
      return { event: 'error', data: { message: 'Invalid channel for team' } }
    }
    if (!channelAccess.canRead || !channelAccess.canWrite) {
      return { event: 'error', data: { message: 'Forbidden for this channel' } }
    }
    const channel = channelAccess.channel
    const clubId = channel.clubId
    const channelId = channel.id
    // H5: consent is per club/team; an approval in another club opens nothing here.
    if (!(await this.ensureAgeGate(client, { clubId, teamId: channel.teamId }))) {
      return this.ageGateError()
    }
    let teamId: string
    if (channel.teamId) {
      teamId = channel.teamId
    } else {
      // Club-level channel: Message.teamId is only an anchor. Prefer the
      // client's team when it belongs to this club, else the first team.
      const anchor =
        typeof data.teamId === 'string' && data.teamId
          ? await this.prisma.team.findFirst({
              where: { id: data.teamId, clubId },
              select: { id: true },
            })
          : null
      const fallback = anchor
        ? anchor
        : await this.prisma.team.findFirst({ where: { clubId }, select: { id: true } })
      if (!fallback) return { event: 'error', data: { message: 'Invalid channel for team' } }
      teamId = fallback.id
    }

    // Rate limit check (Redis-backed for cluster safety)
    if (await this.isChatRateLimited(userId)) {
      return { event: 'error', data: { message: 'Too fast' } }
    }

    // Validate content
    const content = typeof data.content === 'string' ? data.content.trim() : ''
    if (!content || content.length > CHAT.MAX_MESSAGE_LENGTH) {
      return { event: 'error', data: { message: 'Invalid message' } }
    }

    // L5: a reply must quote a message of the same channel. Resolved once,
    // also used for the "replied" push.
    let replyToId: string | null = null
    let replyParentId: string | null = null
    if (typeof data.replyToId === 'string' && data.replyToId.length > 0) {
      const parent = await this.prisma.message.findFirst({
        where: { id: data.replyToId, channelId },
        select: { id: true, senderId: true },
      })
      if (!parent) return { event: 'error', data: { message: 'Invalid reply target' } }
      replyToId = parent.id
      replyParentId = parent.senderId && parent.senderId !== userId ? parent.senderId : null
    }

    // H1/M4: only an Ankündigungen channel produces announcements; writing
    // there is already limited to its staff (club level: OWNER/ADMIN).
    const isAnnouncement = channel.kind === 'ANNOUNCEMENTS'

    const message = await this.prisma.message.create({
      data: {
        teamId,
        clubId,
        channelId,
        senderId: userId,
        content,
        isAnnouncement,
        replyToId: replyToId ?? undefined,
      },
    })

    // Sockets only join `channel:{id}` after the channel authorized them.
    const room = `channel:${channelId}`

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

    this.server.to(room).emit('message', {
      id: message.id,
      teamId: message.teamId,
      clubId,
      channelId: message.channelId,
      clientMessageId: data.clientMessageId ?? null,
      senderId: userId,
      senderName: client.data.userName,
      content: message.content,
      messageType: 'TEXT',
      sourceLanguage: null,
      translation: null,
      isAnnouncement: message.isAnnouncement,
      replyToId: message.replyToId,
      createdAt: message.createdAt,
    })

    const senderName = (client.data.userName as string) || ''
    const preview = content.length > 100 ? content.slice(0, 97) + '...' : content

    // Every reader's inbox row changed (muted readers too — only the buzz is
    // suppressed for them).
    void this.emitInboxUpdateForChannel(channelId)

    // Resolve @firstname mentions to readers of this channel.
    const mentionedNames = parseMentions(content)
    const mentioned = new Set<string>()
    if (mentionedNames.length > 0) {
      const readerIds = await this.channelsService.listReadersForChannel(channelId)
      const readers = await this.prisma.user.findMany({
        where: { id: { in: readerIds } },
        select: { id: true, name: true },
      })
      for (const u of readers as Array<{ id: string; name: string }>) {
        if (u.id === userId) continue
        const first = u.name?.split(/\s+/)[0]?.toLowerCase()
        if (first && mentionedNames.includes(first)) mentioned.add(u.id)
      }
    }

    // WhatsApp-style fan-out to every reader except the sender and anyone who
    // muted the channel, picking the most specific reason (reply > mention >
    // message) so nobody gets two buzzes for one message. L2: titles are
    // localized per recipient; M3: data carries clubId so a tap from another
    // club switches the active club first.
    this.channelsService
      .listReadersForChannel(channelId, { excludeMuted: true })
      .then((readerIds) =>
        Promise.all(
          readerIds
            .filter((rid) => rid !== userId)
            .map((rid) => {
              if (message.isAnnouncement) {
                return this.pushService.sendToUserLocalized(
                  rid,
                  'ANNOUNCEMENT',
                  { senderName, messagePreview: preview },
                  { kind: 'announcement', clubId, teamId, channelId, messageId: message.id },
                  { clubId, category: 'announcements' },
                )
              }
              const isReply = rid === replyParentId
              const isMention = mentioned.has(rid)
              const kind = isReply ? 'MESSAGE_REPLY' : isMention ? 'MENTION' : 'CHAT_MESSAGE'
              const pushData = { kind, clubId, messageId: message.id, teamId, channelId }
              if (isReply || isMention) {
                return this.pushService.sendToUserLocalized(
                  rid,
                  isReply ? 'CHAT_REPLY' : 'CHAT_MENTION',
                  { senderName, messagePreview: preview },
                  pushData,
                  { clubId, category: 'chat' },
                )
              }
              return this.pushService.sendToUser(rid, senderName, preview, pushData, {
                clubId,
                category: 'chat',
              })
            }),
        ),
      )
      .catch(() => undefined)

    return {
      ok: true,
      id: message.id,
      clientMessageId: data.clientMessageId ?? null,
      event: 'sent',
      data: { id: message.id },
    }
  }

  /**
   * Typing indicator, scoped to the channel room (L4: it used to reach the
   * whole team room, leaking Trainerteam typing to players). Readers' inbox
   * rows get an `inbox:typing` hint.
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { teamId?: string; channelId?: string },
  ) {
    const userId = client.data.userId as string | undefined
    const userName = client.data.userName as string | undefined

    if (!userId || !userName || typeof data?.channelId !== 'string' || !data.channelId) {
      return
    }
    if (await this.isChatDisabled()) return this.chatDisabledError()
    if (await this.isTypingRateLimited(userId, data.channelId)) return
    if (!(await this.ensureAgeGate(client))) return this.ageGateError()

    let access
    try {
      access = await this.channelsService.getChannelAccess(userId, data.channelId)
    } catch {
      return
    }
    if (!access.canRead || !access.canWrite) return
    if (
      !(await this.ensureAgeGate(client, {
        clubId: access.channel.clubId,
        teamId: access.channel.teamId,
      }))
    ) {
      return
    }

    client.to(`channel:${data.channelId}`).emit('typing', {
      userId,
      userName,
      channelId: data.channelId,
    })
    try {
      const readers = await this.allowedIds(await this.cachedReaders(data.channelId), {
        clubId: access.channel.clubId,
        teamId: access.channel.teamId,
      })
      for (const rid of readers) {
        if (rid === userId) continue
        this.server
          .to(`user:${rid}`)
          .emit('inbox:typing', { type: 'CHANNEL', id: data.channelId, userId, userName })
      }
    } catch {
      // Typing hints are best-effort.
    }
  }

  /**
   * Search messages in a team's channels the caller can read.
   * Returns up to 20 results matching the query.
   */
  @SubscribeMessage('search')
  async handleSearch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { teamId: string; query: string },
  ): Promise<{ event: string; data: { message?: string; messages?: { id: string }[] } }> {
    const userId = client.data.userId as string | undefined
    if (!userId) {
      return { event: 'error', data: { message: 'Unauthorized' } }
    }
    if (await this.isChatDisabled()) return this.chatDisabledError()
    if (!(await this.ensureAgeGate(client))) return this.ageGateError()

    const query = data.query?.trim()
    if (!query || query.length < 2) {
      return { event: 'search_results', data: { messages: [] } }
    }

    await this.teamsService.assertReadableAccess(userId, data.teamId)

    // Channel-aware authz: only channels this user can read (the legacy
    // channel-less stream is closed, L3).
    const visibleChannels = await this.channelsService.listForUser(userId, data.teamId)
    const visibleChannelIds = visibleChannels.map((c) => c.id)
    const blockedUserIds = await this.moderationService.listBlockedUserIds(userId)

    const messages = await this.prisma.message.findMany({
      where: {
        teamId: data.teamId,
        deletedAt: null,
        content: { contains: query, mode: 'insensitive' },
        channelId: { in: visibleChannelIds },
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
      take: 20,
    })

    return {
      event: 'search_results',
      data: { messages: messages.reverse() },
    }
  }

  /**
   * Fetch a channel's message history — cursor-based pagination. The channel
   * itself is the authority (CUSTOM membership + team access / team access +
   * visibility / club membership), independent of the client's team.
   * L3: history of the legacy channel-less stream is no longer served.
   */
  @SubscribeMessage('history')
  async handleHistory(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { teamId?: string; cursor?: string; channelId?: string | null },
  ) {
    const userId = client.data.userId as string | undefined
    if (!userId) {
      return { event: 'error', data: { message: 'Unauthorized' } }
    }
    if (await this.isChatDisabled()) return this.chatDisabledError()
    if (!(await this.ensureAgeGate(client))) return this.ageGateError()

    if (typeof data?.channelId !== 'string' || data.channelId.length === 0) {
      return { event: 'error', data: { message: 'Channel required' } }
    }
    let access
    try {
      access = await this.channelsService.getChannelAccess(userId, data.channelId)
    } catch {
      return { event: 'error', data: { message: 'Forbidden for this channel' } }
    }
    if (!access.canRead) {
      return { event: 'error', data: { message: 'Forbidden for this channel' } }
    }
    if (
      !(await this.ensureAgeGate(client, {
        clubId: access.channel.clubId,
        teamId: access.channel.teamId,
      }))
    ) {
      return this.ageGateError()
    }

    const blockedUserIds = await this.moderationService.listBlockedUserIds(userId)

    const messages = await this.prisma.message.findMany({
      where: {
        // Every message of the channel, whatever team it was stored under.
        channelId: data.channelId,
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
    if (await this.isChatDisabled()) return this.chatDisabledError()
    if (!(await this.ensureAgeGate(client))) return this.ageGateError()
    // Only channel-scoped streams carry an unread badge; skip the legacy
    // team-wide (null channelId) stream.
    if (typeof data.channelId !== 'string' || data.channelId.length === 0) {
      return { event: 'marked', data: { marked: 0 } }
    }

    let access
    try {
      access = await this.channelsService.getChannelAccess(userId, data.channelId)
    } catch {
      return { event: 'error', data: { message: 'Forbidden for this channel' } }
    }
    if (!access.canRead) {
      return { event: 'error', data: { message: 'Forbidden for this channel' } }
    }
    if (
      !(await this.ensureAgeGate(client, {
        clubId: access.channel.clubId,
        teamId: access.channel.teamId,
      }))
    ) {
      return this.ageGateError()
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
    if (await this.isChatDisabled()) return this.chatDisabledError()
    if (!(await this.ensureAgeGate(client))) return this.ageGateError()
    if (!(await this.ensureDmAgeGate(client, data.conversationId))) return this.ageGateError()

    try {
      await this.dmService.assertConversationAccess(userId, data.conversationId)
    } catch {
      return { event: 'error', data: { message: 'Forbidden for this conversation' } }
    }
    const room = `dm:${data.conversationId}`
    await client.join(room)
    return { event: 'dm:joined', data: { conversationId: data.conversationId } }
  }

  /**
   * Send a text direct message (attachments go through the REST endpoint,
   * which validates the upload first). replyToId must be in the same
   * conversation (L5).
   */
  @SubscribeMessage('dm:message')
  async handleDmMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: string
      content: string
      clientMessageId?: string | null
      replyToId?: string | null
    },
  ) {
    const userId = client.data.userId as string
    if (!userId) return
    if (await this.isChatDisabled()) {
      return { event: 'error', data: { message: 'Chat is temporarily unavailable' } }
    }
    if (!(await this.ensureAgeGate(client))) return this.ageGateError()
    if (!(await this.ensureDmAgeGate(client, data.conversationId))) return this.ageGateError()

    const content = typeof data?.content === 'string' ? data.content.trim() : ''
    if (!content || content.length > CHAT.MAX_MESSAGE_LENGTH) {
      return { event: 'error', data: { message: 'Invalid message' } }
    }

    // Rate limit (reuse team chat rate limiter)
    if (await this.isChatRateLimited(userId, 'dm')) {
      return { event: 'error', data: { message: 'Too fast' } }
    }

    let item: DirectMessageItem
    try {
      item = await this.dmService.saveMessage(userId, data.conversationId, {
        messageType: 'TEXT',
        content,
        ...(typeof data.replyToId === 'string' && data.replyToId ? { replyToId: data.replyToId } : {}),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Forbidden for this conversation'
      return { event: 'error', data: { message } }
    }

    await this.fanOutDirectMessage({
      message: item,
      clientMessageId: data.clientMessageId ?? null,
    })

    // Ack shape matches the mobile useDmChat hook expectation: { ok: true, id }.
    return {
      ok: true,
      id: item.id,
      clientMessageId: data.clientMessageId ?? null,
      message: item,
      event: 'dm:sent',
      data: { id: item.id },
    }
  }

  /** REST-sent DMs (attachments, lineup cards) reach the room the same way. */
  @OnEvent('dm.message.created')
  async onDirectMessageCreated(payload: {
    message: DirectMessageItem
    clientMessageId?: string | null
  }) {
    await this.fanOutDirectMessage(payload)
  }

  /** Reaction / delete on a DM: patch both participants' open threads. */
  @OnEvent('dm.message.updated')
  onDirectMessageUpdated(payload: {
    kind: 'reaction' | 'deleted'
    message: DirectMessageItem
  }) {
    if (!this.server) return
    this.server
      .to(`dm:${payload.message.conversationId}`)
      .emit('dm:event', { kind: payload.kind, message: payload.message })
    if (payload.kind === 'deleted') {
      void this.dmService
        .listParticipantIds(payload.message.conversationId)
        .then((ids) =>
          this.emitInboxUpdate(ids, { type: 'DM', id: payload.message.conversationId }),
        )
        .catch(() => undefined)
    }
  }

  /**
   * Broadcast a persisted DM to the room, refresh both inbox rows and push
   * the peer (unless they muted the chat). L2: attachment pushes are
   * localized; M3: data carries clubId.
   */
  async fanOutDirectMessage(payload: {
    message: DirectMessageItem
    clientMessageId?: string | null
  }) {
    if (!this.server) return
    const { message } = payload
    const conversationId = message.conversationId
    this.server.to(`dm:${conversationId}`).emit('dm:message', {
      ...message,
      clientMessageId: payload.clientMessageId ?? null,
      senderName: message.sender?.name ?? null,
    })

    try {
      const participantIds = await this.dmService.listParticipantIds(conversationId)
      const dmClubId = await this.dmService.getConversationClubId?.(conversationId).catch(() => null)
      this.emitInboxUpdate(
        await this.allowedIds(participantIds, dmClubId ? { clubId: dmClubId } : {}),
        { type: 'DM', id: conversationId },
      )
    } catch {
      // inbox refresh is best-effort
    }

    const peer = await this.dmService
      .getOtherParticipant(conversationId, message.senderId)
      .catch(() => null)
    if (!peer) return
    const peerMuted = await this.dmService
      .isParticipantMuted(conversationId, peer.id)
      .catch(() => false)
    if (peerMuted) return
    const clubId = await this.dmService.getConversationClubId(conversationId).catch(() => null)
    const senderName = message.sender?.name ?? ''
    const data: Record<string, string> = {
      type: 'dm',
      kind: 'DM_MESSAGE',
      conversationId,
      messageId: message.id,
      ...(clubId ? { clubId } : {}),
    }
    const options = clubId ? { clubId, category: 'chat' as const } : undefined
    const send =
      message.messageType === 'TEXT'
        ? senderName
          ? this.pushService.sendToUser(
              peer.id,
              senderName,
              message.content.length > 100 ? message.content.slice(0, 97) + '...' : message.content,
              data,
              options,
            )
          : this.pushService.sendToUserLocalized(
              peer.id,
              'DM_FALLBACK_TITLE',
              {
                messagePreview:
                  message.content.length > 100
                    ? message.content.slice(0, 97) + '...'
                    : message.content,
              },
              data,
              options,
            )
        : this.pushService.sendToUserLocalized(
            peer.id,
            'CHAT_ATTACHMENT',
            { senderName, kind: message.messageType, caption: message.content || null },
            data,
            options,
          )
    await Promise.resolve(send).catch((err) => this.logger.error('Failed to send DM push', err))
  }

  /**
   * Handles messages posted via the REST path (e.g. AnnounceSheet, SYSTEM
   * notices). Broadcasts to the channel room and pushes announcements to the
   * channel's readers (localized, L2; with clubId, M3).
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
      clubId: payload.clubId,
      userId: message.senderId,
      senderId: message.senderId,
      createdAt: message.createdAt.toISOString(),
      messageType: message.messageType ?? 'TEXT',
      isAnnouncement: message.isAnnouncement,
    })

    void this.emitInboxUpdateForChannel(channelId)

    // Announcement push to the channel's readers, skipping anyone who muted
    // the channel; the 'announcements' category keeps quiet-hours and the
    // club-level announcement mute in force.
    if (message.isAnnouncement) {
      const preview =
        message.content.length > 100 ? message.content.slice(0, 97) + '...' : message.content
      const sender = message.senderId
        ? await this.prisma.user
            .findUnique({ where: { id: message.senderId }, select: { name: true } })
            .catch(() => null)
        : null
      this.channelsService
        .listReadersForChannel(channelId, { excludeMuted: true })
        .then((readerIds) =>
          Promise.all(
            readerIds
              .filter((rid) => rid !== message.senderId)
              .map((rid) =>
                this.pushService.sendToUserLocalized(
                  rid,
                  'ANNOUNCEMENT',
                  { senderName: sender?.name ?? '', messagePreview: preview },
                  {
                    kind: 'announcement',
                    clubId: payload.clubId,
                    teamId: teamId ?? message.teamId,
                    channelId,
                    messageId: message.id,
                  },
                  { clubId: payload.clubId, category: 'announcements' },
                ),
              ),
          ),
        )
        .catch((err) => this.logger.error('Failed to send REST announcement push', err))
    }
  }

  /**
   * DM typing indicator. The peer's inbox row gets an `inbox:typing` hint.
   */
  @SubscribeMessage('dm:typing')
  async handleDmTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { conversationId?: string },
  ) {
    const userId = client.data.userId as string | undefined
    const userName = client.data.userName as string | undefined
    if (!userId || !userName || !data?.conversationId) return
    if (await this.isChatDisabled()) return this.chatDisabledError()
    if (await this.isTypingRateLimited(userId, data.conversationId)) return
    if (!(await this.ensureAgeGate(client))) return this.ageGateError()
    if (!(await this.ensureDmAgeGate(client, data.conversationId))) return

    try {
      await this.dmService.assertCanMessageConversation(userId, data.conversationId)
    } catch {
      return
    }

    client.to(`dm:${data.conversationId}`).emit('dm:typing', {
      userId,
      userName,
      conversationId: data.conversationId,
    })
    const peer = await this.dmService
      .getOtherParticipant(data.conversationId, userId)
      .catch(() => null)
    if (peer) {
      this.server
        .to(`user:${peer.id}`)
        .emit('inbox:typing', { type: 'DM', id: data.conversationId, userId, userName })
    }
  }

  /**
   * Mark DM conversation as read. The peer's open thread flips ✓ to ✓✓.
   */
  @SubscribeMessage('dm:read')
  async handleDmRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.userId as string | undefined
    if (!userId) return
    if (await this.isChatDisabled()) return this.chatDisabledError()
    if (!(await this.ensureAgeGate(client))) return this.ageGateError()
    if (!(await this.ensureDmAgeGate(client, data.conversationId))) return this.ageGateError()

    const result = await this.dmService.markAsRead(userId, data.conversationId)

    client.to(`dm:${data.conversationId}`).emit('dm:read', {
      userId,
      conversationId: data.conversationId,
      readAt: result.readAt,
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
    if (await this.isChatDisabled()) return this.chatDisabledError()
    if (!(await this.ensureAgeGate(client))) return this.ageGateError()
    if (!(await this.ensureDmAgeGate(client, data.conversationId))) return this.ageGateError()

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
