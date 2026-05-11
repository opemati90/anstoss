import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { z } from 'zod'
import { MembershipRole } from '@anstoss/shared'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { RequireRole, RolesGuard } from '../auth/roles.guard'
import { EntitlementGuard, RequireFeature } from '../billing/entitlement.guard'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { SponsorsService } from './sponsors.service'

const createSponsorSchema = z.object({
  name: z.string().min(1).max(120),
  logoUrl: z.string().url(),
  linkUrl: z.string().url().nullable().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
})

const updateSponsorSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  logoUrl: z.string().url().optional(),
  linkUrl: z.string().url().nullable().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
})

/**
 * Sponsor logos — a Plus (PREMIUM) feature. Admins of a paying club can
 * upload kit-sponsor logos; the club's home screen surfaces them in a
 * scrolling strip for every member.
 *
 * Read is intentionally NOT entitlement-gated: if a club downgrades to
 * FOUNDATION their previously-uploaded sponsors stay visible so they
 * can still be cleaned up. Delete is role-gated only for the same
 * reason. Writes (POST/PATCH) require the `sponsor_logos` entitlement.
 */
@Controller('clubs/:clubId/sponsors')
@UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
export class SponsorsController {
  constructor(private readonly sponsorsService: SponsorsService) {}

  @Get()
  async list(@Param('clubId') clubId: string) {
    return this.sponsorsService.list(clubId)
  }

  @Post()
  @UseGuards(EntitlementGuard)
  @RequireRole(MembershipRole.ADMIN)
  @RequireFeature('sponsor_logos')
  @RateLimit('write')
  async create(
    @Param('clubId') clubId: string,
    @Body() body: unknown,
  ) {
    const data = createSponsorSchema.parse(body)
    return this.sponsorsService.create(clubId, data)
  }

  @Patch(':id')
  @UseGuards(EntitlementGuard)
  @RequireRole(MembershipRole.ADMIN)
  @RequireFeature('sponsor_logos')
  @RateLimit('write')
  async update(
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const data = updateSponsorSchema.parse(body)
    return this.sponsorsService.update(clubId, id, data)
  }

  @Delete(':id')
  @RequireRole(MembershipRole.ADMIN)
  @RateLimit('write')
  async remove(
    @Param('clubId') clubId: string,
    @Param('id') id: string,
  ) {
    return this.sponsorsService.remove(clubId, id)
  }
}
