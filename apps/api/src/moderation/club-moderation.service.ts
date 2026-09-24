import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { MODERATION_RESPONSE_HOURS, type ResolveModerationReportInput } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'
import { R2Provider } from '../assets/r2.provider'
import {
  ESCALATION,
  ModerationSafetyWorker,
  PLATFORM_ONLY_ESCALATIONS,
  PlatformSafetyAlerter,
  isClubStaff,
  quarantineRemovedAttachment,
  signEvidenceUrl,
} from './moderation-safety'

/** Target response time for club moderators (docs/compliance/UGC_MODERATION.md). */
export { MODERATION_RESPONSE_HOURS }

const MAX_LIMIT = 100

export interface ClubModerationReport {
  id: string
  kind: 'channel' | 'direct'
  reason: string
  createdAt: Date
  resolvedAt: Date | null
  resolution: string | null
  /** True when the report is open and older than the 24h response target. */
  overdue: boolean
  reporter: { id: string; name: string | null }
  message: {
    id: string
    /** Content at report time (evidence), falling back to live content. */
    content: string
    removed: boolean
    createdAt: Date
    sender: { id: string; name: string | null } | null
    teamId: string | null
    channelId: string | null
    /**
     * Reported attachment (image, voice, file) as evidence: a signed URL
     * valid for 5 minutes, or null. Re-fetch the list for a fresh URL.
     */
    attachment: { url: string; meta: unknown } | null
  }
}

/**
 * UGC moderation (Apple 1.2 / Google Play UGC): club OWNER/ADMIN queue.
 *
 * Club admins are the first-line moderators for their own club. They see
 * reports of channel messages posted in their club and of direct messages in
 * conversations belonging to their club, and can dismiss a report or remove
 * the reported message. Platform admins keep a cross-club queue in
 * admin/moderation.service.ts.
 *
 * Not in this queue (platform only, M6): SAFEGUARDING reports and reports
 * whose sender is staff of the club (OWNER/ADMIN/COACH or a team coach).
 *
 * Every lookup is keyed by clubId so one club's admin can never see or act
 * on another club's reports (unknown or foreign ids are both 404).
 */
@Injectable()
export class ClubModerationService {
  private readonly logger = new Logger(ClubModerationService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly r2?: R2Provider,
    @Optional() private readonly alerter?: PlatformSafetyAlerter,
    @Optional() private readonly safetyWorker?: ModerationSafetyWorker,
  ) {}

