import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
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
  constructor(private readonly prisma: PrismaService) {}

  async listReports(opts: { resolved?: boolean; limit?: number } = {}) {
    const limit = Math.min(opts.limit ?? 50, 200)
    const where =
      opts.resolved === undefined
        ? {}
        : opts.resolved
          ? { resolvedAt: { not: null } }
          : { resolvedAt: null }

    const [channelReports, directReports] = await Promise.all([
      this.prisma.messageReport.findMany({
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
      }),
      this.prisma.directMessageReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          reporter: { select: { id: true, name: true, email: true } },
          directMessage: {
            select: {
              id: true,
              content: true,
              createdAt: true,
              sender: { select: { id: true, name: true, email: true } },
              conversation: { select: { clubId: true } },
            },
          },
        },
      }),
    ])

    return [
      ...channelReports.map((report) => ({ ...report, kind: 'channel' as const })),
      ...directReports.map(({ directMessage, ...report }) => ({
        ...report,
        kind: 'direct' as const,
        message: {
          id: directMessage.id,
          content: directMessage.content || report.evidenceContent || '',
          createdAt: directMessage.createdAt,
          sender: directMessage.sender,
          clubId: directMessage.conversation.clubId,
        },
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
  }

  async resolveReport(
    reportId: string,
    actor: PlatformAdminActor,
    resolution: string,
    action: 'dismiss' | 'remove' = 'dismiss',
  ) {
    const report = await this.prisma.messageReport.findUnique({
      where: { id: reportId },
      include: {
        message: { select: { id: true, clubId: true } },
      },
    })
    if (!report) {
      const directReport = await this.prisma.directMessageReport.findUnique({
        where: { id: reportId },
        include: {
          directMessage: {
            select: {
              id: true,
              conversation: { select: { clubId: true } },
            },
          },
        },
      })
      if (!directReport) throw new NotFoundException('Report not found')

      return this.prisma.$transaction(async (tx) => {
        const claimed = await tx.directMessageReport.updateMany({
          where: { id: reportId, resolvedAt: null },
          data: {
            resolvedAt: new Date(),
            resolvedById: actor.id,
            resolution: resolution || action,
          },
        })
        if (claimed.count !== 1) {
          throw new ConflictException('Report has already been resolved')
        }
        if (action === 'remove') {
          await tx.directMessage.update({
            where: { id: directReport.directMessage.id },
            data: { content: '' },
          })
        }
        await tx.auditLog.create({
          data: {
            clubId: directReport.directMessage.conversation.clubId,
            type: 'admin.moderation_report.resolved',
            actorType: 'admin',
            actorId: actor.id,
            actorLabel: actor.email ?? actor.name,
            summary: `${action === 'remove' ? 'Removed content for' : 'Resolved'} direct-message report ${reportId}.`,
            metadata: {
              reportId,
              messageId: directReport.directMessage.id,
              messageKind: 'direct',
              action,
              resolution: resolution || action,
            },
          },
        })
        return tx.directMessageReport.findUniqueOrThrow({ where: { id: reportId } })
      })
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.messageReport.updateMany({
        where: { id: reportId, resolvedAt: null },
        data: {
          resolvedAt: new Date(),
          resolvedById: actor.id,
          resolution: resolution || action,
        },
      })
      if (claimed.count !== 1) {
        throw new ConflictException('Report has already been resolved')
      }
      if (action === 'remove') {
        await tx.message.update({
          where: { id: report.message.id },
          data: {
            deletedAt: new Date(),
            content: '',
            attachmentUrl: null,
            attachmentMeta: Prisma.JsonNull,
          },
        })
      }
      await tx.auditLog.create({
        data: {
          clubId: report.message.clubId,
          type: 'admin.moderation_report.resolved',
          actorType: 'admin',
          actorId: actor.id,
          actorLabel: actor.email ?? actor.name,
          summary: `${action === 'remove' ? 'Removed content for' : 'Resolved'} message report ${reportId}.`,
          metadata: {
            reportId,
            messageId: report.message.id,
            messageKind: 'channel',
            action,
            resolution: resolution || action,
          },
        },
      })
      return tx.messageReport.findUniqueOrThrow({ where: { id: reportId } })
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
