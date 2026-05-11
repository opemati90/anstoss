import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

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
  constructor(private readonly prisma: PrismaService) {}

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
    createdById?: string | null
  }) {
    if (!input.clubId || !input.featureSlug) {
      throw new BadRequestException('clubId and featureSlug required')
    }

    return this.prisma.featureFlagOverride.upsert({
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
        createdById: input.createdById ?? null,
      },
      create: {
        clubId: input.clubId,
        featureSlug: input.featureSlug,
        enabled: input.enabled,
        reason: input.reason ?? null,
        expiresAt: input.expiresAt ?? null,
        createdById: input.createdById ?? null,
      },
    })
  }

  async remove(id: string) {
    await this.prisma.featureFlagOverride.delete({ where: { id } })
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
