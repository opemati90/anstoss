import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { TranslationService } from '../translation/translation.service'
import { R2Provider } from '../assets/r2.provider'
import { lockMediaObject } from '../assets/media-object-lock'
import type {
  ChatContactGroup,
  ChatContactIneligibleReason,
  ChatConversationDetail,
  ChatMediaItem,
  ChatMediaTab,
  DirectMessageItem,
  DirectMessagePage,
  DmLineupOption,
  MessageAttachmentMeta,
  MessageType,
  PresignDmMediaInput,
  SendDirectMessageInput,
} from '@anstoss/shared'
import { activeTeamAccessWhere } from '../teams/active-team-access'
import { classifyPrivateMessaging } from './private-messaging'
import {
  CHAT_UPLOAD_CONTENT_TYPES,
  CHAT_UPLOAD_MAX_BYTES,
  safeUploadName,
  uploadKindFor,
  type ChatAttachmentType,
} from '../media/chat-media-limits'
import { CHAT_MEDIA_PAGE, chatMediaWhere, toChatMediaItems } from '../channels/chat-media'

/** Same reaction set as channel messages (chat revamp: ⚽ and 👏 added). */
export const DM_REACTION_EMOJIS = new Set(['👍', '❤️', '😂', '⚽', '👏', '😮', '😢', '🙏'])

const DM_MESSAGE_INCLUDE = {
  sender: { select: { id: true, name: true, avatarUrl: true } },
  replyTo: {
    select: {
      id: true,
      content: true,
      messageType: true,
      deletedAt: true,
      sender: { select: { name: true } },
    },
  },
  reactions: { select: { userId: true, emoji: true } },
} satisfies Prisma.DirectMessageInclude

type DmRow = Prisma.DirectMessageGetPayload<{ include: typeof DM_MESSAGE_INCLUDE }>

/** Input the persistence layer accepts (socket text or validated REST send). */
export type DmPersistInput = {
  messageType: MessageType
  content: string
  replyToId?: string
  attachmentUrl?: string | null
  attachmentMeta?: MessageAttachmentMeta | null
}

/** Returns true if either user has blocked the other. */
async function eitherHasBlocked(
  prisma: PrismaService | Prisma.TransactionClient,
  userIdA: string,
  userIdB: string,
): Promise<boolean> {
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerUserId: userIdA, blockedUserId: userIdB },
        { blockerUserId: userIdB, blockedUserId: userIdA },
      ],
    },
    select: { id: true },
  })
  return block !== null
}

const DM_PAGE_SIZE = 30

