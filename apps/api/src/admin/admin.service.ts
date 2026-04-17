import { Injectable } from '@nestjs/common'
import type { SupportActionInput } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const staleCutoff = new Date(Date.now() - 12 * 60 * 60 * 1000)
    const [clubs, users, memberships, upcomingEvents, activeInvites, teamLinks, importedFixtures, staleTeamLinks, failedSyncRuns] =
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
        this.prisma.externalTeamLink.count(),
        this.prisma.importedFixture.count(),
        this.prisma.externalTeamLink.count({
          where: {
            status: 'ACTIVE',
            OR: [
              { lastSyncedAt: null },
              { lastSyncedAt: { lt: staleCutoff } },
            ],
          },
        }),
        this.prisma.syncRun.count({
          where: {
            status: 'FAILED',
          },
        }),
      ])

    return {
      clubs,
      users,
      memberships,
      upcomingEvents,
      activeInvites,
      teamLinks,
      importedFixtures,
      staleTeamLinks,
      failedSyncRuns,
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
    const supportAction = await this.prisma.supportAction.create({
      data: {
        action: input.action,
        clubId: input.clubId,
        actorId: actor.id,
        actorEmail: actor.email,
        note: input.note ?? null,
      },
    })

    await this.prisma.auditLog.create({
      data: {
        clubId: input.clubId,
        type: 'support.action',
        actorType: 'admin',
        actorId: actor.id,
        actorLabel: actor.name,
        summary: `${actor.name} performed ${input.action}${input.note ? ': ' + input.note : ''}`,
        metadata: { supportActionId: supportAction.id, action: input.action },
      },
    })

    return {
      id: supportAction.id,
      action: supportAction.action,
      clubId: supportAction.clubId,
      note: supportAction.note,
      actor,
      createdAt: supportAction.createdAt.toISOString(),
    }
  }

  async listSupportActions(clubId?: string) {
    return this.prisma.supportAction.findMany({
      where: clubId ? { clubId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  }

  async listFussballTeamLinks() {
    const links = await this.prisma.externalTeamLink.findMany({
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        team: {
          select: {
            id: true,
            displayName: true,
          },
        },
        club: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            fixtures: true,
            syncRuns: true,
          },
        },
      },
      take: 30,
    })

    return links.map((link: typeof links[number]) => ({
      id: link.id,
      label: link.label,
      provider: link.provider,
      status: link.status,
      externalTeamId: link.externalTeamId,
      externalUrl: link.externalUrl,
      lastSyncedAt: link.lastSyncedAt,
      updatedAt: link.updatedAt,
      club: link.club,
      team: link.team,
      counts: link._count,
    }))
  }

  async listFussballSyncRuns() {
    const runs = await this.prisma.syncRun.findMany({
      orderBy: [{ createdAt: 'desc' }],
      include: {
        teamLink: {
          select: {
            id: true,
            label: true,
            team: {
              select: {
                id: true,
                displayName: true,
              },
            },
            club: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      take: 40,
    })

    return runs.map((run: typeof runs[number]) => ({
      id: run.id,
      status: run.status,
      provider: run.provider,
      importedCount: run.importedCount,
      updatedCount: run.updatedCount,
      skippedCount: run.skippedCount,
      parserVersion: run.parserVersion,
      errorSummary: run.errorSummary,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      createdAt: run.createdAt,
      teamLink: {
        id: run.teamLink.id,
        label: run.teamLink.label,
        team: run.teamLink.team,
        club: run.teamLink.club,
      },
    }))
  }
}
