import {
  BadRequestException,
  ConflictException,
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
 *   reporter). Severe reasons (ABUSE / INAPPROPRIATE) soft-hide the
 *   message immediately so the rest of the team doesn't see it while
 *   admins triage.
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
      throw new BadRequestException(
        'Reason must be one of: SPAM, ABUSE, INAPPROPRIATE, OTHER',
      )
    }
    const details = (input.details ?? '').trim().slice(0, MAX_REASON_LEN)

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, teamId: true, channelId: true, senderId: true, deletedAt: true },
    })
    if (!message) throw new NotFoundException('Message not found')
    if (message.deletedAt) {
      throw new BadRequestException('Message already removed')
    }
    if (message.senderId === userId) {
      throw new BadRequestException('Cannot report your own message')
    }

    // Channel-aware authz: a parent who knows a Coaches messageId
    // shouldn't be able to file reports against it.
    await this.teamsService.assertReadableAccess(userId, message.teamId)
    if (message.channelId) {
      const visible = await this.channelsService.listForUser(userId, message.teamId)
      if (!visible.some((c) => c.id === message.channelId)) {
        throw new ForbiddenException('Forbidden for this channel')
      }
    }

    const reason = details ? `${reasonKey}: ${details}` : reasonKey

    try {
      await this.prisma.messageReport.create({
        data: {
          messageId,
          reporterUserId: userId,
          reason,
        },
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

    // Severe-reason auto-hide: ABUSE / INAPPROPRIATE soft-deletes the
    // message immediately. Admins can revert via the existing
    // contributions/audit reconciliation tools. SPAM and OTHER stay
    // visible until admins triage.
    let hidden = false
    if (reasonKey === 'ABUSE' || reasonKey === 'INAPPROPRIATE') {
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          deletedAt: new Date(),
          content: '',
          attachmentUrl: null,
          attachmentMeta: null as never,
        },
      })
      hidden = true
    }

    return { ok: true, hidden }
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
      await this.prisma.userBlock.create({
        data: { blockerUserId, blockedUserId },
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