@Injectable()
export class DmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly translation: TranslationService,
    @Optional() private readonly r2?: R2Provider,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  /**
   * List conversations for a user within a club, with last message and unread count.
   */
  async listConversations(userId: string, clubId: string) {
    await this.assertClubMembership(userId, clubId)

    const participations = await this.prisma.conversationParticipant.findMany({
      where: {
        userId,
        conversation: { clubId },
      },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: { select: { id: true, name: true, avatarUrl: true } },
              },
            },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { sender: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    })

    // Collect all unique other-participant userIds to batch the block check.
    const otherUserIds = participations
      .map((p) => p.conversation.participants.find((pp) => pp.userId !== userId)?.userId)
      .filter((id): id is string => id !== undefined)

    // Fetch all blocks involving this user in one query.
    const blocks = await this.prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerUserId: userId, blockedUserId: { in: otherUserIds } },
          { blockerUserId: { in: otherUserIds }, blockedUserId: userId },
        ],
      },
      select: { blockerUserId: true, blockedUserId: true },
    })
    const blockedRelated = new Set<string>()
    for (const b of blocks) {
      // Track the other user's id regardless of direction.
      if (b.blockerUserId === userId) blockedRelated.add(b.blockedUserId)
      else blockedRelated.add(b.blockerUserId)
    }

    const [unreadByConversation, peerMemberships] = await Promise.all([
      this.unreadCounts(
        userId,
        participations.map((p) => p.conversationId),
      ),
      // History stays readable after the peer leaves the club, but the row
      // must say they can no longer be written to.
      otherUserIds.length > 0
        ? this.prisma.membership.findMany({
            where: { clubId, userId: { in: otherUserIds } },
            select: { userId: true },
          })
        : Promise.resolve([] as Array<{ userId: string }>),
    ])
    const peersInClub = new Set((peerMemberships ?? []).map((m) => m.userId))
    const now = new Date()

    return participations
      .map((p) => {
        const otherParticipant = p.conversation.participants.find((pp) => pp.userId !== userId)
        // Hide conversations where either party has blocked the other.
        if (otherParticipant && blockedRelated.has(otherParticipant.userId)) {
          return null
        }
        const lastMessage = p.conversation.messages[0] || null
        const unreadCount = unreadByConversation.get(p.conversationId) ?? 0
        const muted = isParticipantMuteActive(p, now)

        return {
          id: p.conversation.id,
          otherUser: otherParticipant?.user || null,
          lastMessage: lastMessage
            ? {
                content: lastMessage.content,
                messageType: lastMessage.messageType as MessageType,
                senderId: lastMessage.senderId,
                senderName: lastMessage.sender?.name ?? null,
                createdAt: lastMessage.createdAt,
              }
            : null,
          unreadCount,
          peerIsMember: !!otherParticipant && peersInClub.has(otherParticipant.userId),
          muted,
          mutedUntil: muted && p.mutedUntil ? p.mutedUntil : null,
          createdAt: p.conversation.createdAt,
          updatedAt: p.conversation.updatedAt,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  }

  /**
   * Get or create a 1:1 conversation between two users in a club.
   */
  async findOrCreateConversation(userId: string, clubId: string, participantId: string) {
    await this.assertClubMembership(userId, clubId)
    await this.assertClubMembership(participantId, clubId)

    if (userId === participantId) {
      throw new ForbiddenException('Cannot create conversation with yourself')
    }

    await this.assertPrivateMessagingAllowed(userId, participantId, clubId)

    // Block check: prevent conversation creation if either party has blocked
    // the other. This enforces the moderation.service intent of suppressing DMs.
    if (await eitherHasBlocked(this.prisma, userId, participantId)) {
      throw new ForbiddenException('Cannot start a conversation with this user')
    }

    // Check for existing conversation between these two users in this club
    const existing = await this.prisma.conversation.findFirst({
      where: {
        clubId,
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: participantId } } },
          { participants: { every: { userId: { in: [userId, participantId] } } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    })

    if (existing) {
      return { id: existing.id, participants: existing.participants.map((p) => p.user) }
    }

    // Create new conversation
    const conversation = await this.prisma.conversation.create({
      data: {
        clubId,
        participants: {
          create: [{ userId }, { userId: participantId }],
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    })

    return { id: conversation.id, participants: conversation.participants.map((p) => p.user) }
  }

  /**
   * Get paginated message history for a conversation (oldest first), with
   * the peer's read watermark for ✓✓.
   */
  async getMessages(
    userId: string,
    conversationId: string,
    cursor?: string,
  ): Promise<DirectMessagePage> {
    const { peerUserId } = await this.assertConversationAccess(userId, conversationId)

    const [messages, peer] = await Promise.all([
      this.prisma.directMessage.findMany({
        where: {
          conversationId,
          ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
        },
        include: DM_MESSAGE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: DM_PAGE_SIZE,
      }),
      this.prisma.conversationParticipant.findFirst({
        where: { conversationId, userId: peerUserId },
        select: { lastReadAt: true },
      }),
    ])

    const reader = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferredLanguage: true },
    })
    const target = this.translation.resolveTargetLanguage(reader?.preferredLanguage, null)
    const enriched = await Promise.all(
      (messages as DmRow[]).map(async (m) => {
        // Only text is translated; attachments carry captions at most.
        const translation =
          m.messageType === 'TEXT' && !m.deletedAt
            ? await this.translation.translateForReader('dm', m.id, m.sourceLanguage, m.content, target)
            : null
        return serializeDirectMessage(m, translation)
      }),
    )

    return {
      messages: enriched.reverse(),
      hasMore: messages.length === DM_PAGE_SIZE,
      peerLastReadAt: peer?.lastReadAt ? peer.lastReadAt.toISOString() : null,
    }
  }

  /**
   * Mark a conversation as read.
   */
  async markAsRead(userId: string, conversationId: string) {
    await this.assertConversationAccess(userId, conversationId)

    const readAt = new Date()
    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: readAt },
    })

    return { success: true, readAt: readAt.toISOString() }
  }

  /**
   * Persist a DM (socket text sends and validated REST sends). Participant,
   * club membership of both sides, block and safeguarding checks run inside
   * the transaction after the per-member locks (club removal takes them too).
   * L5: a reply must quote a message of the same conversation.
   */
  async saveMessage(
    userId: string,
    conversationId: string,
    input: DmPersistInput | string,
  ): Promise<DirectMessageItem> {
    const data: DmPersistInput =
      typeof input === 'string' ? { messageType: 'TEXT', content: input } : input
    const message = await this.prisma.$transaction(async (tx) => {
      const initial = await this.assertConversationAccess(userId, conversationId, tx)
      const participants = [userId, initial.peerUserId].sort()
      const lockKeys = [
        ...participants.map((participantId) => `dm-user:${participantId}`),
        ...participants.map((participantId) => `dm-access:${initial.clubId}:${participantId}`),
      ]
      for (const lockKey of lockKeys) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`
      }

      // Re-check after the locks. Club removal takes the same per-member lock,
      // so a completed revocation cannot race a final persisted message.
      await this.assertCanMessageConversation(userId, conversationId, tx)
      if (data.attachmentUrl) {
        if (!this.r2?.enabled) throw new BadRequestException('Attachment storage is unavailable')
        const key = this.r2.objectKeyFromUrl(data.attachmentUrl)
        if (!key || !['VOICE', 'IMAGE', 'VIDEO', 'FILE'].includes(data.messageType)) {
          throw new BadRequestException('Invalid attachment')
        }
        await lockMediaObject(tx, key)
        if (await tx.accountMediaDeletion.findUnique({ where: { objectKey: key }, select: { objectKey: true } })) {
          throw new BadRequestException('Attachment is being removed; upload it again')
        }
        await this.assertDmUpload(initial.clubId, conversationId, data.messageType as ChatAttachmentType, data.attachmentUrl)
      }
      if (data.replyToId) {
        const parent = await tx.directMessage.findFirst({
          where: { id: data.replyToId, conversationId },
          select: { id: true },
        })
        if (!parent) throw new BadRequestException('Invalid reply target')
      }
      const created = await tx.directMessage.create({
        data: {
          conversationId,
          senderId: userId,
          content: data.content,
          messageType: data.messageType,
          attachmentUrl: data.attachmentUrl ?? null,
          attachmentMeta: (data.attachmentMeta ?? undefined) as Prisma.InputJsonValue | undefined,
          replyToId: data.replyToId ?? null,
        },
        include: DM_MESSAGE_INCLUDE,
      })
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      })
      return created as DmRow
    }, { timeout: 45_000 })

    if (data.messageType === 'TEXT' && data.content) {
      void this.translation
        .detectAndPersistSource('dm', message.id, data.content)
        .catch(() => undefined)
    }

    return serializeDirectMessage(message, null)
  }

  /**
   * REST send (attachments, lineup cards, or text). Attachments must be an
   * upload presigned for THIS conversation (object key prefix) and pass the
   * same HEAD validation (size + content type) as channel media. The gateway
   * broadcasts it via the `dm.message.created` event.
   */
  async sendMessage(
    userId: string,
    clubId: string,
    conversationId: string,
    input: SendDirectMessageInput,
  ): Promise<DirectMessageItem> {
    const { clubId: conversationClubId } = await this.assertConversationAccess(
      userId,
      conversationId,
    )
    if (conversationClubId !== clubId) {
      throw new ForbiddenException('Not a participant in this conversation')
    }
    await this.assertCanMessageConversation(userId, conversationId)

    let persist: DmPersistInput
    if (input.messageType === 'TEXT') {
      persist = { messageType: 'TEXT', content: input.content, replyToId: input.replyToId }
    } else if (input.messageType === 'LINEUP') {
      const meta = await this.resolveLineup(userId, clubId, input.lineup)
      persist = {
        messageType: 'LINEUP',
        content: input.content?.trim() || meta.title || meta.formation || '',
        attachmentMeta: meta,
        replyToId: input.replyToId,
      }
    } else {
      await this.assertDmUpload(clubId, conversationId, input.messageType, input.attachmentUrl)
      persist = {
        messageType: input.messageType,
        content: input.content?.trim() ?? '',
        attachmentUrl: input.attachmentUrl,
        attachmentMeta: (input.attachmentMeta as MessageAttachmentMeta | undefined) ?? null,
        replyToId: input.replyToId,
      }
    }

    const item = await this.saveMessage(userId, conversationId, persist)
    this.eventEmitter?.emit('dm.message.created', {
      message: item,
      clientMessageId: input.clientMessageId ?? null,
    })
    return item
  }

  /** The stored attachment must be this conversation's upload, validated like channel media. */
  private async assertDmUpload(
    clubId: string,
    conversationId: string,
    type: ChatAttachmentType,
    attachmentUrl: string,
  ): Promise<void> {
    if (!this.r2?.enabled) return
    const kind = uploadKindFor(type)
    const objectKey = this.r2.objectKeyFromUrl(attachmentUrl)
    const expectedPrefix = `dm/${clubId}/${conversationId}/${kind}/`
    if (!objectKey || !objectKey.startsWith(expectedPrefix)) {
      throw new BadRequestException('Attachment does not belong to this conversation upload')
    }
    try {
      await this.r2.assertStoredObject(objectKey, {
        maxBytes: CHAT_UPLOAD_MAX_BYTES[kind],
        allowedContentTypes: CHAT_UPLOAD_CONTENT_TYPES[kind],
      })
    } catch {
      throw new BadRequestException('Attachment upload is invalid or incomplete')
    }
  }

  /** Presign an upload for a DM (only someone allowed to message the peer). */
  async presignMedia(
    userId: string,
    clubId: string,
    conversationId: string,
    input: PresignDmMediaInput,
  ): Promise<{
    enabled: boolean
    objectKey: string
    uploadUrl: string | null
    publicUrl: string | null
    uploadHeaders?: Record<string, string>
  }> {
    const { clubId: conversationClubId } = await this.assertConversationAccess(
      userId,
      conversationId,
    )
    if (conversationClubId !== clubId) {
      throw new ForbiddenException('Not a participant in this conversation')
    }
    await this.assertCanMessageConversation(userId, conversationId)
    if (!CHAT_UPLOAD_CONTENT_TYPES[input.kind].has(input.contentType)) {
      throw new BadRequestException('Unsupported content type')
    }
    if (input.sizeBytes > CHAT_UPLOAD_MAX_BYTES[input.kind]) {
      throw new BadRequestException('File exceeds the allowed size')
    }
    const objectKey = `dm/${clubId}/${conversationId}/${input.kind}/private-v1-${randomUUID()}-${safeUploadName(input.filename)}`
    if (!this.r2?.enabled) {
      return { enabled: false, objectKey, uploadUrl: null, publicUrl: null }
    }
    const { uploadUrl, publicUrl } = await this.r2.presignPut(
      objectKey,
      input.contentType,
      input.sizeBytes,
    )
    return { enabled: true, objectKey, uploadUrl, publicUrl, uploadHeaders: { 'If-None-Match': '*' } }
  }

  /**
   * 1h signed GET for a DM attachment. Only the two participants, and only
   * while the caller is still a member of the conversation's club (a member
   * removed from the club gets 403 even though their participant row stays).
   */
  async getMediaUrl(
    userId: string,
    clubId: string,
    conversationId: string,
    messageId: string,
  ): Promise<{ url: string | null }> {
    const { clubId: conversationClubId } = await this.assertConversationAccess(
      userId,
      conversationId,
    )
    if (conversationClubId !== clubId) {
      throw new ForbiddenException('Not a participant in this conversation')
    }
    const message = await this.prisma.directMessage.findFirst({
      where: { id: messageId, conversationId },
      select: { attachmentUrl: true, deletedAt: true },
    })
    if (!message) throw new NotFoundException('Message not found')
    if (message.deletedAt || !message.attachmentUrl) return { url: null }
    if (!this.r2?.enabled) return { url: null }
    const objectKey = this.r2.objectKeyFromUrl(message.attachmentUrl)
    if (!objectKey || !objectKey.startsWith(`dm/${clubId}/${conversationId}/`)) {
      return { url: null }
    }
    return { url: await this.r2.presignGet(objectKey, 3600) }
  }

  /**
   * Events with a saved Aufstellung the caller may share into this DM: the
   * teams they coach (head/assistant), or every team for club admins.
   */
  async listLineupOptions(
    userId: string,
    clubId: string,
    conversationId: string,
  ): Promise<DmLineupOption[]> {
    const { clubId: conversationClubId } = await this.assertConversationAccess(
      userId,
      conversationId,
    )
    if (conversationClubId !== clubId) {
      throw new ForbiddenException('Not a participant in this conversation')
    }
    const teamIds = await this.lineupTeamIds(userId, clubId)
    if (teamIds !== 'ALL' && teamIds.length === 0) return []
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    const events = await this.prisma.event.findMany({
      where: {
        clubId,
        ...(teamIds === 'ALL' ? {} : { teamId: { in: teamIds } }),
        lineup: { not: Prisma.AnyNull },
        cancelledAt: null,
        archivedAt: null,
        date: { gte: since },
      },
      select: {
        id: true,
        title: true,
        date: true,
        opponent: true,
        lineup: true,
        team: { select: { displayName: true, name: true } },
      },
      orderBy: { date: 'asc' },
      take: 20,
    })
    const out: DmLineupOption[] = []
    for (const e of events ?? []) {
      const lineup = readDmLineup(e.lineup)
      if (!lineup) continue
      out.push({
        eventId: e.id,
        title: e.title,
        date: e.date.toISOString(),
        opponent: e.opponent ?? null,
        teamName: e.team?.displayName || e.team?.name || '',
        formation: lineup.formation,
        starterCount: lineup.slots.length,
      })
    }
    return out
  }

  /** Teams whose lineups the caller may share: coached teams, or all for admins. */
  private async lineupTeamIds(userId: string, clubId: string): Promise<string[] | 'ALL'> {
    const [membership, coachRows] = await Promise.all([
      this.prisma.membership.findFirst({ where: { userId, clubId }, select: { role: true } }),
      this.prisma.teamAccess.findMany({
        where: {
          userId,
          clubId,
          role: { in: ['HEAD_COACH', 'ASSISTANT_COACH'] },
          ...activeTeamAccessWhere(),
        },
        select: { teamId: true },
      }),
    ])
    if (membership?.role === 'OWNER' || membership?.role === 'ADMIN') return 'ALL'
    return Array.from(new Set((coachRows ?? []).map((r) => r.teamId)))
  }

  /** Snapshot a lineup card: an event's saved Aufstellung (coaches) or a drawn formation. */
  private async resolveLineup(
    userId: string,
    clubId: string,
    input: Extract<SendDirectMessageInput, { messageType: 'LINEUP' }>['lineup'],
  ): Promise<MessageAttachmentMeta> {
    if (input.source === 'FORMATION') {
      return {
        lineupSource: 'FORMATION',
        title: input.title?.trim() || null,
        formation: input.formation,
        slots: input.slots.map((slot) => ({
          position: slot.position,
          playerName: slot.playerName,
        })),
      }
    }
    const event = await this.prisma.event.findFirst({
      where: { id: input.eventId, clubId },
      select: { id: true, teamId: true, title: true, date: true, opponent: true, lineup: true },
    })
    if (!event) throw new NotFoundException('Event not found')
    const teamIds = await this.lineupTeamIds(userId, clubId)
    if (teamIds !== 'ALL' && !teamIds.includes(event.teamId)) {
      throw new ForbiddenException('Only the team’s coaches can share its lineup')
    }
    const lineup = readDmLineup(event.lineup)
    if (!lineup) throw new BadRequestException('This event has no saved lineup')
    return {
      lineupSource: 'EVENT',
      eventId: event.id,
      title: event.title,
      eventDate: event.date.toISOString(),
      opponent: event.opponent ?? null,
      formation: lineup.formation,
      slots: lineup.slots,
    }
  }

  /** Add / remove a reaction on a DM (either participant, not on deleted messages). */
  async setReaction(
    userId: string,
    clubId: string,
    conversationId: string,
    messageId: string,
    emoji: string,
    add: boolean,
  ): Promise<DirectMessageItem> {
    if (add && !DM_REACTION_EMOJIS.has(emoji)) {
      throw new BadRequestException('Unsupported reaction emoji')
    }
    await this.assertDmMessageAccess(userId, clubId, conversationId, messageId)
    if (add) {
      await this.prisma.directMessageReaction.upsert({
        where: { directMessageId_userId_emoji: { directMessageId: messageId, userId, emoji } },
        create: { directMessageId: messageId, userId, emoji },
        update: {},
      })
    } else {
      await this.prisma.directMessageReaction.deleteMany({
        where: { directMessageId: messageId, userId, emoji },
      })
    }
    const item = await this.loadItem(messageId)
    this.eventEmitter?.emit('dm.message.updated', { kind: 'reaction', message: item })
    return item
  }

  /** Sender-only soft delete; the attachment reference is dropped with it. */
  async deleteMessage(
    userId: string,
    clubId: string,
    conversationId: string,
    messageId: string,
  ): Promise<DirectMessageItem> {
    const message = await this.assertDmMessageAccess(userId, clubId, conversationId, messageId)
    if (message.senderId !== userId) {
      throw new ForbiddenException('Only the sender can delete this message')
    }
    const stored = await this.prisma.directMessage.findUnique({
      where: { id: messageId },
      select: { attachmentUrl: true, reports: { where: { resolvedAt: null }, select: { id: true } } },
    })
    await this.prisma.directMessage.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        content: '',
        attachmentUrl: null,
        attachmentMeta: Prisma.DbNull,
      },
    })
    // The upload goes with the message, unless an open report still needs it.
    const key = stored?.attachmentUrl ? this.r2?.objectKeyFromUrl(stored.attachmentUrl) : null
    if (key && this.r2?.enabled && (stored?.reports?.length ?? 0) === 0) {
      void this.r2.deleteObjects([key]).catch(() => undefined)
    }
    const item = await this.loadItem(messageId)
    this.eventEmitter?.emit('dm.message.updated', { kind: 'deleted', message: item })
    return item
  }

  /** Info screen media grid for a DM (Medien / Dateien / Links). */
  async listMedia(
    userId: string,
    clubId: string,
    conversationId: string,
    tab: ChatMediaTab,
  ): Promise<ChatMediaItem[]> {
    const { clubId: conversationClubId } = await this.assertConversationAccess(
      userId,
      conversationId,
    )
    if (conversationClubId !== clubId) {
      throw new ForbiddenException('Not a participant in this conversation')
    }
    const rows = await this.prisma.directMessage.findMany({
      where: {
        conversationId,
        deletedAt: null,
        ...(chatMediaWhere(tab) as Prisma.DirectMessageWhereInput),
      },
      select: {
        id: true,
        messageType: true,
        attachmentUrl: true,
        attachmentMeta: true,
        content: true,
        createdAt: true,
        sender: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: CHAT_MEDIA_PAGE,
    })
    return toChatMediaItems(rows ?? [], tab)
  }

  async getConversationClubId(conversationId: string): Promise<string | null> {
    const row = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { clubId: true },
    })
    return row?.clubId ?? null
  }

  private async assertDmMessageAccess(
    userId: string,
    clubId: string,
    conversationId: string,
    messageId: string,
  ) {
    const { clubId: conversationClubId } = await this.assertConversationAccess(
      userId,
      conversationId,
    )
    if (conversationClubId !== clubId) {
      throw new ForbiddenException('Not a participant in this conversation')
    }
    const message = await this.prisma.directMessage.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true, senderId: true, deletedAt: true },
    })
    if (!message) throw new NotFoundException('Message not found')
    if (message.deletedAt) throw new BadRequestException('Message was deleted')
    return message
  }

  private async loadItem(messageId: string): Promise<DirectMessageItem> {
    const row = await this.prisma.directMessage.findUniqueOrThrow({
      where: { id: messageId },
      include: DM_MESSAGE_INCLUDE,
    })
    return serializeDirectMessage(row as DmRow, null)
  }

  /**
   * Get the other participant in a conversation (for push notifications).
   */
  async getOtherParticipant(conversationId: string, senderId: string) {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: { not: senderId } },
      include: { user: { select: { id: true, name: true } } },
    })
    return participant?.user || null
  }

  /**
   * Unread per conversation: messages from the peer newer than the caller's
   * lastReadAt (deleted messages excluded).
   */
  private async unreadCounts(userId: string, conversationIds: string[]) {
    const out = new Map<string, number>()
    if (conversationIds.length === 0) return out
    const rows = await this.prisma.$queryRaw<Array<{ conversationId: string; count: number }>>`
      SELECT p."conversationId", COUNT(m."id")::int AS count
        FROM "ConversationParticipant" p
        JOIN "DirectMessage" m
          ON m."conversationId" = p."conversationId"
         AND m."senderId" <> p."userId"
         AND m."deletedAt" IS NULL
         AND m."createdAt" > p."lastReadAt"
       WHERE p."userId" = ${userId}
         AND p."conversationId" IN (${Prisma.join(conversationIds)})
       GROUP BY p."conversationId"
    `
    for (const row of rows ?? []) out.set(row.conversationId, Number(row.count))
    return out
  }

  /** DM header / info screen. */
  async getConversationDetail(
    userId: string,
    clubId: string,
    conversationId: string,
  ): Promise<ChatConversationDetail> {
    const { clubId: conversationClubId, peerUserId } = await this.assertConversationAccess(
      userId,
      conversationId,
    )
    if (conversationClubId !== clubId) {
      throw new ForbiddenException('Not a participant in this conversation')
    }
    const [participant, peer, blockedByMe, peerParticipant, peerMembership] = await Promise.all([
      this.prisma.conversationParticipant.findFirst({
        where: { conversationId, userId },
        select: { muted: true, mutedUntil: true },
      }),
      this.prisma.user.findUnique({
        where: { id: peerUserId },
        select: { id: true, name: true, avatarUrl: true },
      }),
      this.prisma.userBlock.findFirst({
        where: { blockerUserId: userId, blockedUserId: peerUserId },
        select: { id: true },
      }),
      this.prisma.conversationParticipant.findFirst({
        where: { conversationId, userId: peerUserId },
        select: { lastReadAt: true },
      }),
      this.prisma.membership.findFirst({
        where: { userId: peerUserId, clubId },
        select: { id: true },
      }),
    ])
    let canMessage = true
    try {
      await this.assertCanMessageConversation(userId, conversationId)
    } catch {
      canMessage = false
    }
    const muted = isParticipantMuteActive(participant, new Date())
    return {
      id: conversationId,
      clubId,
      otherUser: peer ? { id: peer.id, name: peer.name, avatarUrl: peer.avatarUrl } : null,
      muted,
      mutedUntil: muted && participant?.mutedUntil ? participant.mutedUntil.toISOString() : null,
      canMessage,
      blockedByMe: !!blockedByMe,
      peerLastReadAt: peerParticipant?.lastReadAt ? peerParticipant.lastReadAt.toISOString() : null,
      // M1: the peer's participant row survives club removal; history stays.
      peerLeftClub: !peerMembership,
    }
  }

  async setConversationMute(
    userId: string,
    clubId: string,
    conversationId: string,
    input: { muted: boolean; mutedUntil?: string | null },
  ): Promise<{ muted: boolean; mutedUntil: string | null }> {
    const { clubId: conversationClubId } = await this.assertConversationAccess(
      userId,
      conversationId,
    )
    if (conversationClubId !== clubId) {
      throw new ForbiddenException('Not a participant in this conversation')
    }
    const mutedUntil = input.muted && input.mutedUntil ? new Date(input.mutedUntil) : null
    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId },
      data: { muted: input.muted, mutedUntil },
    })
    return { muted: input.muted, mutedUntil: mutedUntil ? mutedUntil.toISOString() : null }
  }

  /** Whether `userId` has an active mute on this conversation (push skip). */
  async isParticipantMuted(conversationId: string, userId: string): Promise<boolean> {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId },
      select: { muted: true, mutedUntil: true },
    })
    return isParticipantMuteActive(participant, new Date())
  }

  /** Both participants' ids (inbox fan-out). */
  async listParticipantIds(conversationId: string): Promise<string[]> {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    })
    return rows.map((r) => r.userId)
  }

  /**
   * People the caller can start a chat with, grouped by team. Admins
   * (OWNER/ADMIN) see every team of the club; everyone else sees their own
   * teams (TeamAccess or guardian link). Club staff not on any listed team
   * are grouped under teamId=null. Each contact carries whether a private
   * message is allowed and, if not, why — using the same rule as sending.
   */
  async listContacts(userId: string, clubId: string): Promise<ChatContactGroup[]> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, clubId },
      select: { role: true, club: { select: { name: true } } },
    })
    if (!membership) throw new ForbiddenException('Not a member of this club')
    const isAdmin = membership.role === 'OWNER' || membership.role === 'ADMIN'

    let teams: Array<{ id: string; displayName: string | null; name: string }>
    if (isAdmin) {
      teams = await this.prisma.team.findMany({
        where: { clubId },
        select: { id: true, displayName: true, name: true },
        orderBy: { name: 'asc' },
      })
    } else {
      const [accessRows, guardianRows] = await Promise.all([
        this.prisma.teamAccess.findMany({
          where: { userId, clubId, ...activeTeamAccessWhere() },
          select: { teamId: true },
        }),
        this.prisma.guardianRelationship.findMany({
          where: { parentUserId: userId, clubId, teamId: { not: null } },
          select: { teamId: true },
        }),
      ])
      const teamIds = Array.from(
        new Set([
          ...accessRows.map((r) => r.teamId),
          ...guardianRows.map((r) => r.teamId).filter((id): id is string => !!id),
        ]),
      )
      teams =
        teamIds.length > 0
          ? await this.prisma.team.findMany({
              where: { id: { in: teamIds }, clubId },
              select: { id: true, displayName: true, name: true },
              orderBy: { name: 'asc' },
            })
          : []
    }

    const teamIdList = teams.map((t) => t.id)
    const [rosterRows, staffRows] = await Promise.all([
      teamIdList.length > 0
        ? this.prisma.teamAccess.findMany({
            where: { teamId: { in: teamIdList }, ...activeTeamAccessWhere() },
            select: { teamId: true, userId: true, role: true },
            orderBy: [{ createdAt: 'asc' }],
          })
        : Promise.resolve([] as Array<{ teamId: string; userId: string; role: string }>),
      this.prisma.membership.findMany({
        where: { clubId, role: { in: ['OWNER', 'ADMIN', 'COACH'] } },
        select: { userId: true, role: true },
      }),
    ])

    const candidateIds = Array.from(
      new Set([...rosterRows.map((r) => r.userId), ...staffRows.map((r) => r.userId), userId]),
    )
    const [userRows, blocks, guardianLinks, consents] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: candidateIds }, deletedAt: null },
        select: { id: true, name: true, avatarUrl: true, dateOfBirth: true, managedById: true },
      }),
      this.prisma.userBlock.findMany({
        where: { OR: [{ blockerUserId: userId }, { blockedUserId: userId }] },
        select: { blockerUserId: true, blockedUserId: true },
      }),
      this.prisma.guardianRelationship.findMany({
        where: { clubId, OR: [{ parentUserId: userId }, { playerUserId: userId }] },
        select: { parentUserId: true, playerUserId: true },
      }),
      this.prisma.parentalConsent.findMany({
        where: {
          clubId,
          status: 'APPROVED',
          OR: [{ guardianUserId: userId }, { playerUserId: userId }],
        },
        select: { guardianUserId: true, playerUserId: true },
      }),
    ])
    const usersById = new Map(userRows.map((u) => [u.id, u]))
    const me = usersById.get(userId)
    const blocked = new Set<string>()
    for (const b of blocks) {
      blocked.add(b.blockerUserId === userId ? b.blockedUserId : b.blockerUserId)
    }
    const linkKey = (adultId: string, minorId: string) => `${adultId}:${minorId}`
    const links = new Set<string>()
    for (const g of guardianLinks) {
      if (g.playerUserId) links.add(linkKey(g.parentUserId, g.playerUserId))
    }
    for (const c of consents) {
      if (c.guardianUserId) links.add(linkKey(c.guardianUserId, c.playerUserId))
    }

    const eligibility = (
      otherId: string,
    ): { canMessage: boolean; reason: ChatContactIneligibleReason | null } => {
      if (blocked.has(otherId)) return { canMessage: false, reason: 'BLOCKED' }
      const other = usersById.get(otherId)
      if (!me || !other) return { canMessage: false, reason: 'AGE_UNVERIFIED' }
      const decision = classifyPrivateMessaging(me, other)
      if (decision.kind === 'ALLOWED') return { canMessage: true, reason: null }
      if (decision.kind === 'AGE_UNVERIFIED') {
        return { canMessage: false, reason: 'AGE_UNVERIFIED' }
      }
      // L8: minor↔minor has its own reason (and copy) distinct from adult↔minor.
      if (decision.kind === 'MINOR_BLOCKED') return { canMessage: false, reason: 'MINOR_MINOR' }
      return links.has(linkKey(decision.adultId, decision.minorId))
        ? { canMessage: true, reason: null }
        : { canMessage: false, reason: 'MINOR_ADULT' }
    }

    const listed = new Set<string>()
    const groups: ChatContactGroup[] = []
    for (const team of teams) {
      const seen = new Set<string>()
      const contacts: ChatContactGroup['contacts'] = []
      for (const row of rosterRows) {
        if (row.teamId !== team.id || row.userId === userId || seen.has(row.userId)) continue
        const u = usersById.get(row.userId)
        if (!u) continue
        seen.add(row.userId)
        listed.add(row.userId)
        contacts.push({
          userId: u.id,
          name: u.name,
          avatarUrl: u.avatarUrl ?? null,
          role: row.role as string,
          ...eligibility(u.id),
        })
      }
      contacts.sort((a, b) => a.name.localeCompare(b.name, 'de'))
      if (contacts.length > 0) {
        groups.push({ teamId: team.id, teamName: team.displayName || team.name, contacts })
      }
    }

    const staff: ChatContactGroup['contacts'] = []
    for (const row of staffRows) {
      if (row.userId === userId || listed.has(row.userId)) continue
      const u = usersById.get(row.userId)
      if (!u) continue
      listed.add(row.userId)
      staff.push({
        userId: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl ?? null,
        role: row.role as string,
        ...eligibility(u.id),
      })
    }
    staff.sort((a, b) => a.name.localeCompare(b.name, 'de'))
    if (staff.length > 0) {
      groups.push({ teamId: null, teamName: membership.club?.name ?? '', contacts: staff })
    }
    return groups
  }

  private async assertClubMembership(
    userId: string,
    clubId: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const membership = await client.membership.findFirst({
      where: { userId, clubId },
    })
    if (!membership) {
      throw new ForbiddenException('Not a member of this club')
    }
  }

  async assertConversationAccess(
    userId: string,
    conversationId: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const participant = await client.conversationParticipant.findFirst({
      where: { conversationId, userId },
      select: {
        conversation: {
          select: {
            clubId: true,
            participants: { select: { userId: true } },
          },
        },
      },
    })
    const participants = participant?.conversation.participants ?? []
    const peer = participants.find((entry) => entry.userId !== userId)
    if (!participant || participants.length !== 2 || !peer) {
      throw new ForbiddenException('Not a participant in this conversation')
    }
    // A member removed from the club loses the club's DMs entirely (list,
    // history, read, mute, send): participation alone is not enough.
    await this.assertClubMembership(userId, participant.conversation.clubId, client)
    return { clubId: participant.conversation.clubId, peerUserId: peer.userId }
  }

  /**
   * Authorize an interaction that communicates presence or content to the
   * other DM participant. Keeping this in the DM service prevents socket-only
   * events (notably typing) from bypassing participant, block, or safeguarding
   * checks enforced for persisted messages.
   */
  async assertCanMessageConversation(
    userId: string,
    conversationId: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const { clubId, peerUserId } = await this.assertConversationAccess(
      userId,
      conversationId,
      client,
    )
    // Conversation rows are retained for history after somebody leaves a
    // club. Retention must not become a way to keep messaging across the
    // tenant boundary, so both sides must still belong to this club whenever
    // content or presence is sent (the caller's membership is checked by
    // assertConversationAccess).
    await this.assertClubMembership(peerUserId, clubId, client)
    await this.assertPrivateMessagingAllowed(userId, peerUserId, clubId, client)
    if (await eitherHasBlocked(client, userId, peerUserId)) {
      throw new ForbiddenException('Cannot send messages to this user')
    }
  }

  private async assertPrivateMessagingAllowed(
    userIdA: string,
    userIdB: string,
    clubId: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const users = await client.user.findMany({
      where: { id: { in: [userIdA, userIdB] }, deletedAt: null },
      select: { id: true, dateOfBirth: true, managedById: true },
    })
    const first = users.find((user) => user.id === userIdA)
    const second = users.find((user) => user.id === userIdB)
    if (users.length !== 2 || !first || !second) {
      throw new ForbiddenException('Age verification is required before private messaging')
    }

    const decision = classifyPrivateMessaging(first, second)
    if (decision.kind === 'ALLOWED') return
    if (decision.kind === 'AGE_UNVERIFIED') {
      throw new ForbiddenException('Age verification is required before private messaging')
    }
    if (decision.kind === 'MINOR_BLOCKED') {
      throw new ForbiddenException(
        'Under-16s can only message their guardians privately; use the team group',
      )
    }

    const [guardianLink, approvedConsent] = await Promise.all([
      client.guardianRelationship.findFirst({
        where: {
          clubId,
          parentUserId: decision.adultId,
          playerUserId: decision.minorId,
        },
        select: { id: true },
      }),
      client.parentalConsent.findFirst({
        where: {
          clubId,
          playerUserId: decision.minorId,
          guardianUserId: decision.adultId,
          status: 'APPROVED',
        },
        select: { id: true },
      }),
    ])
    if (guardianLink || approvedConsent) return

    throw new ForbiddenException(
      'Direct messages between minors and adults are limited to linked guardians',
    )
  }
}

function isParticipantMuteActive(
  row: { muted?: boolean | null; mutedUntil?: Date | null } | null | undefined,
  now: Date,
): boolean {
  if (!row?.muted) return false
  return !row.mutedUntil || row.mutedUntil.getTime() > now.getTime()
}

/** DirectMessage row → API shape. Deleted messages keep only their frame. */
export function serializeDirectMessage(
  m: {
    id: string
    conversationId: string
    senderId: string
    content: string
    messageType: string
    attachmentUrl: string | null
    attachmentMeta: unknown
    replyToId: string | null
    sourceLanguage: string | null
    deletedAt: Date | null
    createdAt: Date
    sender?: { id: string; name: string; avatarUrl: string | null } | null
    replyTo?: {
      id: string
      content: string
      messageType: string
      deletedAt: Date | null
      sender?: { name: string | null } | null
    } | null
    reactions?: Array<{ userId: string; emoji: string }>
  },
  translation: { content: string; sourceLanguage: string } | null,
): DirectMessageItem {
  const reactionMap = new Map<string, string[]>()
  for (const r of m.reactions ?? []) {
    reactionMap.set(r.emoji, [...(reactionMap.get(r.emoji) ?? []), r.userId])
  }
  const deleted = !!m.deletedAt
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    content: deleted ? '' : m.content,
    messageType: m.messageType as MessageType,
    attachmentUrl: deleted ? null : m.attachmentUrl,
    attachmentMeta: deleted ? null : ((m.attachmentMeta as MessageAttachmentMeta | null) ?? null),
    replyToId: m.replyToId,
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          senderName: m.replyTo.sender?.name ?? null,
          contentPreview: m.replyTo.deletedAt
            ? ''
            : m.replyTo.messageType === 'TEXT'
              ? m.replyTo.content.slice(0, 80)
              : '',
          messageType: m.replyTo.messageType as MessageType,
        }
      : null,
    sourceLanguage: m.sourceLanguage,
    translation,
    deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
    sender: m.sender
      ? { id: m.sender.id, name: m.sender.name, avatarUrl: m.sender.avatarUrl ?? null }
      : null,
    reactions: Array.from(reactionMap.entries()).map(([emoji, userIds]) => ({
      emoji,
      userIds,
      count: userIds.length,
    })),
  }
}

/** Stored Event.lineup JSON → formation + named positions (starters only). */
export function readDmLineup(
  raw: unknown,
): { formation: string; slots: Array<{ position: string; playerName: string }> } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  if (typeof value.formation !== 'string' || !Array.isArray(value.starters)) return null
  const slots = value.starters
    .map((p) => (p ?? {}) as Record<string, unknown>)
    .filter((p) => typeof p.name === 'string' && p.name)
    .slice(0, 11)
    .map((p) => ({
      position: typeof p.position === 'string' ? p.position : '',
      playerName: p.name as string,
    }))
  if (slots.length === 0) return null
  return { formation: value.formation, slots }
}
