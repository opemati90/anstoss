import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { PlatformAdminActor } from './platform-admin.types'

const ALLOWED_FEATURE_SLUGS = new Set([
  'sponsor_logos',
  'splash_image',
  'custom_domain',
  'lineup_builder_pro',
  'motm_archive',
  'contribution_intake',
  'scouting_marketplace',
  'priority_support',
])

/**
 * Per-club entitlement overrides — read by BillingService.getEntitlements
 * to add/remove features above what the plan grants. Use cases:
 *   - Comp a non-paying club one Plus feature ("contribution_intake") as
 *     a goodwill gesture without giving them the full plan.
 *   - Yank a single feature ("scouting_marketplace") from a paying club
 *     that violated terms.
 */
@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(clubId?: string) {
    const where = clubId ? { clubId } : {}
    const rows = await this.prisma.featureFlagOverride.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        club: { select: { id: true, name: true, slug: true } },
      },
    })
    return rows
  }

  async upsert(input: {
    clubId: string
    featureSlug: string
    enabled: boolean
    reason?: string | null
    expiresAt?: Date | null
    actor: PlatformAdminActor
  }) {
    if (!input.clubId || !input.featureSlug) {
      throw new BadRequestException('clubId and featureSlug required')
    }
    if (!ALLOWED_FEATURE_SLUGS.has(input.featureSlug)) {
      throw new BadRequestException('Unknown feature slug')
    }
    if (input.expiresAt && Number.isNaN(input.expiresAt.getTime())) {
      throw new BadRequestException('Invalid expiresAt')
    }

    const before = await this.prisma.featureFlagOverride.findUnique({
      where: {
        clubId_featureSlug: {
          clubId: input.clubId,
          featureSlug: input.featureSlug,
        },
      },
    })

    const override = await this.prisma.featureFlagOverride.upsert({
      where: {
        clubId_featureSlug: {
          clubId: input.clubId,
          featureSlug: input.featureSlug,
        },
      },
      update: {
        enabled: input.enabled,
        reason: input.reason ?? null,
        expiresAt: input.expiresAt ?? null,
        createdById: input.actor.id,
      },
      create: {
        clubId: input.clubId,
        featureSlug: input.featureSlug,
        enabled: input.enabled,
        reason: input.reason ?? null,
        expiresAt: input.expiresAt ?? null,
        createdById: input.actor.id,
      },
    })

    await this.auditService.log({
      clubId: input.clubId,
      type: 'admin.feature_flag.updated',
      actorType: 'admin',
      actorId: input.actor.id,
      actorLabel: input.actor.email ?? input.actor.name,
      summary: `${input.enabled ? 'Granted' : 'Revoked'} ${input.featureSlug}.`,
      metadata: {
        featureSlug: input.featureSlug,
        enabled: input.enabled,
        previousEnabled: before?.enabled ?? null,
        overrideId: override.id,
      },
    })

    return override
  }

  async remove(id: string, actor: PlatformAdminActor) {
    const before = await this.prisma.featureFlagOverride.delete({
      where: { id },
    })
    await this.auditService.log({
      clubId: before.clubId,
      type: 'admin.feature_flag.removed',
      actorType: 'admin',
      actorId: actor.id,
      actorLabel: actor.email ?? actor.name,
      summary: `Removed override for ${before.featureSlug}.`,
      metadata: {
        featureSlug: before.featureSlug,
        enabled: before.enabled,
        overrideId: before.id,
      },
    })
  }

  /**
   * Apply overrides on top of a plan-derived feature list. Called from
   * BillingService.getEntitlements.
   */
  async applyOverrides(
    clubId: string,
    baseFeatures: string[],
  ): Promise<string[]> {
    const overrides = await this.prisma.featureFlagOverride.findMany({
      where: { clubId },
    })
    if (overrides.length === 0) return baseFeatures

    const now = Date.now()
    const granted = new Set<string>()
    const denied = new Set<string>()
    for (const o of overrides) {
      if (o.expiresAt && o.expiresAt.getTime() < now) continue
      if (o.enabled) granted.add(o.featureSlug)
      else denied.add(o.featureSlug)
    }

    const result = new Set(baseFeatures)
    for (const f of granted) result.add(f)
    for (const f of denied) result.delete(f)
    return Array.from(result)
  }
}
