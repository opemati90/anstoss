import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Moderation queue for the internal admin panel. Surfaces user-submitted
 * `MessageReport` rows and the `UserBlock` graph. Admin actions resolve
 * a report with a `resolvedById + resolution` note. Deeper moderation
 * (suspend user, delete message) is layered on top of existing
 * support-actions and bans — those routes already exist elsewhere.
 */
@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

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
    resolverId: string,
    resolution: string,
  ) {
    const report = await this.prisma.messageReport.findUnique({
      where: { id: reportId },
    })
    if (!report) throw new NotFoundException('Report not found')

    return this.prisma.messageReport.update({
      where: { id: reportId },
      data: {
        resolvedAt: new Date(),
        resolvedById: resolverId,
        resolution: resolution || 'dismissed',
      },
    })
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
