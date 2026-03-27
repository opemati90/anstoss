import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import type { AuditEvent, ActorType, AuditEventType } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Write a new audit log entry. */
  async log(entry: {
    clubId: string | null
    type: AuditEventType
    actorType: ActorType
    actorId: string | null
    actorLabel: string | null
    summary: string
    metadata?: Record<string, string | number | boolean | null>
  }) {
    const { metadata, ...rest } = entry
    return this.prisma.auditLog.create({
      data: {
        ...rest,
        metadata: metadata
          ? (metadata as Prisma.InputJsonValue)
          : undefined,
      },
    })
  }

  /** Paginated audit feed for a club — reads from AuditLog table. */
  async getClubFeed(
    clubId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<{ items: AuditEvent[]; nextCursor: string | null }> {
    const limit = options?.limit ?? 50

    const rows = await this.prisma.auditLog.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(options?.cursor
        ? { cursor: { id: options.cursor }, skip: 1 }
        : {}),
    })

    const hasMore = rows.length > limit
    const items = (hasMore ? rows.slice(0, limit) : rows).map(
      (row): AuditEvent => ({
        id: row.id,
        type: row.type as AuditEventType,
        actorType: row.actorType as ActorType,
        actorId: row.actorId,
        actorLabel: row.actorLabel,
        clubId: row.clubId,
        createdAt: row.createdAt.toISOString(),
        summary: row.summary,
      }),
    )

    return {
      items,
      nextCursor: hasMore ? rows[limit - 1].id : null,
    }
  }

  /** Platform-wide audit log for internal admins. */
  async getPlatformFeed(options?: {
    cursor?: string
    limit?: number
    type?: string
  }): Promise<{ items: AuditEvent[]; nextCursor: string | null }> {
    const limit = options?.limit ?? 50

    const rows = await this.prisma.auditLog.findMany({
      where: options?.type ? { type: options.type } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(options?.cursor
        ? { cursor: { id: options.cursor }, skip: 1 }
        : {}),
    })

    const hasMore = rows.length > limit
    const items = (hasMore ? rows.slice(0, limit) : rows).map(
      (row): AuditEvent => ({
        id: row.id,
        type: row.type as AuditEventType,
        actorType: row.actorType as ActorType,
        actorId: row.actorId,
        actorLabel: row.actorLabel,
        clubId: row.clubId,
        createdAt: row.createdAt.toISOString(),
        summary: row.summary,
      }),
    )

    return {
      items,
      nextCursor: hasMore ? rows[limit - 1].id : null,
    }
  }

  /**
   * Backfill: reconstruct audit events from existing tables for clubs
   * that were created before AuditLog was introduced.
   */
  async backfillClubAudit(clubId: string): Promise<number> {
    const existing = await this.prisma.auditLog.count({ where: { clubId } })
    if (existing > 0) return 0 // already has entries

    const [club, memberships, invites, events] = await Promise.all([
      this.prisma.club.findUnique({ where: { id: clubId } }),
      this.prisma.membership.findMany({
        where: { clubId },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.invite.findMany({
        where: { clubId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.event.findMany({
        where: { clubId },
        include: { createdBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ])

    const entries: {
      clubId: string
      type: string
      actorType: string
      actorId: string | null
      actorLabel: string | null
      summary: string
      createdAt: Date
    }[] = []

    if (club) {
      entries.push({
        clubId,
        type: 'club.created',
        actorType: 'system',
        actorId: null,
        actorLabel: null,
        summary: `${club.name} was created.`,
        createdAt: club.createdAt,
      })
    }

    for (const m of memberships) {
      entries.push({
        clubId,
        type: 'membership.created',
        actorType: 'user',
        actorId: m.userId,
        actorLabel: m.user.name,
        summary: `${m.user.name} joined as ${m.role}.`,
        createdAt: m.createdAt,
      })
    }

    for (const inv of invites) {
      const redeemed = inv.status === 'ACCEPTED' || !!inv.acceptedAt
      entries.push({
        clubId,
        type: redeemed ? 'invite.redeemed' : 'invite.created',
        actorType: 'system',
        actorId: null,
        actorLabel: null,
        summary: redeemed
          ? `Invite ${inv.code} was redeemed.`
          : `Invite ${inv.code} was created.`,
        createdAt: inv.acceptedAt || inv.createdAt,
      })
    }

    for (const ev of events) {
      entries.push({
        clubId,
        type: 'event.created',
        actorType: 'user',
        actorId: ev.createdById,
        actorLabel: ev.createdBy.name,
        summary: `${ev.createdBy.name} created ${ev.title}.`,
        createdAt: ev.createdAt,
      })
    }

    if (entries.length === 0) return 0

    await this.prisma.auditLog.createMany({ data: entries })
    return entries.length
  }
}
