import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { AuditService } from '../audit/audit.service'
import type { PlatformAdminActor } from './platform-admin.types'

/**
 * Platform-admin broadcasts. Resolve a segment ('ALL' | 'PREMIUM' |
 * 'FREE' | 'CLUB:<id>') to a set of push tokens and push immediately.
 * Persisted to the Broadcast model for audit + retry analytics. No
 * scheduling yet — V3.
 */
@Injectable()
export class BroadcastsService {
  private readonly logger = new Logger(BroadcastsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
    private readonly auditService: AuditService,
  ) {}

  async listRecent(limit = 50) {
    const rows = await this.prisma.broadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    })
    return rows
  }

  async createAndSend(input: {
    title: string
    body: string
    segment: string
    actor: PlatformAdminActor & { id: string }
  }) {
    if (process.env.ENABLE_ADMIN_BROADCASTS !== 'true') {
      throw new BadRequestException('Admin broadcasts are disabled for launch')
    }
    if (!input.title?.trim()) {
      throw new BadRequestException('title required')
    }
    if (!input.body?.trim()) {
      throw new BadRequestException('body required')
    }
    if (!input.segment?.trim()) {
      throw new BadRequestException('segment required')
    }

    const broadcast = await this.prisma.broadcast.create({
      data: {
        title: input.title.trim(),
        body: input.body.trim(),
        segment: input.segment.trim(),
        status: 'SENDING',
        createdById: input.actor.id,
      },
    })

    try {
      const userIds = await this.resolveSegmentToUserIds(input.segment)
      const tokens = await this.tokensForUsers(userIds)

      const stats = await this.pushService.sendToTokens(
        tokens,
        input.title,
        input.body,
        { type: 'broadcast', broadcastId: broadcast.id },
      )

      const updated = await this.prisma.broadcast.update({
        where: { id: broadcast.id },
        data: {
          status: 'SENT',
          recipientCount: stats.recipientCount,
          successCount: stats.successCount,
          failureCount: stats.failureCount,
          sentAt: new Date(),
        },
      })
      await this.auditService.log({
        clubId: input.segment.startsWith('CLUB:')
          ? input.segment.slice('CLUB:'.length)
          : null,
        type: 'admin.broadcast.sent',
        actorType: 'admin',
        actorId: input.actor.id,
        actorLabel: input.actor.email ?? input.actor.name,
        summary: `Broadcast sent to ${input.segment}.`,
        metadata: {
          broadcastId: broadcast.id,
          segment: input.segment,
          recipientCount: updated.recipientCount,
          successCount: updated.successCount,
          failureCount: updated.failureCount,
        },
      })
      return updated
    } catch (err) {
      this.logger.error('Broadcast send failed', err)
      await this.prisma.broadcast.update({
        where: { id: broadcast.id },
        data: { status: 'FAILED' },
      })
      await this.auditService.log({
        clubId: input.segment.startsWith('CLUB:')
          ? input.segment.slice('CLUB:'.length)
          : null,
        type: 'admin.broadcast.failed',
        actorType: 'admin',
        actorId: input.actor.id,
        actorLabel: input.actor.email ?? input.actor.name,
        summary: `Broadcast failed for ${input.segment}.`,
        metadata: {
          broadcastId: broadcast.id,
          segment: input.segment,
        },
      })
      throw err
    }
  }

  private async resolveSegmentToUserIds(segment: string): Promise<string[]> {
    if (segment === 'ALL') {
      const users = await this.prisma.user.findMany({
        where: { deletedAt: null },
        select: { id: true },
      })
      return users.map((u: { id: string }) => u.id)
    }

    if (segment === 'PREMIUM' || segment === 'FREE') {
      // Resolve which clubs are PREMIUM (have an active subscription).
      const activeClubIds = await this.prisma.subscription
        .findMany({
          where: { status: 'active' },
          select: { clubId: true },
          distinct: ['clubId'],
        })
        .then((rows: { clubId: string }[]) => rows.map((r) => r.clubId))

      const memberships = await this.prisma.membership.findMany({
        where:
          segment === 'PREMIUM'
            ? { clubId: { in: activeClubIds } }
            : { clubId: { notIn: activeClubIds } },
        select: { userId: true },
      })
      const ids = new Set<string>()
      for (const m of memberships) ids.add(m.userId)
      return Array.from(ids)
    }

    if (segment.startsWith('CLUB:')) {
      const clubId = segment.slice('CLUB:'.length)
      const memberships = await this.prisma.membership.findMany({
        where: { clubId },
        select: { userId: true },
      })
      const ids = new Set<string>()
      for (const m of memberships) ids.add(m.userId)
      return Array.from(ids)
    }

    throw new BadRequestException(`Unknown segment: ${segment}`)
  }

  private async tokensForUsers(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return []
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    })
    // De-dupe in case a user has the same token registered twice.
    return Array.from(new Set(tokens.map((t: { token: string }) => t.token)))
  }
}
