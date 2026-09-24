import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import {
  MembershipRole,
  PLATFORM_ONLY_REPORT_REASONS,
  REPORT_REASONS as REASON_LIST,
} from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { TeamsService } from '../teams/teams.service'
import { ChannelsService } from '../channels/channels.service'
import {
  ESCALATION,
  PlatformSafetyAlerter,
  isClubStaff,
  type EscalationReason,
} from './moderation-safety'

const REPORT_REASONS = new Set<string>(REASON_LIST)
const REASON_ERROR = `Reason must be one of: ${REASON_LIST.join(', ')}`
const MAX_REASON_LEN = 1000
/** L2: one push per club per window; later reports in the window are batched. */
export const REPORT_PUSH_DEBOUNCE_MS = 10 * 60 * 1000

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
  private readonly logger = new Logger(ModerationService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    private readonly channelsService: ChannelsService,
    @Optional() private readonly push?: PushService,
    @Optional() private readonly alerter?: PlatformSafetyAlerter,
  ) {}

  /** L2 debounce state per club (per API instance). */
  private readonly pushWindows = new Map<string, { pending: number; timer: NodeJS.Timeout | null }>()

  /**
   * M6: SAFEGUARDING reports and reports about club staff go straight to the
   * platform queue; club admins are neither notified nor able to act.
   */
  private async escalationFor(
    reasonKey: string,
    senderId: string | null,
    clubId: string | null,
  ): Promise<EscalationReason | null> {
    if ((PLATFORM_ONLY_REPORT_REASONS as readonly string[]).includes(reasonKey)) {
      return ESCALATION.SAFEGUARDING
    }
    if (clubId && (await isClubStaff(this.prisma, senderId, clubId))) {
      return ESCALATION.STAFF_SENDER
    }
    return null
  }

  private afterReport(
    reportId: string | null,
    clubId: string | null,
    escalation: EscalationReason | null,
    exclude: Array<string | null>,
  ) {
    if (escalation) {
      if (reportId && this.alerter) {
        void this.alerter
          .alert({ reason: escalation, reportIds: [reportId], clubId })
          .catch((err: unknown) =>
            this.logger.error(`platform alert failed for ${reportId}: ${(err as Error).message}`),
          )
      }
      return
    }
    if (clubId) this.notifyClubModerators(clubId, exclude)
  }

  /**
   * UGC moderation: tell the club's OWNER/ADMINs a new report is waiting
   * (24h response target, docs/compliance/UGC_MODERATION.md). Best effort:
   * the report row is the durable record and the queue lists it regardless.
   */
  private notifyClubModerators(clubId: string, excludeUserIds: Array<string | null>) {
    if (!this.push) return
    const window = this.pushWindows.get(clubId)
    if (window) {
      // Inside the window: count it; one summary push goes out when it closes.
      window.pending += 1
      return
    }
    const state = { pending: 0, timer: null as NodeJS.Timeout | null }
    state.timer = setTimeout(() => {
      this.pushWindows.delete(clubId)
      if (state.pending > 0) this.sendModeratorPush(clubId, excludeUserIds, state.pending)
    }, REPORT_PUSH_DEBOUNCE_MS)
    state.timer.unref?.()
    this.pushWindows.set(clubId, state)
    this.sendModeratorPush(clubId, excludeUserIds, 1)
  }

  private sendModeratorPush(clubId: string, excludeUserIds: Array<string | null>, count: number) {
    if (!this.push) return
    const push = this.push
    void (async () => {
      const [club, admins] = await Promise.all([
        this.prisma.club.findUnique({ where: { id: clubId }, select: { name: true } }),
        this.prisma.membership.findMany({
          where: {
            clubId,
            role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] },
            user: { deletedAt: null },
          },
          select: { userId: true },
        }),
      ])
      const exclude = new Set(excludeUserIds.filter(Boolean))
      for (const { userId } of admins) {
        if (exclude.has(userId)) continue
        if (count > 1) {
          await push.sendToUserLocalized(
            userId,
            'MODERATION_REPORTS_BATCH',
            { clubName: club?.name ?? '', count },
            { type: 'moderation_report', clubId },
            { clubId },
          )
        } else {
          await push.sendToUserLocalized(
            userId,
            'MODERATION_REPORT_CREATED',
            { clubName: club?.name ?? '' },
            { type: 'moderation_report', clubId },
            { clubId },
          )
        }
      }
    })().catch((err: unknown) => {
      this.logger.warn(`moderation notify failed for club ${clubId}: ${(err as Error).message}`)
    })
  }

  async reportMessage(
    userId: string,
    messageId: string,
    input: { reason: string; details?: string },
  ): Promise<{ ok: true; hidden: boolean }> {
    const reasonKey = (input.reason || '').toUpperCase().trim()
    if (!REPORT_REASONS.has(reasonKey)) {
      throw new BadRequestException(REASON_ERROR)
    }
    const details = (input.details ?? '').trim().slice(0, MAX_REASON_LEN)

    const readableMessage = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        clubId: true,
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

    // H6: authorise with the channel's own access check (club channels,
    // custom groups and visibility rules), not the message's anchor team.
    // Messages without a channel (legacy team chat) use team read access.
    if (readableMessage.channelId) {
      const access = await this.channelsService
        .assertReadableChannel(userId, readableMessage.channelId)
        .catch(() => null)
      if (!access || access.channel.clubId !== readableMessage.clubId) {
        throw new ForbiddenException('Forbidden for this channel')
      }
    } else {
      await this.teamsService.assertReadableAccess(userId, readableMessage.teamId)
    }

    const reason = details ? `${reasonKey}: ${details}` : reasonKey
    const escalation = await this.escalationFor(
      reasonKey,
      readableMessage.senderId,
      readableMessage.clubId,
    )
    let reportId: string | null = null

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

        const created = await tx.messageReport.create({
          data: {
            messageId,
            reporterUserId: userId,
            reason,
            evidenceContent: message.content,
            evidenceAttachmentUrl: message.attachmentUrl,
            evidenceAttachmentMeta: message.attachmentMeta ?? undefined,
            ...(escalation ? { escalatedAt: new Date(), escalationReason: escalation } : {}),
          },
          select: { id: true },
        })
        reportId = created.id
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

    this.afterReport(reportId, readableMessage.clubId, escalation, [userId, readableMessage.senderId])

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
      throw new BadRequestException(REASON_ERROR)
    }
    const readableMessage = await this.prisma.directMessage.findFirst({
      where: {
        id: messageId,
        conversation: { participants: { some: { userId } } },
      },
      select: {
        id: true,
        senderId: true,
        deletedAt: true,
        conversation: { select: { clubId: true } },
      },
    })
    if (!readableMessage) throw new NotFoundException('Direct message not found')
    if (readableMessage.deletedAt) throw new BadRequestException('Direct message already removed')
    if (readableMessage.senderId === userId) {
      throw new BadRequestException('Cannot report your own message')
    }
    const details = (input.details ?? '').trim().slice(0, MAX_REASON_LEN)
    const reason = details ? `${reasonKey}: ${details}` : reasonKey
    const dmClubId = readableMessage.conversation?.clubId ?? null
    const escalation = await this.escalationFor(reasonKey, readableMessage.senderId, dmClubId)
    let reportId: string | null = null
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockDirectMessage(tx, messageId)
        const message = await tx.directMessage.findFirst({
          where: {
            id: messageId,
            conversation: { participants: { some: { userId } } },
          },
          // Chat revamp: DMs carry attachments; the report snapshots them.
          select: {
            id: true,
            senderId: true,
            deletedAt: true,
            content: true,
            attachmentUrl: true,
            attachmentMeta: true,
          },
        })
        if (!message) throw new NotFoundException('Direct message not found')
        if (message.deletedAt) throw new BadRequestException('Direct message already removed')
        if (message.senderId === userId) {
          throw new BadRequestException('Cannot report your own message')
        }

        const created = await tx.directMessageReport.create({
          data: {
            directMessageId: messageId,
            reporterUserId: userId,
            reason,
            evidenceContent: message.content,
            evidenceAttachmentUrl: message.attachmentUrl,
            evidenceAttachmentMeta: message.attachmentMeta ?? undefined,
            ...(escalation ? { escalatedAt: new Date(), escalationReason: escalation } : {}),
          },
          select: { id: true },
        })
        reportId = created.id
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
    this.afterReport(reportId, dmClubId, escalation, [userId, readableMessage.senderId])
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