  async listReports(
    clubId: string,
    opts: { status?: 'open' | 'resolved' | 'all'; limit?: number } = {},
  ): Promise<ClubModerationReport[]> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), MAX_LIMIT)
    const status = opts.status ?? 'open'

    // M6: overdue alerting also runs on list access (the hourly sweep is the
    // primary path). Fire-and-forget; each report alerts once.
    if (this.safetyWorker) {
      void this.safetyWorker.alertOverdue({ clubId }).catch(() => undefined)
    }

    // L1: open reports oldest first so nothing overdue falls off the page;
    // resolved reports newest first.
    const rows: ClubModerationReport[] = []
    if (status !== 'resolved') rows.push(...(await this.fetch(clubId, 'open', limit)))
    if (status !== 'open' && rows.length < limit) {
      rows.push(...(await this.fetch(clubId, 'resolved', limit - rows.length)))
    }
    return rows.slice(0, limit)
  }

  private async fetch(
    clubId: string,
    bucket: 'open' | 'resolved',
    limit: number,
  ): Promise<ClubModerationReport[]> {
    const open = bucket === 'open'
    const where = {
      ...(open ? { resolvedAt: null } : { resolvedAt: { not: null } }),
      OR: [{ escalationReason: null }, { escalationReason: { notIn: PLATFORM_ONLY_ESCALATIONS } }],
    }
    const orderBy = open ? { createdAt: 'asc' as const } : { resolvedAt: 'desc' as const }

    const [channelReports, directReports] = await Promise.all([
      this.prisma.messageReport.findMany({
        where: { ...where, message: { is: { clubId } } },
        orderBy,
        take: limit,
        include: {
          reporter: { select: { id: true, name: true } },
          message: {
            select: {
              id: true,
              content: true,
              createdAt: true,
              deletedAt: true,
              teamId: true,
              channelId: true,
              sender: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.directMessageReport.findMany({
        where: { ...where, directMessage: { is: { conversation: { is: { clubId } } } } },
        orderBy,
        take: limit,
        include: {
          reporter: { select: { id: true, name: true } },
          directMessage: {
            select: {
              id: true,
              content: true,
              createdAt: true,
              deletedAt: true,
              sender: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ])

    const overdueBefore = Date.now() - MODERATION_RESPONSE_HOURS * 60 * 60 * 1000
    const isOverdue = (createdAt: Date, resolvedAt: Date | null) =>
      resolvedAt === null && createdAt.getTime() < overdueBefore
    const attachment = async (r: {
      evidenceAttachmentUrl: string | null
      evidenceAttachmentMeta: unknown
      evidencePurgedAt: Date | null
    }) => {
      const url = await signEvidenceUrl(this.r2, r)
      return url ? { url, meta: r.evidenceAttachmentMeta ?? null } : null
    }

    const rows: ClubModerationReport[] = [
      ...(await Promise.all(
        channelReports.map(async (r) => ({
          id: r.id,
          kind: 'channel' as const,
          reason: r.reason,
          createdAt: r.createdAt,
          resolvedAt: r.resolvedAt,
          resolution: r.resolution,
          overdue: isOverdue(r.createdAt, r.resolvedAt),
          reporter: r.reporter,
          message: {
            id: r.message.id,
            content: r.evidenceContent ?? r.message.content,
            removed: r.message.deletedAt !== null,
            createdAt: r.message.createdAt,
            sender: r.message.sender,
            teamId: r.message.teamId,
            channelId: r.message.channelId,
            attachment: await attachment(r),
          },
        })),
      )),
      ...(await Promise.all(
        directReports.map(async (r) => ({
          id: r.id,
          kind: 'direct' as const,
          reason: r.reason,
          createdAt: r.createdAt,
          resolvedAt: r.resolvedAt,
          resolution: r.resolution,
          overdue: isOverdue(r.createdAt, r.resolvedAt),
          reporter: r.reporter,
          message: {
            id: r.directMessage.id,
            content: r.evidenceContent ?? r.directMessage.content,
            removed: r.directMessage.deletedAt !== null,
            createdAt: r.directMessage.createdAt,
            sender: r.directMessage.sender,
            teamId: null,
            channelId: null,
            attachment: await attachment(r),
          },
        })),
      )),
    ]
    return rows
      .sort((a, b) =>
        open
          ? a.createdAt.getTime() - b.createdAt.getTime()
          : (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0),
      )
      .slice(0, limit)
  }

  /**
   * Resolve a report. `remove` hides the message for everyone (soft delete,
   * content blanked, stored media quarantined) and closes every other open
   * report on the same message; the report's evidence copy is kept for the
   * retention window. `dismiss` keeps the message. Both write an AuditLog row.
   *
   * M6: reports about club staff (or SAFEGUARDING reports) are platform-only;
   * a club admin trying to resolve one gets 403 and the report is escalated.
   */
  async resolveReport(
    clubId: string,
    reportId: string,
    actorUserId: string,
    input: ResolveModerationReportInput,
  ) {
    const resolution = input.resolution?.trim() || input.action
    const now = new Date()

    const channelReport = await this.prisma.messageReport.findFirst({
      where: { id: reportId, message: { is: { clubId } } },
      select: {
        id: true,
        messageId: true,
        escalationReason: true,
        message: { select: { senderId: true, attachmentUrl: true } },
      },
    })
    if (channelReport) {
      assertNotOwnReport(channelReport.message.senderId, actorUserId)
      await this.assertClubMayModerate(
        'channel',
        reportId,
        clubId,
        channelReport.escalationReason,
        channelReport.message.senderId,
      )
      const result = await tenantContext.run({ clubId, userId: actorUserId }, () =>
        this.prisma.$transaction(async (tx) => {
          const claimed = await tx.messageReport.updateMany({
            where: { id: reportId, resolvedAt: null },
            data: { resolvedAt: now, resolvedById: actorUserId, resolution },
          })
          if (claimed.count !== 1) throw new ConflictException('Report has already been resolved')
          if (input.action === 'remove') {
            await tx.message.updateMany({
              where: { id: channelReport.messageId, clubId },
              data: {
                deletedAt: now,
                content: '',
                attachmentUrl: null,
                attachmentMeta: Prisma.JsonNull,
              },
            })
            await tx.messageTranslation.deleteMany({ where: { messageId: channelReport.messageId } })
            await tx.messageReport.updateMany({
              where: { messageId: channelReport.messageId, resolvedAt: null },
              data: { resolvedAt: now, resolvedById: actorUserId, resolution },
            })
          }
          await tx.auditLog.create({
            data: {
              clubId,
              type: 'moderation.report_resolved',
              actorType: 'user',
              actorId: actorUserId,
              actorLabel: null,
              summary: `${input.action === 'remove' ? 'Removed message for' : 'Dismissed'} report ${reportId}`,
              metadata: {
                reportId,
                messageId: channelReport.messageId,
                messageKind: 'channel',
                action: input.action,
              },
            },
          })
          return { id: reportId, action: input.action, resolvedAt: now }
        }),
      )
      if (input.action === 'remove') {
        await quarantineRemovedAttachment(
          this.prisma,
          this.r2,
          {
            kind: 'channel',
            messageId: channelReport.messageId,
            attachmentUrl: channelReport.message.attachmentUrl,
          },
          this.logger,
        )
      }
      return result
    }

    const directReport = await this.prisma.directMessageReport.findFirst({
      where: { id: reportId, directMessage: { is: { conversation: { is: { clubId } } } } },
      select: {
        id: true,
        directMessageId: true,
        escalationReason: true,
        directMessage: { select: { senderId: true, attachmentUrl: true } },
      },
    })
    if (!directReport) throw new NotFoundException('Report not found')
    assertNotOwnReport(directReport.directMessage.senderId, actorUserId)
    await this.assertClubMayModerate(
      'direct',
      reportId,
      clubId,
      directReport.escalationReason,
      directReport.directMessage.senderId,
    )

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.directMessageReport.updateMany({
        where: { id: reportId, resolvedAt: null },
        data: { resolvedAt: now, resolvedById: actorUserId, resolution },
      })
      if (claimed.count !== 1) throw new ConflictException('Report has already been resolved')
      if (input.action === 'remove') {
        await tx.directMessage.updateMany({
          where: { id: directReport.directMessageId },
          data: {
            deletedAt: now,
            content: '',
            attachmentUrl: null,
            attachmentMeta: Prisma.JsonNull,
          },
        })
        await tx.directMessageTranslation.deleteMany({
          where: { directMessageId: directReport.directMessageId },
        })
        await tx.directMessageReport.updateMany({
          where: { directMessageId: directReport.directMessageId, resolvedAt: null },
          data: { resolvedAt: now, resolvedById: actorUserId, resolution },
        })
      }
      await tx.auditLog.create({
        data: {
          clubId,
          type: 'moderation.report_resolved',
          actorType: 'user',
          actorId: actorUserId,
          actorLabel: null,
          summary: `${input.action === 'remove' ? 'Removed direct message for' : 'Dismissed'} report ${reportId}`,
          metadata: {
            reportId,
            messageId: directReport.directMessageId,
            messageKind: 'direct',
            action: input.action,
          },
        },
      })
      return { id: reportId, action: input.action, resolvedAt: now }
    })
    if (input.action === 'remove') {
      await quarantineRemovedAttachment(
        this.prisma,
        this.r2,
        {
          kind: 'direct',
          messageId: directReport.directMessageId,
          attachmentUrl: directReport.directMessage.attachmentUrl,
        },
        this.logger,
      )
    }
    return result
  }

  /**
   * M6: the club may not moderate platform-only reports. A report whose
   * sender became staff after it was filed is escalated now.
   */
  private async assertClubMayModerate(
    kind: 'channel' | 'direct',
    reportId: string,
    clubId: string,
    escalationReason: string | null,
    senderId: string | null,
  ) {
    if (escalationReason && PLATFORM_ONLY_ESCALATIONS.includes(escalationReason)) {
      throw new ForbiddenException('This report is handled by the platform team')
    }
    if (!(await isClubStaff(this.prisma, senderId, clubId))) return
    const data = { escalatedAt: new Date(), escalationReason: ESCALATION.STAFF_SENDER }
    if (kind === 'channel') {
      await this.prisma.messageReport.updateMany({ where: { id: reportId, resolvedAt: null }, data })
    } else {
      await this.prisma.directMessageReport.updateMany({
        where: { id: reportId, resolvedAt: null },
        data,
      })
    }
    if (this.alerter) {
      await this.alerter
        .alert({ reason: ESCALATION.STAFF_SENDER, reportIds: [reportId], clubId })
        .catch(() => undefined)
    }
    throw new ForbiddenException('Reports about club staff are handled by the platform team')
  }
}

/**
 * A club admin must not moderate a report about their own message; that
 * report escalates to the platform queue (conflict of interest).
 */
function assertNotOwnReport(senderId: string | null, actorUserId: string) {
  if (senderId && senderId === actorUserId) {
    throw new ForbiddenException('Reports about your own message are handled by the platform team')
  }
}
