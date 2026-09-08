import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TeamsService } from '../teams/teams.service'
import { ChannelsService } from '../channels/channels.service'

const REPORT_REASONS = new Set(['SPAM', 'ABUSE', 'INAPPROPRIATE', 'OTHER'])
const MAX_REASON_LEN = 1000

/**
 * UGC moderation surface required by Apple Guideline 1.2:
 * - Reports: any reader can flag a message (one report per message per
 *   reporter). Reports preserve evidence for admin/platform review; one
 *   member report does not delete or hide the message by itself.
 * - Blocks: per-user, uni-directional. Blocking hides the blocked
 *   user's chat messages from the blocker's history + search and
 *   suppresses DM conversations.
 */
@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    private readonly channelsService: ChannelsService,
  ) {}

  async reportMessage(
    userId: string,
    messageId: string,
    input: { reason: string; details?: string },
  ): Promise<{ ok: true; hidden: boolean }> {
    const reasonKey = (input.reason || '').toUpperCase().trim()
    if (!REPORT_REASONS.has(reasonKey)) {
      throw new BadRequestException('Reason must be one of: SPAM, ABUSE, INAPPROPRIATE, OTHER')
    }
    const details = (input.details ?? '').trim().slice(0, MAX_REASON_LEN)

    const readableMessage = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        teamId: true,
        channelId: true,
        senderId: true,
        deletedAt: true,
      },
    })
    if (!readableMessage) throw new NotFoundException('Message not found')
    if (readableMessage.deletedAt) {
      throw new BadRequestException('Message already removed')
    }
    if (readableMessage.senderId === userId) {
      throw new BadRequestException('Cannot report your own message')
    }

    // Channel-aware authz: a parent who knows a Coaches messageId
    // shouldn't be able to file reports against it.
    await this.teamsService.assertReadableAccess(userId, readableMessage.teamId)
    if (readableMessage.channelId) {
      const visible = await this.channelsService.listForUser(userId, readableMessage.teamId)
      if (!visible.some((c) => c.id === readableMessage.channelId)) {
        throw new ForbiddenException('Forbidden for this channel')
      }
    }

    const reason = details ? `${reasonKey}: ${details}` : reasonKey

    try {
      await this.prisma.$transaction(async (tx) => {
        await lockChannelMessage(tx, messageId)
        const message = await tx.message.findUnique({
          where: { id: messageId },
          select: {
            id: true,
            senderId: true,
            deletedAt: true,
            content: true,
            attachmentUrl: true,
            attachmentMeta: true,
          },
        })
        if (!message) throw new NotFoundException('Message not found')
        if (message.deletedAt) throw new BadRequestException('Message already removed')
        if (message.senderId === userId) throw new BadRequestException('Cannot report your own message')

        await tx.messageReport.create({
          data: {
            messageId,
            reporterUserId: userId,
            reason,
            evidenceContent: message.content,
            evidenceAttachmentUrl: message.attachmentUrl,
            evidenceAttachmentMeta: message.attachmentMeta ?? undefined,
          },
        })
      })
    } catch (err: unknown) {
      // Unique violation = same user already reported this message.
      // Treat as idempotent so the mobile UX never errors on a
      // double-tap.
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        return { ok: true, hidden: false }
      }
      throw err
    }

    // A report is evidence, not a deletion authority. One member must
    // never be able to censor a team announcement by choosing a severe
    // reason. Platform moderators explicitly remove or restore content
    // from the audited moderation queue.
    return { ok: true, hidden: false }
  }

  async reportDirectMessage(
    userId: string,
    messageId: string,
    input: { reason: string; details?: string },
  ): Promise<{ ok: true }> {
    const reasonKey = (input.reason || '').toUpperCase().trim()
    if (!REPORT_REASONS.has(reasonKey)) {
      throw new BadRequestException('Reason must be one of: SPAM, ABUSE, INAPPROPRIATE, OTHER')
    }
    const readableMessage = await this.prisma.directMessage.findFirst({
      where: {
        id: messageId,
        conversation: { participants: { some: { userId } } },
      },
      select: { id: true, senderId: true, deletedAt: true },
    })
    if (!readableMessage) throw new NotFoundException('Direct message not found')
    if (readableMessage.deletedAt) throw new BadRequestException('Direct message already removed')
    if (readableMessage.senderId === userId) {
      throw new BadRequestException('Cannot report your own message')
    }
    const details = (input.details ?? '').trim().slice(0, MAX_REASON_LEN)
    const reason = details ? `${reasonKey}: ${details}` : reasonKey
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockDirectMessage(tx, messageId)
        const message = await tx.directMessage.findFirst({
          where: {
            id: messageId,
            conversation: { participants: { some: { userId } } },
          },
          select: { id: true, senderId: true, deletedAt: true, content: true },
        })
        if (!message) throw new NotFoundException('Direct message not found')
        if (message.deletedAt) throw new BadRequestException('Direct message already removed')
        if (message.senderId === userId) {
          throw new BadRequestException('Cannot report your own message')
        }

        await tx.directMessageReport.create({
          data: {
            directMessageId: messageId,
            reporterUserId: userId,
            reason,
            evidenceContent: message.content,
          },
        })
      })
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      )
        return { ok: true }
      throw err
    }
    return { ok: true }
  }

  async blockUser(blockerUserId: string, blockedUserId: string) {
    if (blockerUserId === blockedUserId) {
      throw new BadRequestException('Cannot block yourself')
    }
    const target = await this.prisma.user.findUnique({
      where: { id: blockedUserId },
      select: { id: true },
    })
    if (!target) throw new NotFoundException('User not found')

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const participantId of [blockerUserId, blockedUserId].sort()) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dm-user:${participantId}`}))`
        }
        await tx.userBlock.create({
          data: { blockerUserId, blockedUserId },
        })
      })
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        // Already blocked — idempotent ok.
        return { ok: true }
      }
      throw err
    }
    return { ok: true }
  }

  async unblockUser(blockerUserId: string, blockedUserId: string) {
    await this.prisma.userBlock.deleteMany({
      where: { blockerUserId, blockedUserId },
    })
    return { ok: true }
  }

  async listBlockedUserIds(blockerUserId: string): Promise<string[]> {
    const blocks = await this.prisma.userBlock.findMany({
      where: { blockerUserId },
      select: { blockedUserId: true },
    })
    return blocks.map((b) => b.blockedUserId)
  }

  async listMyBlocks(blockerUserId: string) {
    return this.prisma.userBlock.findMany({
      where: { blockerUserId },
      select: {
        id: true,
        blockedUserId: true,
        createdAt: true,
        blocked: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }
}

/** Surface for tests/mocks that need to know if a reason key is valid. */
export const KNOWN_REPORT_REASONS = Array.from(REPORT_REASONS)

async function lockChannelMessage(tx: any, messageId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`chat-message:${messageId}`}))`
}

async function lockDirectMessage(tx: any, messageId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dm-message:${messageId}`}))`
}
