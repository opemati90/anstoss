import { BadRequestException, Injectable } from '@nestjs/common'
import type { SupportActionInput } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import type { PlatformAdminActor } from './platform-admin.types'

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

  async listClubs(opts: { search?: string; limit?: number; offset?: number } = {}) {
    const limit = Math.min(opts.limit ?? 50, 200)
    const offset = opts.offset ?? 0
    const where = opts.search
      ? {
          OR: [
            { name: { contains: opts.search, mode: 'insensitive' as const } },
            { slug: { contains: opts.search, mode: 'insensitive' as const } },
          ],
        }
      : {}

    const [clubs, total] = await Promise.all([
      this.prisma.club.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          _count: {
            select: {
              memberships: true,
              teams: true,
              invites: true,
              events: true,
              subscriptions: true,
            },
          },
        },
      }),
      this.prisma.club.count({ where }),
    ])

    return {
      total,
      rows: clubs.map((club: typeof clubs[number]) => ({
        id: club.id,
        name: club.name,
        slug: club.slug,
        primaryColor: club.primaryColor,
        badgeUrl: club.badgeUrl,
        createdAt: club.createdAt,
        counts: club._count,
        hasSubscription: club._count.subscriptions > 0,
      })),
    }
  }

  async getClub(clubId: string) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      include: {
        memberships: {
          where: { role: { in: ['OWNER', 'ADMIN'] } },
          select: {
            role: true,
            user: { select: { id: true, name: true, email: true } },
          },
          take: 10,
        },
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        stripeAccount: {
          select: { stripeAccountId: true, onboardingComplete: true },
        },
        _count: {
          select: {
            memberships: true,
            teamGroups: true,
            events: true,
          },
        },
      },
    })

    if (!club) return null

    const sub = club.subscriptions[0] ?? null
    return {
      id: club.id,
      name: club.name,
      slug: club.slug,
      city: club.city,
      primaryColor: club.primaryColor,
      badgeUrl: club.badgeUrl,
      createdAt: club.createdAt,
      counts: club._count,
      owners: club.memberships,
      subscription: sub
        ? {
            plan: sub.plan,
            status: sub.status,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          }
        : null,
      stripeAccount: club.stripeAccount,
    }
  }

  async listUsers(opts: { search?: string; limit?: number; offset?: number } = {}) {
    const limit = Math.min(opts.limit ?? 50, 200)
    const offset = opts.offset ?? 0
    const where = opts.search
      ? {
          OR: [
            { name: { contains: opts.search, mode: 'insensitive' as const } },
            { email: { contains: opts.search, mode: 'insensitive' as const } },
          ],
        }
      : {}

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          deletedAt: true,
          platformRole: true,
          _count: { select: { memberships: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ])

    return {
      total,
      rows: rows.map((u: typeof rows[number]) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        createdAt: u.createdAt,
        deleted: !!u.deletedAt,
        platformRole: u.platformRole,
        clubCount: u._count.memberships,
      })),
    }
  }

  async listSubscriptions(opts: { status?: string; limit?: number } = {}) {
    const limit = Math.min(opts.limit ?? 50, 200)
    const where = opts.status ? { status: opts.status } : {}

    const subs = await this.prisma.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        club: { select: { id: true, name: true, slug: true } },
      },
    })

    return subs.map((s: typeof subs[number]) => ({
      id: s.id,
      stripeSubscriptionId: s.stripeSubscriptionId,
      status: s.status,
      plan: s.plan,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      club: s.club,
    }))
  }

  async revenueSummary() {
    // Naive MRR estimate: count active subs, infer cadence from billing
    // period length (>60 days = yearly, else monthly). Replace with the
    // Stripe Reporting API in V2 once we have multi-tier pricing.
    const active = await this.prisma.subscription.findMany({
      where: { status: 'active' },
      select: { currentPeriodStart: true, currentPeriodEnd: true },
    })

    let mrrCents = 0
    for (const s of active) {
      const days =
        (s.currentPeriodEnd.getTime() - s.currentPeriodStart.getTime()) /
        (1000 * 60 * 60 * 24)
      if (days > 60) {
        mrrCents += Math.round(19900 / 12) // €199/yr → €16.58/mo
      } else {
        mrrCents += 1999 // €19.99/mo
      }
    }

    return {
      activeCount: active.length,
      mrrCents,
      arrCents: mrrCents * 12,
    }
  }

  async healthSnapshot() {
    const [userCount, clubCount, activeSubs, deletedUsers] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.club.count(),
      this.prisma.subscription.count({ where: { status: 'active' } }),
      this.prisma.user.count({ where: { deletedAt: { not: null } } }),
    ])

    return {
      userCount,
      clubCount,
      activeSubscriptions: activeSubs,
      deletedUsers,
      checkedAt: new Date().toISOString(),
    }
  }

  // ─── Analytics ───────────────────────────────────────────

  /**
   * KPI snapshot for the admin dashboard. We don't have a real per-event
   * analytics table yet — instead we infer activity from User.updatedAt
   * (Clerk + JIT refresh) and the canonical engagement signals: Rsvp,
   * Message, Event. Replace with a proper analytics pipeline (Posthog,
   * Mixpanel, custom EventLog) when scale demands it.
   */
  async analyticsSnapshot() {
    const now = new Date()
    const day = 24 * 60 * 60 * 1000
    const since = (ms: number) => new Date(now.getTime() - ms)

    const [
      totalUsers,
      totalClubs,
      dau,
      wau,
      mau,
      signupsLast7,
      signupsLast30,
      eventsLast30,
      rsvpsLast30,
      activatedLast30,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.club.count(),
      // DAU/WAU/MAU proxy: distinct users with engagement signals.
      this.activeUsersSince(since(1 * day)),
      this.activeUsersSince(since(7 * day)),
      this.activeUsersSince(since(30 * day)),
      this.prisma.user.count({
        where: { createdAt: { gte: since(7 * day) }, deletedAt: null },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: since(30 * day) }, deletedAt: null },
      }),
      this.prisma.event.count({ where: { createdAt: { gte: since(30 * day) } } }),
      this.prisma.rsvp.count({ where: { updatedAt: { gte: since(30 * day) } } }),
      this.activationFunnel(since(30 * day)),
    ])

    // Signups by day for the last 30 days (sparkline data).
    const signupsByDay = await this.signupsByDay(30)

    return {
      checkedAt: now.toISOString(),
      totals: { users: totalUsers, clubs: totalClubs },
      activeUsers: { dau, wau, mau },
      signups: { last7: signupsLast7, last30: signupsLast30, byDay: signupsByDay },
      engagementLast30: { events: eventsLast30, rsvps: rsvpsLast30 },
      activationLast30: activatedLast30,
    }
  }

  private async activeUsersSince(since: Date): Promise<number> {
    // Activity = wrote a message OR sent an RSVP OR created an event in
    // the window. UNION distinct user IDs. We could include push token
    // refreshes too once we start logging them.
    const [msgIds, rsvpIds, eventIds] = await Promise.all([
      this.prisma.message.findMany({
        where: { createdAt: { gte: since } },
        select: { senderId: true },
        distinct: ['senderId'],
      }),
      this.prisma.rsvp.findMany({
        where: { updatedAt: { gte: since } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.event.findMany({
        where: { createdAt: { gte: since } },
        select: { createdById: true },
        distinct: ['createdById'],
      }),
    ])
    const set = new Set<string>()
    for (const m of msgIds) if (m.senderId) set.add(m.senderId)
    for (const r of rsvpIds) set.add(r.userId)
    for (const e of eventIds) set.add(e.createdById)
    return set.size
  }

  private async activationFunnel(since: Date) {
    // Cohort: users who signed up since the window start. Activation:
    // they created an event OR sent at least one RSVP in any time.
    const cohort = await this.prisma.user.findMany({
      where: { createdAt: { gte: since }, deletedAt: null },
      select: { id: true },
    })
    if (cohort.length === 0) {
      return { signups: 0, createdAnEvent: 0, sentAnRsvp: 0 }
    }
    const ids = cohort.map((c: { id: string }) => c.id)
    const [createdEvent, sentRsvp] = await Promise.all([
      this.prisma.event.findMany({
        where: { createdById: { in: ids } },
        select: { createdById: true },
        distinct: ['createdById'],
      }),
      this.prisma.rsvp.findMany({
        where: { userId: { in: ids } },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ])
    return {
      signups: cohort.length,
      createdAnEvent: createdEvent.length,
      sentAnRsvp: sentRsvp.length,
    }
  }

  private async signupsByDay(days: number) {
    // Raw SQL because Prisma's groupBy doesn't truncate dates. Returns
    // [{ day: '2026-05-01', count: 3 }, ...] ordered ascending.
    const rows = await this.prisma.$queryRaw<
      { day: Date; count: bigint }[]
    >`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM "User"
      WHERE "deletedAt" IS NULL
        AND "createdAt" >= NOW() - (${days}::int * INTERVAL '1 day')
      GROUP BY 1
      ORDER BY 1 ASC
    `
    return rows.map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      count: Number(r.count),
    }))
  }

  async performSupportAction(
    actor: PlatformAdminActor,
    input: SupportActionInput,
  ) {
    if (input.action !== 'SUPPORT_NOTE') {
      throw new BadRequestException('Unsupported support action')
    }
    const actorId = actor.id ?? 'admin-api-key'
    const actorEmail = actor.email ?? 'admin-key'
    const supportAction = await this.prisma.supportAction.create({
      data: {
        action: input.action,
        clubId: input.clubId,
        actorId,
        actorEmail,
        note: input.note ?? null,
      },
    })

    await this.prisma.auditLog.create({
      data: {
        clubId: input.clubId,
        type: 'support.action',
        actorType: 'admin',
        actorId,
        actorLabel: actor.email ?? actor.name,
        summary: `${actor.name} recorded a support note${input.note ? ': ' + input.note : ''}`,
        metadata: {
          supportActionId: supportAction.id,
          action: input.action,
        },
      },
    })

    return {
      id: supportAction.id,
      action: supportAction.action,
      clubId: supportAction.clubId,
      note: supportAction.note,
      actor: { ...actor, id: actorId, email: actor.email ?? actorEmail },
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
