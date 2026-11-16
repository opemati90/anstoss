import { BadRequestException, Injectable } from '@nestjs/common'
import type { AdminDirectoryQuery, SupportActionInput } from '@anstoss/shared'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { PlatformAdminActor } from './platform-admin.types'
import { tenantContext } from '../prisma/tenant.context'

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async directory(q: AdminDirectoryQuery) {
    const page = { take: q.limit, skip: q.offset, orderBy: [{ createdAt: 'desc' as const }, { id: 'asc' as const }] }
    if (q.kind === 'clubs') {
      if (!['all', 'populated', 'empty'].includes(q.state)) throw new BadRequestException('Invalid club state')
      const where: Prisma.ClubWhereInput = {
        ...(q.clubId ? { id: q.clubId } : {}),
        ...(q.search ? { OR: ['name', 'slug', 'city'].map((key) => ({ [key]: { contains: q.search, mode: 'insensitive' } })) } : {}),
        ...(q.state === 'empty' ? { teams: { none: {} } } : q.state === 'populated' ? { teams: { some: {} } } : {}),
      }
      const [rows, total] = await Promise.all([
        this.prisma.club.findMany({ where, ...page, select: {
          id: true, name: true, slug: true, city: true, createdAt: true,
          _count: { select: { memberships: true, teams: true } },
        } }),
        this.prisma.club.count({ where }),
      ])
      return { rows, total, offset: q.offset, limit: q.limit }
    }
    const currentAccess: Prisma.TeamAccessWhereInput = {
      status: 'ACTIVE',
      AND: [{ OR: [{ loanEndDate: null }, { loanEndDate: { gt: new Date() } }] },
        { OR: [{ loanStartDate: null }, { loanStartDate: { lte: new Date() } }] }],
    }
    if (q.kind === 'teams') {
      if (!['all', 'populated', 'empty'].includes(q.state)) throw new BadRequestException('Invalid team state')
      const memberAccess = { ...currentAccess, user: { deletedAt: null } }
      const where: Prisma.TeamWhereInput = {
        ...(q.clubId ? { clubId: q.clubId } : {}),
        ...(q.teamId ? { id: q.teamId } : {}),
        ...(q.search ? { OR: ['name', 'displayName', 'leagueName'].map((key) => ({ [key]: { contains: q.search, mode: 'insensitive' } })) } : {}),
        ...(q.state === 'empty' ? { access: { none: memberAccess } } : q.state === 'populated' ? { access: { some: memberAccess } } : {}),
      }
      const [rows, total] = await Promise.all([
        this.prisma.team.findMany({ where, ...page, select: {
          id: true, displayName: true, ageGroup: true, leagueName: true, createdAt: true,
          club: { select: { id: true, name: true } },
        } }),
        this.prisma.team.count({ where }),
      ])
      const members = rows.length ? await this.prisma.teamAccess.groupBy({
        by: ['teamId', 'userId'], where: { ...memberAccess, teamId: { in: rows.map((row) => row.id) } },
      }) : []
      const counts = new Map<string, number>()
      for (const member of members) counts.set(member.teamId, (counts.get(member.teamId) ?? 0) + 1)
      return { rows: rows.map((row) => ({ ...row, _count: { access: counts.get(row.id) ?? 0 } })), total, offset: q.offset, limit: q.limit }
    }
    if (!['all', 'active', 'deleted'].includes(q.state)) throw new BadRequestException('Invalid account state')
    const access = { ...currentAccess, ...(q.clubId ? { clubId: q.clubId } : {}), ...(q.teamId ? { teamId: q.teamId } : {}) }
    const and: Prisma.UserWhereInput[] = []
    if (q.search) and.push({ OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] })
    if (q.state !== 'all') and.push({ deletedAt: q.state === 'deleted' ? { not: null } : null })
    if (q.clubId) and.push({ memberships: { some: { clubId: q.clubId } } })
    if (q.teamId) and.push({ teamAccess: { some: access } })
    const role = q.kind === 'players' ? 'player' : q.role
    if (role === 'player') {
      and.push({ platformRole: 'NONE', OR: [
        { teamAccess: { some: { ...access, role: 'PLAYER' } } },
        ...(!q.teamId ? [{ memberships: { some: { ...(q.clubId ? { clubId: q.clubId } : {}), role: 'PLAYER' as const } } }] : []),
        ...(!q.clubId && !q.teamId ? [
          { registrationRole: 'PLAYER' as const, memberships: { none: {} }, teamAccess: { none: currentAccess } },
          { registrationRole: 'FREE_AGENT' as const, freeAgentProfile: { is: { recruitmentRole: 'PLAYER' as const } } },
        ] : []),
      ] })
    } else if (role === 'coach') {
      and.push({ OR: [{ teamAccess: { some: { ...access, role: { in: ['HEAD_COACH', 'ASSISTANT_COACH'] } } } },
        ...(!q.teamId ? [{ memberships: { some: { ...(q.clubId ? { clubId: q.clubId } : {}), role: 'COACH' as const } } }] : []),
        ...(!q.clubId && !q.teamId ? [{ registrationRole: 'COACH' as const }] : []),
        ...(!q.clubId && !q.teamId ? [{ registrationRole: 'FREE_AGENT' as const, freeAgentProfile: { is: { recruitmentRole: 'COACH' as const } } }] : []),
      ] })
    } else if (role === 'club_admin') {
      and.push({ memberships: { some: { ...(q.clubId ? { clubId: q.clubId } : {}), role: { in: ['OWNER', 'ADMIN'] } } } })
    } else if (role === 'free_agent') and.push({ registrationRole: 'FREE_AGENT' })
    else if (role === 'platform_admin') and.push({ platformRole: 'PLATFORM_ADMIN' })
    const where: Prisma.UserWhereInput = { AND: and }
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, ...page, select: {
        id: true, name: true, email: true, registrationRole: true, platformRole: true, deletedAt: true, createdAt: true,
        freeAgentProfile: { select: { recruitmentRole: true } },
        memberships: { where: q.clubId ? { clubId: q.clubId } : undefined, take: 10, select: { role: true, club: { select: { id: true, name: true } } } },
        teamAccess: { where: access, take: 10, select: { role: true, team: { select: { id: true, displayName: true } } } },
        _count: { select: { memberships: true, teamAccess: { where: currentAccess } } },
      } }),
      this.prisma.user.count({ where }),
    ])
    return { rows, total, offset: q.offset, limit: q.limit }
  }

  async getDashboard() {
    const now = new Date()
    const [clubs, users, memberships, upcomingEvents, activeInvites, officialTeamPages, fixtures, pendingClaims, failedReminders] =
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
        this.prisma.externalTeamLink.count({
          where: { provider: { in: ['FUSSBALL_PUBLIC_PAGE', 'WIDGET_EMBED'] } },
        }),
        this.prisma.importedFixture.count(),
        this.prisma.clubClaim.count({
          where: { status: { in: ['SUBMITTED', 'NEEDS_INFO'] }, expiresAt: { gt: now } },
        }),
        this.prisma.contributionReminder.count({ where: { status: 'FAILED' } }),
      ])

    return {
      clubs,
      users,
      memberships,
      upcomingEvents,
      activeInvites,
      officialTeamPages,
      fixtures,
      pendingClaims,
      failedReminders,
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
        city: club.city,
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

  async listInviteCampaigns(opts: { suspiciousOnly?: boolean; limit?: number } = {}) {
    const limit = Math.min(opts.limit ?? 100, 200)
    return this.prisma.inviteCampaign.findMany({
      where: opts.suspiciousOnly
        ? {
            status: 'ACTIVE',
            OR: [{ maxUses: { gte: 100 } }, { useCount: { gte: 50 } }],
          }
        : undefined,
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
      include: {
        club: { select: { id: true, name: true } },
        team: { select: { id: true, displayName: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    })
  }

  async revokeInviteCampaign(
    campaignId: string,
    actor: PlatformAdminActor,
    reason: string,
  ) {
    const campaign = await this.prisma.inviteCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, clubId: true, status: true },
    })
    if (!campaign) throw new BadRequestException('Invite campaign not found')
    const normalizedReason = reason.trim()
    if (normalizedReason.length < 5) {
      throw new BadRequestException('Add a clear revocation reason')
    }
    return tenantContext.run(
      { clubId: campaign.clubId, userId: actor.id ?? 'platform-admin' },
      () =>
        this.prisma.$transaction(async (tx) => {
          const result = await tx.inviteCampaign.updateMany({
            where: { id: campaign.id, status: 'ACTIVE' },
            data: { status: 'REVOKED' },
          })
          if (result.count !== 1) {
            throw new BadRequestException('Invite campaign is no longer active')
          }
          await tx.auditLog.create({
            data: {
              clubId: campaign.clubId,
              type: 'invite.campaign_revoked',
              actorType: 'admin',
              actorId: actor.id,
              actorLabel: actor.name,
              summary: 'Platform admin revoked an invite campaign.',
              metadata: { campaignId, reason: normalizedReason },
            },
          })
          return { revoked: true }
        }),
    )
  }

  listJoinRequests(opts: { status?: string; limit?: number } = {}) {
    return this.prisma.joinRequest.findMany({
      where: opts.status ? { status: opts.status as any } : undefined,
      orderBy: [{ createdAt: 'desc' }],
      take: Math.min(opts.limit ?? 100, 200),
      include: {
        club: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    })
  }

  async contributionHealth() {
    const now = new Date()
    const [records, failedReminders, recentImports] = await Promise.all([
      this.prisma.contributionRecord.groupBy({
        by: ['clubId', 'status'],
        _count: { _all: true },
        _sum: { amount: true, paidAmount: true },
      }),
      this.prisma.contributionReminder.groupBy({
        by: ['clubId'],
        where: { status: 'FAILED' },
        _count: { _all: true },
      }),
      this.prisma.bankImportBatch.groupBy({
        by: ['clubId'],
        where: { createdAt: { gte: new Date(now.getTime() - 30 * 86400000) } },
        _count: { _all: true },
      }),
    ])
    return { generatedAt: now, records, failedReminders, recentImports }
  }

  async revenueSummary() {
    const now = new Date()
    const active = await this.prisma.entitlementGrant.findMany({
      where: {
        source: 'PAID',
        status: 'ACTIVE',
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        clubId: true,
        planDefinition: {
          select: { priceCents: true, interval: true, currency: true },
        },
      },
    })

    let mrrCents = 0
    for (const grant of active) {
      const plan = grant.planDefinition
      if (!plan || plan.currency.toLowerCase() !== 'eur') continue
      const months = plan.interval === 'MONTHLY' ? 1 : plan.interval === 'SIX_MONTHS' ? 6 : 12
      mrrCents += Math.round(plan.priceCents / months)
    }

    return {
      activeCount: new Set(active.map((grant) => grant.clubId)).size,
      mrrCents,
      arrCents: mrrCents * 12,
      source: 'stripe_webhook_entitlements',
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

}
