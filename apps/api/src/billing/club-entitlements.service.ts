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
  'fixture_sync',
] as const

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
    const active = grants.filter((grant) => grant.status === EntitlementStatus.ACTIVE)
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

  async publishPlan(actorId: string | null, input: PublishPlanDefinitionInput) {
    const plan = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plan:${input.tier}:${input.interval}`}))`
      const latest = await tx.planDefinition.findFirst({
        where: { tier: input.tier, interval: input.interval },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      await tx.planDefinition.updateMany({
        where: { tier: input.tier, interval: input.interval, publishedAt: { not: null } },
        data: { publishedAt: null },
      })
      return tx.planDefinition.create({
        data: {
          tier: input.tier,
          interval: input.interval,
          version: (latest?.version ?? 0) + 1,
          priceCents: input.priceCents,
          currency: input.currency.toLowerCase(),
          teamLimit: input.teamLimit,
          playerLimit: input.playerLimit,
          features: input.features,
          stripePriceId: input.stripePriceId ?? null,
          publishedAt: new Date(),
        },
      })
    })
    await this.audit.log({
      clubId: null,
      type: 'billing.plan_published',
      actorType: 'admin',
      actorId,
      actorLabel: null,
      summary: `Published ${plan.tier} ${plan.interval} plan version ${plan.version}`,
    })
    return plan
  }

  listPlans() {
    return this.prisma.planDefinition.findMany({
      orderBy: [{ tier: 'asc' }, { interval: 'asc' }, { version: 'desc' }],
    })
  }

  async grant(clubId: string, actorId: string | null, input: CreateEntitlementGrantInput) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true },
    })
    if (!club) throw new ConflictException('Club not found')
    const definition = await this.prisma.planDefinition.findFirst({
      where: { tier: input.tier, interval: input.interval, publishedAt: { not: null } },
      orderBy: [{ version: 'desc' }, { publishedAt: 'desc' }],
    })
    if (!definition) throw new ConflictException('No published definition exists for this tier')
    const grant = await this.prisma.entitlementGrant.create({
      data: {
        clubId,
        tier: input.tier,
        source: input.source,
        startsAt: input.startsAt ? new Date(input.startsAt) : new Date(),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        reason: input.reason,
        createdById: actorId,
        planDefinitionId: definition.id,
      },
    })
    await this.audit.log({
      clubId,
      type: 'billing.entitlement_granted',
      actorType: 'admin',
      actorId,
      actorLabel: null,
      summary: `Granted ${grant.tier} via ${grant.source}: ${grant.reason ?? 'No reason'}`,
    })
    return grant
  }

  async revoke(grantId: string, actorId: string | null) {
    const grant = await this.prisma.entitlementGrant.findUnique({ where: { id: grantId } })
    if (!grant) throw new ConflictException('Active entitlement grant not found')
    const result = await this.prisma.entitlementGrant.updateMany({
      where: { id: grantId, status: { in: ['ACTIVE', 'SUSPENDED'] } },
      data: { status: 'REVOKED' },
    })
    if (result.count !== 1) throw new ConflictException('Active entitlement grant not found')
    await this.audit.log({
      clubId: grant.clubId,
      type: 'billing.entitlement_revoked',
      actorType: 'admin',
      actorId,
      actorLabel: null,
      summary: `Revoked ${grant.tier} entitlement ${grant.id}`,
    })
    return { revoked: true }
  }

  async snapshot(clubId: string) {
    const [entitlement, usage] = await Promise.all([this.resolve(clubId), this.usage(clubId)])
    return { clubId, ...entitlement, usage }
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
