import { Injectable } from '@nestjs/common'
import type { AuditEvent } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async getClubFeed(clubId: string): Promise<AuditEvent[]> {
    const [club, memberships, invites, events] = await Promise.all([
      this.prisma.club.findUnique({
        where: { id: clubId },
      }),
      this.prisma.membership.findMany({
        where: { clubId },
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
        take: 25,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invite.findMany({
        where: { clubId },
        take: 25,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.event.findMany({
        where: { clubId },
        take: 25,
        include: {
          createdBy: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const auditEvents: AuditEvent[] = []

    if (club) {
      auditEvents.push({
        id: `club_${club.id}`,
        type: 'club.created',
        actorType: 'system',
        actorId: null,
        actorLabel: null,
        clubId,
        createdAt: club.createdAt.toISOString(),
        summary: `${club.name} was created.`,
      })
    }

    memberships.forEach((membership: typeof memberships[number]) => {
      auditEvents.push({
        id: `membership_${membership.id}`,
        type: 'membership.created',
        actorType: 'user',
        actorId: membership.userId,
        actorLabel: membership.user.name,
        clubId,
        createdAt: membership.createdAt.toISOString(),
        summary: `${membership.user.name} joined as ${membership.role}.`,
      })
    })

    invites.forEach((invite: typeof invites[number]) => {
      auditEvents.push({
        id: `invite_${invite.id}`,
        type: invite.consumedAt ? 'invite.redeemed' : 'invite.created',
        actorType: 'system',
        actorId: null,
        actorLabel: null,
        clubId,
        createdAt: (invite.consumedAt || invite.createdAt).toISOString(),
        summary: invite.consumedAt
          ? `Invite ${invite.code} was redeemed.`
          : `Invite ${invite.code} was created.`,
      })
    })

    events.forEach((event: typeof events[number]) => {
      auditEvents.push({
        id: `event_${event.id}`,
        type: 'event.created',
        actorType: 'user',
        actorId: event.createdById,
        actorLabel: event.createdBy.name,
        clubId,
        createdAt: event.createdAt.toISOString(),
        summary: `${event.createdBy.name} created ${event.title}.`,
      })
    })

    return auditEvents
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50)
  }
}
