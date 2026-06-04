import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TranslationService } from '../translation/translation.service'

/** Returns true if either user has blocked the other. */
async function eitherHasBlocked(
  prisma: PrismaService,
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
              orderBy: { createdAt: 'desc' },
              take: 1,
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

    return participations
      .map((p) => {
        const otherParticipant = p.conversation.participants.find(
          (pp) => pp.userId !== userId,
        )
        // Hide conversations where either party has blocked the other.
        if (otherParticipant && blockedRelated.has(otherParticipant.userId)) {
          return null
        }
        const lastMessage = p.conversation.messages[0] || null
        const unreadCount = lastMessage && lastMessage.createdAt > p.lastReadAt ? 1 : 0

        return {
          id: p.conversation.id,
          otherUser: otherParticipant?.user || null,
          lastMessage: lastMessage
            ? {
                content: lastMessage.content,
                senderId: lastMessage.senderId,
                createdAt: lastMessage.createdAt,
              }
            : null,
          unreadCount,
          updatedAt: p.conversation.updatedAt,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  }

  /**
   * Get or create a 1:1 conversation between two users in a club.
   */
  async findOrCreateConversation(
    userId: string,
    clubId: string,
    participantId: string,
  ) {
    await this.assertClubMembership(userId, clubId)
    await this.assertClubMembership(participantId, clubId)

    if (userId === participantId) {
      throw new ForbiddenException('Cannot create conversation with yourself')
    }

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
   * Get paginated message history for a conversation.
   */
  async getMessages(userId: string, conversationId: string, cursor?: string) {
    await this.assertConversationAccess(userId, conversationId)

    const messages = await this.prisma.directMessage.findMany({
      where: {
        conversationId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: DM_PAGE_SIZE,
    })

    const reader = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferredLanguage: true },
    })
    const target = this.translation.resolveTargetLanguage(reader?.preferredLanguage, null)
    const enriched = await Promise.all(
      messages.map(async (m) => {
        const result = await this.translation.translateForReader(
          'dm',
          m.id,
          m.sourceLanguage,
          m.content,
          target,
        )
        return { ...m, translation: result }
      }),
    )

    return {
      messages: enriched.reverse(),
      hasMore: messages.length === DM_PAGE_SIZE,
    }
  }

  /**
   * Mark a conversation as read.
   */
  async markAsRead(userId: string, conversationId: string) {
    await this.assertConversationAccess(userId, conversationId)

    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: new Date() },
    })

    return { success: true }
  }

  /**
   * Save a DM message (called from WebSocket gateway).
   */
  async saveMessage(userId: string, conversationId: string, content: string) {
    await this.assertConversationAccess(userId, conversationId)

    // Block check: if either participant has blocked the other, sending is
    // forbidden. Look up the other participant in this conversation.
    const otherParticipant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true },
    })
    if (
      otherParticipant &&
      (await eitherHasBlocked(this.prisma, userId, otherParticipant.userId))
    ) {
      throw new ForbiddenException('Cannot send messages to this user')
    }

    const message = await this.prisma.directMessage.create({
      data: {
        conversationId,
        senderId: userId,
        content,
      },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
      },
    })

    void this.translation
      .detectAndPersistSource('dm', message.id, content)
      .catch(() => undefined)

    // Update conversation timestamp
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })

    return message
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

  private async assertClubMembership(userId: string, clubId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, clubId },
    })
    if (!membership) {
      throw new ForbiddenException('Not a member of this club')
    }
  }

  private async assertConversationAccess(userId: string, conversationId: string) {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId },
    })
    if (!participant) {
      throw new ForbiddenException('Not a participant in this conversation')
    }
  }
}
