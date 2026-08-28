import { ConflictException, Injectable } from '@nestjs/common'
import { EntitlementStatus, PlanTier, Prisma, TeamAccessStatus, TeamRole } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { activeTeamAccessWhere } from '../teams/active-team-access'
import type { CreateEntitlementGrantInput, PublishPlanDefinitionInput } from '@anstoss/shared'
import { AuditService } from '../audit/audit.service'

export const PLAN_LIMITS: Record<PlanTier, { teams: number; players: number }> = {
  FREE: { teams: 1, players: 30 },
  PRO: { teams: 5, players: 150 },
  SCALE: { teams: 20, players: 600 },
}

export const CORE_CLUB_FEATURES = [
  'contribution_intake',
  'staff_chat',
  'club_player_search',
  'official_team_pages',
] as const

const DOWNGRADE_REMEDIATION_DAYS = 30

type DbClient = PrismaService | Prisma.TransactionClient

@Injectable()
export class ClubEntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async resolve(clubId: string, db: DbClient = this.prisma) {
    const now = new Date()
    const grants = await db.entitlementGrant.findMany({
      where: {
        clubId,
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ createdAt: 'desc' }],
    })
    const active = grants.filter(
      (grant) =>
        grant.status === EntitlementStatus.ACTIVE ||
        (grant.status === EntitlementStatus.SUSPENDED &&
          grant.graceEndsAt !== null &&
          grant.graceEndsAt > now),
    )
    const winningGrant = active.reduce<(typeof active)[number] | null>((best, grant) => {
      if (!best || tierRank(grant.tier) > tierRank(best.tier)) return grant
      return best
    }, null)
    const tier = winningGrant?.tier ?? PlanTier.FREE
    const definition = winningGrant?.planDefinitionId
      ? await db.planDefinition.findUnique({ where: { id: winningGrant.planDefinitionId } })
      : null
    const limits = definition
      ? { teams: definition.teamLimit, players: definition.playerLimit }
      : PLAN_LIMITS[tier]
    const features = Array.from(new Set([...CORE_CLUB_FEATURES, ...(definition?.features ?? [])]))
    return { tier, limits, features, definition, grants }
  }

  async usage(clubId: string, db: DbClient = this.prisma) {
    const [teams, activePlayers, openRosterSlots] = await Promise.all([
      db.team.count({ where: { clubId } }),
      db.teamAccess.findMany({
        where: {
          clubId,
          role: TeamRole.PLAYER,
          status: TeamAccessStatus.ACTIVE,
          ...activeTeamAccessWhere(),
        },
        distinct: ['userId'],
        select: { userId: true },
      }),
      db.rosterSlot.count({
        where: { team: { clubId }, claimedByUserId: null },
      }),
    ])
    return { teams, players: activePlayers.length + openRosterSlots }
  }

  async assertCanCreateTeam(clubId: string, db: DbClient = this.prisma) {
    await this.lockClubQuota(clubId, db)
    const [{ limits, tier }, usage] = await Promise.all([
      this.resolve(clubId, db),
      this.usage(clubId, db),
    ])
    if (usage.teams >= limits.teams) {
      throw new ConflictException(
        `${tier} supports ${limits.teams} team${limits.teams === 1 ? '' : 's'}. Upgrade before adding another team.`,
      )
    }
  }

  async assertCanActivatePlayer(clubId: string, userId: string, db: DbClient = this.prisma) {
    await this.lockClubQuota(clubId, db)
    const existing = await db.teamAccess.findFirst({
      where: {
        clubId,
        userId,
        role: TeamRole.PLAYER,
        status: TeamAccessStatus.ACTIVE,
        ...activeTeamAccessWhere(),
      },
      select: { id: true },
    })
    if (existing) return

    const [{ limits, tier }, usage] = await Promise.all([
      this.resolve(clubId, db),
      this.usage(clubId, db),
    ])
    if (usage.players >= limits.players) {
      throw new ConflictException(
        `${tier} supports ${limits.players} player seats. Upgrade or remove an unused roster slot.`,
      )
    }
  }

  async assertCanReservePlayerSeats(
    clubId: string,
    additionalSeats: number,
    db: DbClient = this.prisma,
  ) {
    if (!Number.isInteger(additionalSeats) || additionalSeats < 1) {
      throw new ConflictException('At least one player seat must be reserved')
    }
    await this.lockClubQuota(clubId, db)
    const [{ limits, tier }, usage] = await Promise.all([
      this.resolve(clubId, db),
      this.usage(clubId, db),
    ])
    if (usage.players + additionalSeats > limits.players) {
      throw new ConflictException(
        `${tier} supports ${limits.players} player seats. Reduce this batch or upgrade first.`,
      )
    }
  }

  async refreshCompliance(
    clubId: string,
    resolved?: Awaited<ReturnType<ClubEntitlementsService['resolve']>>,
    currentUsage?: Awaited<ReturnType<ClubEntitlementsService['usage']>>,
  ) {
    const [entitlement, usage] = await Promise.all([
      resolved ?? this.resolve(clubId),
      currentUsage ?? this.usage(clubId),
    ])
    const excessTeams = Math.max(0, usage.teams - entitlement.limits.teams)
    const excessPlayers = Math.max(0, usage.players - entitlement.limits.players)
    const existing = await this.prisma.clubPlanCompliance.findUnique({ where: { clubId } })

    if (excessTeams > 0 || excessPlayers > 0) {
      const isNewIncident = !existing || existing.status === 'RESOLVED'
      const now = new Date()
      const compliance = await this.prisma.clubPlanCompliance.upsert({
        where: { clubId },
        create: {
          clubId,
          status: 'OVER_QUOTA',
          tier: entitlement.tier,
          excessTeams,
          excessPlayers,
          detectedAt: now,
          remediationEndsAt: new Date(
            now.getTime() + DOWNGRADE_REMEDIATION_DAYS * 24 * 60 * 60 * 1000,
          ),
        },
        update: {
          status: 'OVER_QUOTA',
          tier: entitlement.tier,
          excessTeams,
          excessPlayers,
          ...(isNewIncident
            ? {
                detectedAt: now,
                remediationEndsAt: new Date(
                  now.getTime() + DOWNGRADE_REMEDIATION_DAYS * 24 * 60 * 60 * 1000,
                ),
                notifiedAt: null,
                resolvedAt: null,
              }
            : {}),
        },
      })
      if (isNewIncident) {
        await this.prisma.auditLog.create({
          data: {
            clubId,
            type: 'billing.over_quota_detected',
            actorType: 'system',
            actorId: null,
            actorLabel: 'entitlement-compliance',
            summary: 'Club entered the 30-day downgrade remediation window.',
            metadata: {
              tier: entitlement.tier,
              limits: entitlement.limits,
              usage,
              excessTeams,
              excessPlayers,
              remediationEndsAt: compliance.remediationEndsAt.toISOString(),
            },
          },
        })
      }
      return compliance
    }

    if (existing?.status === 'OVER_QUOTA') {
      const compliance = await this.prisma.clubPlanCompliance.update({
        where: { clubId },
        data: { status: 'RESOLVED', excessTeams: 0, excessPlayers: 0, resolvedAt: new Date() },
      })
      await this.prisma.auditLog.create({
        data: {
          clubId,
          type: 'billing.over_quota_resolved',
          actorType: 'system',
          actorId: null,
          actorLabel: 'entitlement-compliance',
          summary: 'Club returned within its active plan limits.',
          metadata: { tier: entitlement.tier, limits: entitlement.limits, usage },
        },
      })
      return compliance
    }
    return existing
  }

  async publishPlan(
    actorId: string | null,
    input: PublishPlanDefinitionInput,
    actorLabel: string | null = null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plan:${input.tier}:${input.interval}`}))`
      const latest = await tx.planDefinition.findFirst({
        where: { tier: input.tier, interval: input.interval },
        orderBy: { version: 'desc' },
      })
      const normalizedFeatures = [...new Set(input.features)].sort()
      if (
        latest &&
        latest.priceCents === input.priceCents &&
        latest.currency === input.currency.toLowerCase() &&
        latest.teamLimit === input.teamLimit &&
        latest.playerLimit === input.playerLimit &&
        latest.stripePriceId === (input.stripePriceId ?? null) &&
        [...latest.features].sort().join('\u0000') === normalizedFeatures.join('\u0000')
      ) {
        return latest
      }
      const plan = await tx.planDefinition.create({
        data: {
          tier: input.tier,
          interval: input.interval,
          version: (latest?.version ?? 0) + 1,
          priceCents: input.priceCents,
          currency: input.currency.toLowerCase(),
          teamLimit: input.teamLimit,
          playerLimit: input.playerLimit,
          features: normalizedFeatures,
          stripePriceId: input.stripePriceId ?? null,
          publishedAt: new Date(),
        },
      })
      await tx.auditLog.create({
        data: {
          clubId: null,
          type: 'billing.plan_published',
          actorType: 'admin',
          actorId,
          actorLabel,
          summary: `Published ${plan.tier} ${plan.interval} plan version ${plan.version}`,
          metadata: { planDefinitionId: plan.id },
        },
      })
      return plan
    })
  }

  listPlans() {
    return this.prisma.planDefinition.findMany({
      orderBy: [{ tier: 'asc' }, { interval: 'asc' }, { version: 'desc' }],
    })
  }

  async grant(
    clubId: string,
    actorId: string | null,
    input: CreateEntitlementGrantInput,
    actorLabel: string | null = null,
  ) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true },
    })
    if (!club) throw new ConflictException('Club not found')
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date()
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`entitlement-grant:${clubId}`}))`
      const definition = await tx.planDefinition.findFirst({
        where: { tier: input.tier, interval: input.interval, publishedAt: { not: null } },
        orderBy: [{ version: 'desc' }, { publishedAt: 'desc' }],
      })
      if (!definition) throw new ConflictException('No published definition exists for this tier')
      const overlapping = await tx.entitlementGrant.findFirst({
        where: {
          clubId,
          tier: input.tier,
          source: input.source,
          status: { in: ['ACTIVE', 'SUSPENDED'] },
          ...(expiresAt ? { startsAt: { lt: expiresAt } } : {}),
          OR: [{ expiresAt: null }, { expiresAt: { gt: startsAt } }],
        },
        select: { id: true },
      })
      if (overlapping) {
        throw new ConflictException('An overlapping entitlement grant already exists')
      }
      const grant = await tx.entitlementGrant.create({
        data: {
          clubId,
          tier: input.tier,
          source: input.source,
          startsAt,
          expiresAt,
          reason: input.reason,
          createdById: actorId,
          planDefinitionId: definition.id,
        },
      })
      await tx.auditLog.create({
        data: {
          clubId,
          type: 'billing.entitlement_granted',
          actorType: 'admin',
          actorId,
          actorLabel,
          summary: `Granted ${grant.tier} via ${grant.source}: ${grant.reason ?? 'No reason'}`,
          metadata: { grantId: grant.id, planDefinitionId: definition.id },
        },
      })
      return grant
    })
  }

  async revoke(grantId: string, actorId: string | null, actorLabel: string | null = null) {
    return this.prisma.$transaction(async (tx) => {
      const grant = await tx.entitlementGrant.findUnique({ where: { id: grantId } })
      if (!grant) throw new ConflictException('Active entitlement grant not found')
      if (grant.source === 'PAID' || grant.source === 'MIGRATED') {
        throw new ConflictException(
          'Paid or migrated access must be changed through its subscription lifecycle',
        )
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`entitlement-grant:${grant.clubId}`}))`
      const result = await tx.entitlementGrant.updateMany({
        where: { id: grantId, status: { in: ['ACTIVE', 'SUSPENDED'] } },
        data: { status: 'REVOKED' },
      })
      if (result.count !== 1) throw new ConflictException('Active entitlement grant not found')
      await tx.auditLog.create({
        data: {
          clubId: grant.clubId,
          type: 'billing.entitlement_revoked',
          actorType: 'admin',
          actorId,
          actorLabel,
          summary: `Revoked ${grant.tier} entitlement ${grant.id}`,
          metadata: { grantId: grant.id },
        },
      })
      return { revoked: true }
    })
  }

  async snapshot(clubId: string) {
    const [entitlement, usage, grants] = await Promise.all([
      this.resolve(clubId),
      this.usage(clubId),
      this.prisma.entitlementGrant.findMany({
        where: { clubId },
        include: { planDefinition: true },
        orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ])
    const compliance = await this.refreshCompliance(clubId, entitlement, usage)
    return { clubId, ...entitlement, grants, usage, compliance }
  }

  private async lockClubQuota(clubId: string, db: DbClient) {
    if ('$executeRaw' in db) {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`quota:${clubId}`}))`
    }
  }
}

function tierRank(tier: PlanTier) {
  if (tier === PlanTier.SCALE) return 2
  if (tier === PlanTier.PRO) return 1
  return 0
}
