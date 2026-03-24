import { Injectable } from '@nestjs/common'
import type { SupportActionInput } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const [clubs, users, memberships, upcomingEvents, activeInvites] =
      await Promise.all([
        this.prisma.club.count(),
        this.prisma.user.count(),
        this.prisma.membership.count(),
        this.prisma.event.count({
          where: {
            date: { gte: new Date() },
          },
        }),
        this.prisma.invite.count({
          where: {
            status: {
              in: ['PENDING', 'SENT'],
            },
            expiresAt: { gte: new Date() },
          },
        }),
      ])

    return {
      clubs,
      users,
      memberships,
      upcomingEvents,
      activeInvites,
    }
  }

  async listClubs() {
    const clubs = await this.prisma.club.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            memberships: true,
            teams: true,
            invites: true,
            events: true,
          },
        },
      },
    })

    return clubs.map((club: typeof clubs[number]) => ({
      id: club.id,
      name: club.name,
      slug: club.slug,
      primaryColor: club.primaryColor,
      badgeUrl: club.badgeUrl,
      createdAt: club.createdAt,
      counts: club._count,
    }))
  }

  async performSupportAction(
    actor: { id: string; email: string; name: string },
    input: SupportActionInput,
  ) {
    return {
      id: `support_${Date.now()}`,
      action: input.action,
      clubId: input.clubId,
      note: input.note ?? null,
      actor,
      createdAt: new Date().toISOString(),
      persisted: false,
    }
  }
}
