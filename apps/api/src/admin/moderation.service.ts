import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { PlatformAdminActor } from './platform-admin.types'

/**
 * Moderation queue for the internal admin panel. Surfaces user-submitted
 * `MessageReport` rows and the `UserBlock` graph. Admin actions resolve
 * a report with a `resolvedById + resolution` note. Deeper moderation
 * (suspend user, delete message) is layered on top of existing
 * support-actions and bans — those routes already exist elsewhere.
 */
@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listReports(opts: { resolved?: boolean; limit?: number } = {}) {
    const limit = Math.min(opts.limit ?? 50, 200)
    const where =
      opts.resolved === undefined
        ? {}
        : opts.resolved
          ? { resolvedAt: { not: null } }
          : { resolvedAt: null }

    const rows = await this.prisma.messageReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        message: {
          select: {
            id: true,
            content: true,
            createdAt: true,
            sender: { select: { id: true, name: true, email: true } },
            clubId: true,
          },
        },
      },
    })
    return rows
  }

  async resolveReport(
    reportId: string,
    actor: PlatformAdminActor,
    resolution: string,
  ) {
    const report = await this.prisma.messageReport.findUnique({
      where: { id: reportId },
      include: {
        message: { select: { id: true, clubId: true } },
      },
    })
    if (!report) throw new NotFoundException('Report not found')

    const updated = await this.prisma.messageReport.update({
      where: { id: reportId },
      data: {
        resolvedAt: new Date(),
        resolvedById: actor.id,
        resolution: resolution || 'dismissed',
      },
    })

    await this.auditService.log({
      clubId: report.message.clubId,
      type: 'admin.moderation_report.resolved',
      actorType: 'admin',
      actorId: actor.id,
      actorLabel: actor.email ?? actor.name,
      summary: `Resolved message report ${reportId}.`,
      metadata: {
        reportId,
        messageId: report.message.id,
        resolution: updated.resolution ?? 'dismissed',
      },
    })

    return updated
  }

  async listBlocks(opts: { limit?: number } = {}) {
    const limit = Math.min(opts.limit ?? 100, 500)
    return this.prisma.userBlock.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        blocker: { select: { id: true, name: true, email: true } },
        blocked: { select: { id: true, name: true, email: true } },
      },
    })
  }
}
