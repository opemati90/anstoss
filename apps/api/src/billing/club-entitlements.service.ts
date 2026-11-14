import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import {
  ClubOperationalRole,
  EntitlementSource,
  EntitlementStatus,
  MembershipRole,
  PlanTier,
  Prisma,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamRole,
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { activeTeamAccessWhere } from '../teams/active-team-access'
import {
  PLAN_CURRENCY,
  PLAN_PRICES_CENTS,
  PLAN_SALES_EMAIL,
  PLAN_TRIAL_DAYS,
  planFeatureFlags,
  type ClubPlan,
  type CreateEntitlementGrantInput,
  type PlanFeature,
  type PlanFeatureFlags,
  type PublishPlanDefinitionInput,
} from '@anstoss/shared'
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
const DAY_MS = 24 * 60 * 60 * 1000

/** Vorstand: these membership roles may start or change the club plan. */
const PLAN_MANAGER_ROLES: ReadonlySet<MembershipRole> = new Set([
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
])
/** Vorstand (board member) and Kassenwart (treasurer) offices, whatever their membership role. */
const PLAN_MANAGER_OFFICES: ReadonlySet<ClubOperationalRole> = new Set([
  ClubOperationalRole.BOARD_MEMBER,
  ClubOperationalRole.TREASURER,
])

/** Only Vorstand or Kassenwart may start or change a plan. */
export class PlanManagementForbiddenException extends ForbiddenException {
  constructor() {
    super('Only the Vorstand or the Kassenwart can start or change the club plan')
  }
}

/** The club already holds Verein (or better) or has used its one trial. */
export class PlanTrialUnavailableException extends ConflictException {
  constructor(reason: 'already_used' | 'already_paid') {
    super(
      reason === 'already_used'
        ? 'This club has already used its 30-day trial'
        : 'This club already has the Verein plan',
    )
  }
}

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
          // Wechselbörse review B1: a Probetraining (TRIAL) is not a seat.
          phase: TeamAccessPhase.FULL,
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
        // B1: only a FULL seat already held skips the check; TRIAL access
        // (Probetraining) must not let a player join past the plan limit.
        phase: TeamAccessPhase.FULL,
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

  // ─── Plans and pricing (Abo screen) ──────────────────────────

  /**
   * Feature flags for a tier. Kostenlos clubs keep events, chat, squad,
   * lineup, parents and consents; everything in PLAN_FEATURES (club colours,
   * live ticker, Matchday Studio, …) unlocks with Verein. Child consent and safety features are never part of this map,
   * so they can never be gated.
   */
  featureFlags(tier: PlanTier): PlanFeatureFlags {
    return planFeatureFlags(tier)
  }

  /** Gate a paid feature through one place instead of scattered tier checks. */
  async hasFeature(clubId: string, feature: PlanFeature, db: DbClient = this.prisma) {
    const { tier } = await this.resolve(clubId, db)
    return this.featureFlags(tier)[feature]
  }

  /** Vorstand (OWNER/ADMIN or BOARD_MEMBER office) or Kassenwart (TREASURER office). */
  async canManagePlan(clubId: string, userId: string, db: DbClient = this.prisma) {
    const membership = await db.membership.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: { role: true, operationalRoles: true },
    })
    if (!membership) return false
    if (PLAN_MANAGER_ROLES.has(membership.role)) return true
    return (membership.operationalRoles ?? []).some((office) => PLAN_MANAGER_OFFICES.has(office))
  }

  /** GET /clubs/:clubId/plan — what the Abo screen and the More row read. */
  async plan(clubId: string, userId: string): Promise<ClubPlan> {
    const [entitlement, usage, priorTrial, canManage] = await Promise.all([
      this.resolve(clubId),
      this.usage(clubId),
      this.prisma.entitlementGrant.findFirst({
        where: { clubId, source: EntitlementSource.TRIAL },
        select: { id: true },
      }),
      this.canManagePlan(clubId, userId),
    ])
    const now = new Date()
    const winning = entitlement.grants.find(
      (grant) =>
        grant.tier === entitlement.tier &&
        (grant.status === EntitlementStatus.ACTIVE ||
          (grant.graceEndsAt !== null && grant.graceEndsAt > now)),
    )
    const source = entitlement.tier === PlanTier.FREE || !winning ? 'NONE' : winning.source
    return {
      clubId,
      tier: entitlement.tier,
      source,
      trialEndsAt:
        source === EntitlementSource.TRIAL && winning?.expiresAt
          ? winning.expiresAt.toISOString()
          : null,
      trialUsed: Boolean(priorTrial),
      limits: entitlement.limits,
      usage,
      prices: {
        monthly: { amountCents: PLAN_PRICES_CENTS.monthly, currency: PLAN_CURRENCY },
        yearly: { amountCents: PLAN_PRICES_CENTS.yearly, currency: PLAN_CURRENCY },
      },
      features: this.featureFlags(entitlement.tier),
      canManage,
      salesEmail: PLAN_SALES_EMAIL,
    }
  }

  /**
   * POST /clubs/:clubId/plan/trial — 30 days of Verein, no card. The grant
   * simply expires; resolve() then falls back to Kostenlos, data stays and
   * gated features turn read-only. One trial per club.
   */
  async startTrial(clubId: string, userId: string): Promise<ClubPlan> {
    if (!(await this.canManagePlan(clubId, userId))) throw new PlanManagementForbiddenException()
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`entitlement-grant:${clubId}`}))`
      const priorTrial = await tx.entitlementGrant.findFirst({
        where: { clubId, source: EntitlementSource.TRIAL },
        select: { id: true },
      })
      if (priorTrial) throw new PlanTrialUnavailableException('already_used')
      const { tier } = await this.resolve(clubId, tx)
      if (tier !== PlanTier.FREE) throw new PlanTrialUnavailableException('already_paid')
      const startsAt = new Date()
      const grant = await tx.entitlementGrant.create({
        data: {
          clubId,
          tier: PlanTier.PRO,
          source: EntitlementSource.TRIAL,
          startsAt,
          expiresAt: new Date(startsAt.getTime() + PLAN_TRIAL_DAYS * DAY_MS),
          reason: 'In-app 30-day Verein trial',
          createdById: userId,
        },
      })
      await tx.auditLog.create({
        data: {
          clubId,
          type: 'billing.trial_started',
          actorType: 'user',
          actorId: userId,
          actorLabel: null,
          summary: `Started the ${PLAN_TRIAL_DAYS}-day Verein trial`,
          metadata: { grantId: grant.id, expiresAt: grant.expiresAt?.toISOString() ?? null },
        },
      })
    })
    return this.plan(clubId, userId)
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
