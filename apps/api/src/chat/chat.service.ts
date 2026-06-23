import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common'
import type { ChatMessage, MessageType, MessageAttachmentMeta } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { TeamsService } from '../teams/teams.service'
import { ChatGateway } from './chat.gateway'
import { PushService } from '../push/push.service'
import { ChannelsService } from '../channels/channels.service'
import { BillingService } from '../billing/billing.service'

const REACTION_EMOJIS = new Set(['👍', '❤️', '😂', '😮', '😢', '🙏'])

const EDIT_WINDOW_MS = 15 * 60 * 1000

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly gateway: ChatGateway,
    private readonly pushService: PushService,
    private readonly channelsService: ChannelsService,
    private readonly billingService: BillingService,
  ) {}

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
      channel.teamId === teamId ||
      (channel.teamId === null && channel.clubId === clubId)
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
    const access = await this.teamsService.assertReadableAccess(userId, input.teamId)
    if (input.channelId) {
      // Channel-aware authz: a parent who knew the Coaches channelId
      // could otherwise post media into a private channel via REST.
      // assertWritable validates membership against channel visibility.
      await this.channelsService.assertWritable(userId, input.channelId)
      await this.assertChannelInTeam(
        input.channelId,
        input.teamId,
        access.team.clubId,
      )
    }
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
    this.gateway.broadcastChatEvent(input.teamId, {
      kind: 'media',
      message: serialized,
      messageId: message.id,
    }, input.channelId ?? null)

    // Push fan-out: media posts skipped the gateway-level notify path,
    // so for parity with text messages we dispatch (a) a reply push
    // when replyToId targets someone else, and (b) a team push so
    // backgrounded teammates see "Photo from Mina" / "Voice note from
    // Coach". Best-effort — never block the REST response.
    const sender = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    })
    const senderName = sender?.name ?? 'Someone'
    const preview = previewForMedia(input.messageType, input.content)

    if (input.replyToId) {
      this.prisma.message
        .findUnique({
          where: { id: input.replyToId },
          select: { senderId: true },
        })
        .then((parent) => {
          if (!parent || !parent.senderId || parent.senderId === userId) return
          return this.pushService.sendToUser(
            parent.senderId,
            `${senderName} replied`,
            preview,
            {
              kind: 'MESSAGE_REPLY',
              messageId: message.id,
              teamId: input.teamId,
            },
            { clubId: access.team.clubId },
          )
        })
        .catch(() => undefined)
    }

    if (input.channelId) {
      // Channel-scoped fan-out: only users with read access to the
      // channel get the push. Without this, a Coaches-only photo pushes
      // a notification preview to every parent/player.
      this.channelsService
        .listChannelReaderIds(input.teamId, input.channelId)
        .then((readerIds) =>
          Promise.all(
            readerIds
              .filter((rid) => rid !== userId)
              .map((rid) =>
                this.pushService.sendToUser(
                  rid,
                  senderName,
                  preview,
                  {
                    kind: 'MEDIA_MESSAGE',
                    messageId: message.id,
                    teamId: input.teamId,
                    channelId: input.channelId ?? '',
                  },
                  { clubId: access.team.clubId },
                ),
              ),
          ),
        )
        .catch(() => undefined)
    } else {
      this.pushService
        .sendToTeam(
          input.teamId,
          senderName,
          preview,
          {
            kind: 'MEDIA_MESSAGE',
            messageId: message.id,
            teamId: input.teamId,
          },
          userId,
          { clubId: access.team.clubId, category: 'chat' },
        )
        .catch(() => undefined)
    }

    return serialized
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
    const access = await this.teamsService.assertReadableAccess(userId, input.teamId)
    if (input.channelId) {
      await this.channelsService.assertWritable(userId, input.channelId)
      await this.assertChannelInTeam(
        input.channelId,
        input.teamId,
        access.team.clubId,
      )
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
    return this.serializeMessage(userId, message.id)
  }

  async postRsvpPoll(
    userId: string,
    input: { teamId: string; channelId?: string; eventId: string },
  ): Promise<ChatMessage> {
    const access = await this.teamsService.assertReadableAccess(userId, input.teamId)
    if (input.channelId) {
      await this.channelsService.assertWritable(userId, input.channelId)
      await this.assertChannelInTeam(
        input.channelId,
        input.teamId,
        access.team.clubId,
      )
    }
    const event = await this.prisma.event.findFirst({
      where: { id: input.eventId, teamId: input.teamId },
    })
    if (!event) throw new NotFoundException('Event not found')

    const message = await this.prisma.message.create({
      data: {
        teamId: input.teamId,
        clubId: access.team.clubId,
        channelId: input.channelId,
        senderId: userId,
        content: event.title,
        messageType: 'RSVP_POLL',
        attachmentMeta: { eventId: input.eventId } as any,
      },
    })
    return this.serializeMessage(userId, message.id)
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
    const access = await this.teamsService.assertReadableAccess(userId, input.teamId)
    if (input.channelId) {
      await this.channelsService.assertWritable(userId, input.channelId)
      await this.assertChannelInTeam(
        input.channelId,
        input.teamId,
        access.team.clubId,
      )
    }
    const isCoach =
      access.membership?.role === 'OWNER' ||
      access.membership?.role === 'ADMIN' ||
      access.membership?.role === 'COACH' ||
      access.activeTeamAccess.some(
        (e: any) => e.role === 'HEAD_COACH' || e.role === 'ASSISTANT_COACH',
      )
    if (!isCoach) {
      throw new ForbiddenException('Only coaches can post lineups')
    }

    // Premium gate: lineup builder is part of the 'lineup_builder_pro'
    // feature on the Plus plan (see apps/web/src/index.html pricing).
    // Without this gate the mobile paywall is decoration — anyone could
    // call the API directly.
    const entitlements = await this.billingService.getEntitlements(access.team.clubId)
    if (!entitlements.features.includes('lineup_builder_pro')) {
      throw new ForbiddenException(
        "Lineup builder requires the club's premium plan",
      )
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
    this.gateway.broadcastChatEvent(input.teamId, {
      kind: 'lineup',
      message: serialized,
      messageId: message.id,
    }, input.channelId ?? null)
    this.pushService
      .sendToTeamLocalized(
        input.teamId,
        'LINEUP_POSTED',
        { formation: input.formation },
        { kind: 'LINEUP_POSTED', messageId: message.id, teamId: input.teamId },
        userId,
        { clubId: access.team.clubId, category: 'announcements' },
      )
      .catch(() => undefined)
    return serialized
  }

  async getPollByMessage(
    userId: string,
    messageId: string,
  ): ReturnType<ChatService['getPoll']> {
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


  async addReaction(
    userId: string,
    messageId: string,
    emoji: string,
  ): Promise<ChatMessage> {
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
    this.gateway.broadcastChatEvent(message.teamId, {
      kind: 'reaction-added',
      message: updated,
      messageId,
      emoji,
      userId,
    }, message.channelId ?? null)
    if (message.senderId && message.senderId !== userId) {
      const reactor = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      })
      this.pushService
        .sendToUser(
          message.senderId,
          'Anstoss',
          `${reactor?.name ?? 'Someone'} reacted ${emoji}`,
          { kind: 'MESSAGE_REACTION', messageId, teamId: message.teamId },
          { clubId: message.clubId },
        )
        .catch(() => undefined)
    }
    return updated
  }

  async removeReaction(
    userId: string,
    messageId: string,
    emoji: string,
  ): Promise<ChatMessage> {
    const message = await this.loadAccessibleMessage(userId, messageId)
    await this.prisma.messageReaction.deleteMany({
      where: { messageId, userId, emoji },
    })
    const updated = await this.serializeMessage(userId, message.id)
    this.gateway.broadcastChatEvent(message.teamId, {
      kind: 'reaction-removed',
      message: updated,
      messageId,
      emoji,
      userId,
    }, message.channelId ?? null)
    return updated
  }

  async editMessage(
    userId: string,
    messageId: string,
    content: string,
  ): Promise<ChatMessage> {
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
    this.gateway.broadcastChatEvent(message.teamId, {
      kind: 'edited',
      message: updated,
      messageId,
    }, message.channelId ?? null)
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
    this.gateway.broadcastChatEvent(message.teamId, {
      kind: 'deleted',
      message: updated,
      messageId,
    }, message.channelId ?? null)
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
  async markChannelRead(
    userId: string,
    teamId: string,
    channelId: string,
  ): Promise<{ marked: number }> {
    const inserted = await this.prisma.$executeRawUnsafe(
      `INSERT INTO "MessageReadReceipt" ("id", "messageId", "userId", "readAt")
       SELECT gen_random_uuid()::text, m."id", $1, NOW()
       FROM "Message" m
       LEFT JOIN "MessageReadReceipt" r
         ON r."messageId" = m."id" AND r."userId" = $1
       WHERE m."teamId" = $2
         AND m."channelId" = $3
         AND m."deletedAt" IS NULL
         AND (m."senderId" IS NULL OR m."senderId" <> $1)
         AND r."id" IS NULL
       ON CONFLICT ("messageId", "userId") DO NOTHING`,
      userId,
      teamId,
      channelId,
    )
    return { marked: typeof inserted === 'number' ? inserted : 0 }
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
    await this.teamsService.assertReadableAccess(userId, message.teamId)

    // Channel-aware authz: a parent who knows the messageId of a
    // Coaches-only message could otherwise react / mark-read against
    // it. Reactions are visible to other readers (so a parent's 👍
    // would surface in the Coaches channel ack list); mark-read leaks
    // a "they saw it" signal. Both leak. Filter via channelsService —
    // only the legacy null-channel stream and channels the user can
    // read pass through.
    if (message.channelId) {
      const visible = await this.channelsService.listForUser(userId, message.teamId)
      const allowed = visible.some((c) => c.id === message.channelId)
      if (!allowed) {
        throw new ForbiddenException('Forbidden for this channel')
      }
    }
    return message
  }

  private async userIsTeamCoach(userId: string, teamId: string): Promise<boolean> {
    const access = await this.prisma.teamAccess.findFirst({
      where: { userId, teamId, status: 'ACTIVE' },
    })
    if (!access) return false
    return access.role === 'HEAD_COACH' || access.role === 'ASSISTANT_COACH'
  }
}

function previewFor(content: string, type: string): string {
  if (type === 'VOICE') return '🎙 Voice note'
  if (type === 'IMAGE') return '📷 Photo'
  if (type === 'VIDEO') return '🎬 Video'
  if (type === 'FILE') return '📎 File'
  if (type === 'POLL') return '📊 Poll'
  if (type === 'RSVP_POLL') return '📋 RSVP poll'
  if (type === 'LINEUP') return '🟢 Lineup'
  return content.slice(0, 80)
}

function previewForMedia(
  type: 'VOICE' | 'IMAGE' | 'VIDEO' | 'FILE',
  caption?: string,
): string {
  const trimmed = caption?.trim()
  if (trimmed) {
    return trimmed.length > 100 ? trimmed.slice(0, 97) + '...' : trimmed
  }
  if (type === 'VOICE') return '🎙 Voice note'
  if (type === 'IMAGE') return '📷 Photo'
  if (type === 'VIDEO') return '🎬 Video'
  return '📎 File'
}
