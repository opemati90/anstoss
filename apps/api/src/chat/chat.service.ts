import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common'
import { buildClubPermissionMap, ClubCapability } from '@anstoss/shared'
import type {
  ClubOperationalRole,
  MembershipRole,
  ChatMessage,
  ChatRetentionSettings,
  MessageType,
  MessageAttachmentMeta,
  UpdateChatRetentionSettingsInput,
} from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { TeamsService } from '../teams/teams.service'
import { activeTeamAccessWhere } from '../teams/active-team-access'
import { ChatGateway } from './chat.gateway'
import { PushService } from '../push/push.service'
import { ChannelsService } from '../channels/channels.service'
import { BillingService } from '../billing/billing.service'
import { R2Provider } from '../assets/r2.provider'
import {
  CHAT_UPLOAD_CONTENT_TYPES,
  CHAT_UPLOAD_MAX_BYTES,
  uploadKindFor,
} from '../media/chat-media-limits'

// Chat revamp: the quick bar is 👍 ❤️ 😂 ⚽ 👏; older reactions stay valid.
const REACTION_EMOJIS = new Set(['👍', '❤️', '😂', '⚽', '👏', '😮', '😢', '🙏'])

const EDIT_WINDOW_MS = 15 * 60 * 1000

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name)
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly gateway: ChatGateway,
    private readonly pushService: PushService,
    private readonly channelsService: ChannelsService,
    private readonly billingService: BillingService,
    @Optional() private readonly r2?: R2Provider,
  ) {}

  async getRetentionSettings(
    userId: string,
    clubId: string,
  ): Promise<ChatRetentionSettings> {
    await this.assertRetentionAdminAccess(userId, clubId)
    return toChatRetentionSettings(await this.ensureRetentionSettings(clubId))
  }

  async updateRetentionSettings(
    userId: string,
    clubId: string,
    input: UpdateChatRetentionSettingsInput,
  ): Promise<ChatRetentionSettings> {
    const settings = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`owner:${clubId}`}))`
      await this.assertRetentionAdminAccess(userId, clubId, tx)
      const updated = await tx.clubChatRetentionSettings.upsert({
        where: { clubId },
        create: {
          clubId,
          enabled: input.enabled ?? false,
          messageRetentionDays: input.messageRetentionDays ?? 365,
          attachmentRetentionDays: input.attachmentRetentionDays ?? 90,
        },
        update: {
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          ...(input.messageRetentionDays === undefined
            ? {}
            : { messageRetentionDays: input.messageRetentionDays }),
          ...(input.attachmentRetentionDays === undefined
            ? {}
            : { attachmentRetentionDays: input.attachmentRetentionDays }),
        },
      })
      await tx.auditLog.create({
        data: {
          clubId,
          type: 'admin.setting.updated',
          actorType: 'user',
          actorId: userId,
          actorLabel: null,
          summary: 'Updated chat retention settings',
          metadata: {
            enabled: updated.enabled,
            messageRetentionDays: updated.messageRetentionDays,
            attachmentRetentionDays: updated.attachmentRetentionDays,
          },
        },
      })
      return updated
    })
    return toChatRetentionSettings(settings)
  }

  private async assertRetentionAdminAccess(userId: string, clubId: string, db: any = this.prisma) {
    const membership = await db.membership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    })
    if (!membership) throw new NotFoundException('Club membership not found')
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
      throw new ForbiddenException('Only club owners and admins can change chat retention.')
    }
    const permissions = buildClubPermissionMap({
      membershipRole: membership.role as MembershipRole,
      operationalRoles: membership.operationalRoles as ClubOperationalRole[],
    })
    if (!permissions[ClubCapability.COMMUNICATIONS]) {
      throw new ForbiddenException('You do not manage chat for this club.')
    }
    return membership
  }

  private async ensureRetentionSettings(clubId: string) {
    return this.prisma.clubChatRetentionSettings.upsert({
      where: { clubId },
      create: { clubId },
      update: {},
    })
  }

  /**
   * Verify a channelId actually belongs to `teamId` (or is a club-level
   * channel for that team's club). assertWritable only checks visibility,
   * so without this a writable channel from another team could be paired
   * with this teamId — persisting a mismatched message and broadcasting to
   * team:{teamId}:channel:{channelId}, a room no legitimate client joins
   * (silent message loss + cross-team binding).
   */
  private async assertChannelInTeam(
    channelId: string,
    teamId: string,
    clubId: string,
  ): Promise<void> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { teamId: true, clubId: true },
    })
    if (!channel) throw new NotFoundException('Channel not found')
    const belongs =
      channel.teamId === teamId || (channel.teamId === null && channel.clubId === clubId)
    if (!belongs) {
      throw new ForbiddenException('Channel does not belong to this team')
    }
  }

  async postMedia(
    userId: string,
    input: {
      teamId: string
      channelId?: string
      messageType: 'VOICE' | 'IMAGE' | 'VIDEO' | 'FILE'
      attachmentUrl: string
      attachmentMeta?: Record<string, unknown>
      content?: string
      replyToId?: string
    },
  ): Promise<ChatMessage> {
    requireChannel(input.channelId)
    const access = await this.teamsService.assertReadableAccess(userId, input.teamId)
    if (this.r2) {
      const objectKey = this.r2.objectKeyFromUrl(input.attachmentUrl)
      const expectedPrefix = `chat/${access.team.clubId}/${input.teamId}/${input.messageType.toLowerCase()}/`
      if (!objectKey || !objectKey.startsWith(expectedPrefix)) {
        throw new BadRequestException('Attachment does not belong to this team upload')
      }
      const kind = uploadKindFor(input.messageType)
      try {
        await this.r2.assertStoredObject(objectKey, {
          maxBytes: CHAT_UPLOAD_MAX_BYTES[kind],
          allowedContentTypes: CHAT_UPLOAD_CONTENT_TYPES[kind],
        })
      } catch {
        throw new BadRequestException('Attachment upload is invalid or incomplete')
      }
    }
    if (input.channelId) {
      // Channel-aware authz: a parent who knew the Coaches channelId
      // could otherwise post media into a private channel via REST.
      // assertWritable validates membership against channel visibility.
      await this.channelsService.assertWritable(userId, input.channelId)
      await this.assertChannelInTeam(input.channelId, input.teamId, access.team.clubId)
    }
    await this.assertReplyInChannel(input.replyToId, input.channelId)
    const message = await this.prisma.message.create({
      data: {
        teamId: input.teamId,
        clubId: access.team.clubId,
        channelId: input.channelId,
        senderId: userId,
        content: input.content ?? '',
        messageType: input.messageType,
        attachmentUrl: input.attachmentUrl,
        attachmentMeta: (input.attachmentMeta as never) ?? undefined,
        replyToId: input.replyToId,
      },
    })
    const serialized = await this.serializeMessage(userId, message.id)
    this.gateway.broadcastChatEvent(
      input.teamId,
      {
        kind: 'media',
        message: serialized,
        messageId: message.id,
      },
      input.channelId ?? null,
    )
    void this.gateway.emitInboxUpdateForChannel?.(input.channelId ?? null)

    // Push fan-out: media posts skipped the gateway-level notify path,
    // so for parity with text messages we dispatch (a) a reply push
    // when replyToId targets someone else, and (b) a team push so
    // backgrounded teammates see "Photo from Mina" / "Voice note from
    // Coach". Best-effort — never block the REST response.
    const sender = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    })
    const senderName = sender?.name ?? ''
    const clubId = access.team.clubId
    const channelId = input.channelId as string
    const caption = input.content?.trim() || null

    // Reply push to the quoted author (L2: localized; M3: data has clubId).
    let replyParentId: string | null = null
    if (input.replyToId) {
      const parent = await this.prisma.message.findUnique({
        where: { id: input.replyToId },
        select: { senderId: true },
      })
      replyParentId = parent?.senderId && parent.senderId !== userId ? parent.senderId : null
    }

    // Channel-scoped fan-out: only readers of the channel, minus anyone who
    // muted it. L3: the legacy team-wide push for channel-less posts is gone.
    this.channelsService
      .listChannelReaderIds(input.teamId, channelId, { excludeMuted: true })
      .then((readerIds) =>
        Promise.all(
          readerIds
            .filter((rid) => rid !== userId)
            .map((rid) => {
              const isReply = rid === replyParentId
              const data = {
                kind: isReply ? 'MESSAGE_REPLY' : 'MEDIA_MESSAGE',
                clubId,
                messageId: message.id,
                teamId: input.teamId,
                channelId,
              }
              return isReply
                ? this.pushService.sendToUserLocalized(
                    rid,
                    'CHAT_REPLY',
                    { senderName, messagePreview: caption ?? '' },
                    data,
                    { clubId, category: 'chat' },
                  )
                : this.pushService.sendToUserLocalized(
                    rid,
                    'CHAT_ATTACHMENT',
                    { senderName, kind: input.messageType, caption },
                    data,
                    { clubId, category: 'chat' },
                  )
            }),
        ),
      )
      .catch(() => undefined)

    return serialized
  }

  /** L5: a reply must quote a message of the same channel. */
  private async assertReplyInChannel(replyToId: string | undefined, channelId: string | undefined) {
    if (!replyToId) return
    const parent = await this.prisma.message.findFirst({
      where: { id: replyToId, channelId: channelId ?? '__none__' },
      select: { id: true },
    })
    if (!parent) throw new BadRequestException('Invalid reply target')
  }

  private isTeamManager(access: {
    membership?: { role?: string | null } | null
    activeTeamAccess: Array<{ role?: string | null }>
  }): boolean {
    return (
      access.membership?.role === 'OWNER' ||
      access.membership?.role === 'ADMIN' ||
      access.membership?.role === 'COACH' ||
      access.activeTeamAccess.some(
        (e) => e.role === 'HEAD_COACH' || e.role === 'ASSISTANT_COACH',
      )
    )
  }

  async postPoll(
    userId: string,
    input: {
      teamId: string
      channelId?: string
      question: string
      options: string[]
      multiSelect?: boolean
      closesAt?: string
    },
  ): Promise<ChatMessage> {
    requireChannel(input.channelId)
    const access = await this.teamsService.assertReadableAccess(userId, input.teamId)
    if (input.channelId) {
      await this.channelsService.assertWritable(userId, input.channelId)
      await this.assertChannelInTeam(input.channelId, input.teamId, access.team.clubId)
    }
    if (input.options.length < 2) {
      throw new BadRequestException('Polls need at least two options')
    }
    if (input.options.length > 6) {
      throw new BadRequestException('Polls support up to six options')
    }

    const message = await this.prisma.message.create({
      data: {
        teamId: input.teamId,
        clubId: access.team.clubId,
        channelId: input.channelId,
        senderId: userId,
        content: input.question,
        messageType: 'POLL',
      },
    })
    const poll = await this.prisma.poll.create({
      data: {
        messageId: message.id,
        question: input.question,
        multiSelect: input.multiSelect ?? false,
        closesAt: input.closesAt ? new Date(input.closesAt) : null,
      },
    })
    await this.prisma.$transaction(
      input.options.map((label, index) =>
        this.prisma.pollOption.create({
          data: { pollId: poll.id, label, index },
        }),
      ),
    )
    const serialized = await this.serializeMessage(userId, message.id)
    this.gateway.broadcastChatEvent(
      input.teamId,
      { kind: 'poll', message: serialized, messageId: message.id },
      input.channelId ?? null,
    )
    void this.gateway.emitInboxUpdateForChannel?.(input.channelId ?? null)
    return serialized
  }

  async postRsvpPoll(
    userId: string,
    input: { teamId: string; channelId?: string; eventId: string },
  ): Promise<ChatMessage> {
    requireChannel(input.channelId)
    const access = await this.teamsService.assertReadableAccess(userId, input.teamId)
    if (input.channelId) {
      await this.channelsService.assertWritable(userId, input.channelId)
      await this.assertChannelInTeam(input.channelId, input.teamId, access.team.clubId)
    }
    // Sharing an event into chat is a manager action, like posting a lineup;
    // the composer hides it from players and the API must agree.
    if (!this.isTeamManager(access)) {
      throw new ForbiddenException('Only coaches and admins can share events')
    }
    const event = await this.prisma.event.findFirst({
      where: { id: input.eventId, teamId: input.teamId },
    })
    if (!event) throw new NotFoundException('Event not found')

    // The card carries enough to render without a second request: the
    // client only fetches the event for the reader's own answer.
    const message = await this.prisma.message.create({
      data: {
        teamId: input.teamId,
        clubId: access.team.clubId,
        channelId: input.channelId,
        senderId: userId,
        content: event.title,
        messageType: 'RSVP_POLL',
        attachmentMeta: {
          eventId: input.eventId,
          eventDate: event.date.toISOString(),
          eventType: event.type,
          location: event.location ?? null,
        } as any,
      },
    })
    const serialized = await this.serializeMessage(userId, message.id)
    this.gateway.broadcastChatEvent(
      input.teamId,
      { kind: 'rsvp-poll', message: serialized, messageId: message.id },
      input.channelId ?? null,
    )
    void this.gateway.emitInboxUpdateForChannel?.(input.channelId ?? null)
    return serialized
  }

  async postLineup(
    userId: string,
    input: {
      teamId: string
      channelId?: string
      fixtureId?: string | null
      formation: string
      xi: string
    },
  ): Promise<ChatMessage> {
    requireChannel(input.channelId)
    const access = await this.teamsService.assertReadableAccess(userId, input.teamId)
    if (input.channelId) {
      await this.channelsService.assertWritable(userId, input.channelId)
      await this.assertChannelInTeam(input.channelId, input.teamId, access.team.clubId)
    }
    const isCoach = this.isTeamManager(access)
    if (!isCoach) {
      throw new ForbiddenException('Only coaches can post lineups')
    }

    // Premium gate: lineup builder is part of the 'lineup_builder_pro'
    // feature on the Plus plan (see apps/web/src/index.html pricing).
    // Without this gate the mobile paywall is decoration — anyone could
    // call the API directly.
    const entitlements = await this.billingService.getEntitlements(access.team.clubId)
    if (!entitlements.features.includes('lineup_builder_pro')) {
      throw new ForbiddenException("Lineup builder requires the club's premium plan")
    }

    const message = await this.prisma.message.create({
      data: {
        teamId: input.teamId,
        clubId: access.team.clubId,
        channelId: input.channelId,
        senderId: userId,
        content: input.xi,
        messageType: 'LINEUP',
        isAnnouncement: true,
        isPinned: true,
        attachmentMeta: {
          ...(input.fixtureId ? { fixtureId: input.fixtureId } : {}),
          formation: input.formation,
        } as any,
      },
    })
    const serialized = await this.serializeMessage(userId, message.id)
    this.gateway.broadcastChatEvent(
      input.teamId,
      {
        kind: 'lineup',
        message: serialized,
        messageId: message.id,
      },
      input.channelId ?? null,
    )
    void this.gateway.emitInboxUpdateForChannel?.(input.channelId ?? null)
    if (input.channelId) {
      // Channel post: only the channel's readers, minus anyone who muted it.
      const channelId = input.channelId
      this.channelsService
        .listChannelReaderIds(input.teamId, channelId, { excludeMuted: true })
        .then((readerIds) =>
          Promise.all(
            readerIds
              .filter((rid) => rid !== userId)
              .map((rid) =>
                this.pushService.sendToUserLocalized(
                  rid,
                  'LINEUP_POSTED',
                  { formation: input.formation },
                  {
                    kind: 'LINEUP_POSTED',
                    clubId: access.team.clubId,
                    messageId: message.id,
                    teamId: input.teamId,
                    channelId,
                  },
                  { clubId: access.team.clubId, category: 'announcements' },
                ),
              ),
          ),
        )
        .catch(() => undefined)
    }
    return serialized
  }

  /**
   * Post a SYSTEM notice into the team's main channel on behalf of the app.
   * Used for schedule changes (an event cancelled or moved) so the change is
   * visible where the squad already looks, not only in a push that can be
   * dismissed. Never throws into the caller: a chat failure must not fail
   * the schedule change that triggered it.
   */
  async postSystemNotice(input: {
    teamId: string
    clubId: string
    actorId: string
    content: string
  }): Promise<void> {
    try {
      const channel = await this.prisma.channel.findFirst({
        where: { teamId: input.teamId, kind: 'TEAM' },
        select: { id: true },
      })
      const message = await this.prisma.message.create({
        data: {
          teamId: input.teamId,
          clubId: input.clubId,
          channelId: channel?.id ?? null,
          senderId: input.actorId,
          content: input.content,
          messageType: 'SYSTEM',
          isAnnouncement: false,
          isPinned: false,
        },
      })
      const serialized = await this.serializeMessage(input.actorId, message.id)
      this.gateway.emitServerMessage(input.teamId, channel?.id ?? null, {
        ...(serialized as unknown as Record<string, unknown>),
        clientMessageId: null,
        sourceLanguage: null,
        translation: null,
      })
    } catch (error) {
      this.logger.warn(
        `system notice failed for team ${input.teamId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  async getPollByMessage(userId: string, messageId: string): ReturnType<ChatService['getPoll']> {
    const poll = await this.prisma.poll.findUnique({ where: { messageId } })
    if (!poll) throw new NotFoundException('Poll not found for message')
    return this.getPoll(userId, poll.id)
  }

  async getPoll(
    userId: string,
    pollId: string,
  ): Promise<{
    id: string
    question: string
    multiSelect: boolean
    closesAt: string | null
    closedAt: string | null
    totalVotes: number
    options: Array<{ id: string; label: string; votes: number }>
    myVoteOptionIds: string[]
  }> {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: { orderBy: { index: 'asc' } },
        votes: true,
        message: true,
      },
    })
    if (!poll) throw new NotFoundException('Poll not found')
    if (poll.message.deletedAt) throw new NotFoundException('Poll not found')
    await this.teamsService.assertReadableAccess(userId, poll.message.teamId)

    const tally = new Map<string, number>()
    for (const v of poll.votes as Array<{ optionId: string }>) {
      tally.set(v.optionId, (tally.get(v.optionId) ?? 0) + 1)
    }
    const myVotes = (poll.votes as Array<{ optionId: string; userId: string }>)
      .filter((v) => v.userId === userId)
      .map((v) => v.optionId)

    return {
      id: poll.id,
      question: poll.question,
      multiSelect: poll.multiSelect,
      closesAt: poll.closesAt ? poll.closesAt.toISOString() : null,
      closedAt: poll.closedAt ? poll.closedAt.toISOString() : null,
      totalVotes: poll.votes.length,
      options: (poll.options as Array<{ id: string; label: string }>).map((o) => ({
        id: o.id,
        label: o.label,
        votes: tally.get(o.id) ?? 0,
      })),
      myVoteOptionIds: myVotes,
    }
  }

  async votePoll(
    userId: string,
    pollId: string,
    optionId: string,
  ): Promise<{ totals: Array<{ optionId: string; votes: number }> }> {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: { message: true },
    })
    if (!poll) throw new NotFoundException('Poll not found')
    await this.teamsService.assertReadableAccess(userId, poll.message.teamId)
    if (poll.closedAt || (poll.closesAt && poll.closesAt.getTime() < Date.now())) {
      throw new BadRequestException('Poll closed')
    }

    if (!poll.multiSelect) {
      await this.prisma.pollVote.deleteMany({ where: { pollId, userId } })
    }
    await this.prisma.pollVote.upsert({
      where: { pollId_userId_optionId: { pollId, userId, optionId } },
      create: { pollId, userId, optionId },
      update: {},
    })

    const tally = await this.prisma.pollVote.groupBy({
      by: ['optionId'],
      where: { pollId },
      _count: { _all: true },
    })
    return {
      totals: tally.map((t: any) => ({
        optionId: t.optionId as string,
        votes: t._count._all as number,
      })),
    }
  }

  async addReaction(userId: string, messageId: string, emoji: string): Promise<ChatMessage> {
    if (!REACTION_EMOJIS.has(emoji)) {
      throw new BadRequestException('Unsupported reaction emoji')
    }
    const message = await this.loadAccessibleMessage(userId, messageId)

    await this.prisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: { messageId, userId, emoji },
      },
      create: { messageId, userId, emoji },
      update: {},
    })

    const updated = await this.serializeMessage(userId, message.id)
    this.gateway.broadcastChatEvent(
      message.teamId,
      {
        kind: 'reaction-added',
        message: updated,
        messageId,
        emoji,
        userId,
      },
      message.channelId ?? null,
    )
    if (message.senderId && message.senderId !== userId) {
      const reactor = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      })
      this.pushService
        .sendToUserLocalized(
          message.senderId,
          'CHAT_REACTION',
          { senderName: reactor?.name ?? '', emoji },
          {
            kind: 'MESSAGE_REACTION',
            clubId: message.clubId,
            messageId,
            teamId: message.teamId,
            ...(message.channelId ? { channelId: message.channelId } : {}),
          },
          { clubId: message.clubId, category: 'chat' },
        )
        .catch(() => undefined)
    }
    return updated
  }

  async removeReaction(userId: string, messageId: string, emoji: string): Promise<ChatMessage> {
    const message = await this.loadAccessibleMessage(userId, messageId)
    await this.prisma.messageReaction.deleteMany({
      where: { messageId, userId, emoji },
    })
    const updated = await this.serializeMessage(userId, message.id)
    this.gateway.broadcastChatEvent(
      message.teamId,
      {
        kind: 'reaction-removed',
        message: updated,
        messageId,
        emoji,
        userId,
      },
      message.channelId ?? null,
    )
    return updated
  }

  async editMessage(userId: string, messageId: string, content: string): Promise<ChatMessage> {
    const trimmed = content.trim()
    if (trimmed.length === 0) {
      throw new BadRequestException('Edited content cannot be empty')
    }
    if (trimmed.length > 2000) {
      throw new BadRequestException('Edited content too long')
    }

    const message = await this.loadAccessibleMessage(userId, messageId)
    if (message.senderId !== userId) {
      throw new ForbiddenException('Only the sender can edit this message')
    }
    if (message.deletedAt) {
      throw new BadRequestException('Cannot edit a deleted message')
    }
    if (message.messageType !== 'TEXT') {
      throw new BadRequestException('Only text messages can be edited')
    }
    if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw new BadRequestException('Edit window has passed')
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { content: trimmed, editedAt: new Date() },
    })

    const updated = await this.serializeMessage(userId, messageId)
    this.gateway.broadcastChatEvent(
      message.teamId,
      {
        kind: 'edited',
        message: updated,
        messageId,
      },
      message.channelId ?? null,
    )
    return updated
  }

  async deleteMessage(userId: string, messageId: string): Promise<ChatMessage> {
    const message = await this.loadAccessibleMessage(userId, messageId)
    const isCoach = await this.userIsTeamCoach(userId, message.teamId)
    if (message.senderId !== userId && !isCoach) {
      throw new ForbiddenException('Only the sender or a coach can delete')
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        content: '',
        attachmentUrl: null,
        attachmentMeta: null as never,
      },
    })

    const updated = await this.serializeMessage(userId, messageId)
    this.gateway.broadcastChatEvent(
      message.teamId,
      {
        kind: 'deleted',
        message: updated,
        messageId,
      },
      message.channelId ?? null,
    )
    return updated
  }

  async markRead(userId: string, messageId: string): Promise<{ readAt: string }> {
    const message = await this.loadAccessibleMessage(userId, messageId)
    if (message.senderId === userId) {
      // Sender doesn't need a receipt for their own message
      return { readAt: new Date().toISOString() }
    }
    const receipt = await this.prisma.messageReadReceipt.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId },
      update: {},
    })
    return { readAt: receipt.readAt.toISOString() }
  }

  /**
   * Mark an entire channel read for a user in one shot. Seeds a read receipt
   * for every message in the channel the user didn't send and hasn't already
   * read — exactly inverting the unread query in
   * ChannelsService.listForUser, so the channel's unread badge drops to zero.
   * Called when the user opens/views a channel. Caller MUST authorize channel
   * read access first (the gateway does, mirroring `history`).
   */
  async markChannelRead(userId: string, channelId: string): Promise<{ marked: number }> {
    // Single implementation (mirrors the unread count) lives in ChannelsService.
    return this.channelsService.markChannelRead(userId, channelId)
  }

  async serializeMessage(userId: string, messageId: string): Promise<ChatMessage> {
    const m: any = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
        reactions: true,
        reads: true,
        replyTo: {
          select: {
            id: true,
            content: true,
            messageType: true,
            sender: { select: { name: true } },
          },
        },
      },
    })

    const reactionMap = new Map<string, Set<string>>()
    for (const r of m.reactions as Array<{ emoji: string; userId: string }>) {
      const set = reactionMap.get(r.emoji) || new Set<string>()
      set.add(r.userId)
      reactionMap.set(r.emoji, set)
    }
    const reactions = Array.from(reactionMap.entries()).map(([emoji, set]) => ({
      emoji,
      userIds: Array.from(set),
      count: set.size,
    }))

    const reads = m.reads as Array<{ userId: string }>
    const readByMe = reads.some((r) => r.userId === userId)
    const readCount = reads.filter((r) => r.userId !== m.senderId).length

    return {
      id: m.id,
      teamId: m.teamId,
      clubId: m.clubId,
      channelId: m.channelId,
      senderId: m.senderId,
      content: m.content,
      messageType: m.messageType as MessageType,
      attachmentUrl: m.attachmentUrl,
      attachmentMeta: (m.attachmentMeta as MessageAttachmentMeta | null) ?? null,
      replyToId: m.replyToId,
      isAnnouncement: m.isAnnouncement,
      isPinned: m.isPinned,
      editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
      senderName: m.sender?.name ?? null,
      senderAvatar: m.sender?.avatarUrl ?? null,
      reactions,
      readByMe,
      readCount,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            senderName: m.replyTo.sender?.name ?? null,
            contentPreview: previewFor(m.replyTo.content, m.replyTo.messageType),
            messageType: m.replyTo.messageType as MessageType,
          }
        : null,
    }
  }

  private async loadAccessibleMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    })
    if (!message) throw new NotFoundException('Message not found')
    if (!message.channelId) {
      // L3: the legacy channel-less stream is closed.
      await this.teamsService.assertReadableAccess(userId, message.teamId)
    }

    // Channel-aware authz: a parent who knows the messageId of a
    // Coaches-only message could otherwise react / mark-read against
    // it. Reactions are visible to other readers (so a parent's 👍
    // would surface in the Coaches channel ack list); mark-read leaks
    // a "they saw it" signal. Both leak. Filter via channelsService —
    // only the legacy null-channel stream and channels the user can
    // read pass through.
    if (message.channelId) {
      // The channel is the authority (club channels, groups, team access).
      const access = await this.channelsService.getChannelAccess(userId, message.channelId)
      if (!access.canRead) {
        throw new ForbiddenException('Forbidden for this channel')
      }
    }
    return message
  }

  private async userIsTeamCoach(userId: string, teamId: string): Promise<boolean> {
    const access = await this.prisma.teamAccess.findFirst({
      where: { userId, teamId, ...activeTeamAccessWhere() },
    })
    if (!access) return false
    return access.role === 'HEAD_COACH' || access.role === 'ASSISTANT_COACH'
  }
}

function previewFor(content: string, type: string): string {
  if (type === 'VOICE') return 'Voice note'
  if (type === 'IMAGE') return 'Photo'
  if (type === 'VIDEO') return 'Video'
  if (type === 'FILE') return 'File'
  if (type === 'POLL') return 'Poll'
  if (type === 'RSVP_POLL') return 'RSVP poll'
  if (type === 'LINEUP') return 'Lineup'
  return content.slice(0, 80)
}

/** L3: every chat post needs a channel (the team-wide stream is closed). */
function requireChannel(channelId: string | undefined): asserts channelId is string {
  if (!channelId) throw new BadRequestException('Channel required')
}

function toChatRetentionSettings(settings: {
  clubId: string
  enabled: boolean
  messageRetentionDays: number
  attachmentRetentionDays: number
}): ChatRetentionSettings {
  return {
    clubId: settings.clubId,
    enabled: settings.enabled,
    messageRetentionDays: settings.messageRetentionDays,
    attachmentRetentionDays: settings.attachmentRetentionDays,
  }
}
