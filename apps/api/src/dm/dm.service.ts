import { ForbiddenException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { TranslationService } from '../translation/translation.service'

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
        const otherParticipant = p.conversation.participants.find((pp) => pp.userId !== userId)
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
      const created = await tx.directMessage.create({
        data: {
          conversationId,
          senderId: userId,
          content,
        },
        include: {
          sender: { select: { id: true, name: true, avatarUrl: true } },
        },
      })
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      })
      return created
    })

    void this.translation.detectAndPersistSource('dm', message.id, content).catch(() => undefined)

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
    // content or presence is sent.
    await this.assertClubMembership(userId, clubId, client)
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
    if (users.length !== 2 || users.some((user) => !user.dateOfBirth)) {
      throw new ForbiddenException('Age verification is required before private messaging')
    }

    const first = users.find((user) => user.id === userIdA)!
    const second = users.find((user) => user.id === userIdB)!
    const firstIsMinor = isUnder16(first.dateOfBirth!)
    const secondIsMinor = isUnder16(second.dateOfBirth!)

    // Adult-adult and minor-minor conversations remain available. The
    // safeguarding boundary is specifically a private adult/minor channel.
    if (firstIsMinor === secondIsMinor) return

    const minor = firstIsMinor ? first : second
    const adult = firstIsMinor ? second : first
    if (minor.managedById === adult.id) return

    const [guardianLink, approvedConsent] = await Promise.all([
      client.guardianRelationship.findFirst({
        where: {
          clubId,
          parentUserId: adult.id,
          playerUserId: minor.id,
        },
        select: { id: true },
      }),
      client.parentalConsent.findFirst({
        where: {
          clubId,
          playerUserId: minor.id,
          guardianUserId: adult.id,
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

function isUnder16(dateOfBirth: Date, now = new Date()) {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear()
  const monthDelta = now.getUTCMonth() - dateOfBirth.getUTCMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1
  }
  return age < 16
}
