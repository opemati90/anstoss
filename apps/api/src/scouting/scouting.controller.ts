import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { z } from 'zod'
import { MembershipRole } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { RolesGuard, RequireRole } from '../auth/roles.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { ScoutingService } from './scouting.service'
import { EntitlementGuard, RequireFeature } from '../billing/entitlement.guard'

const interestSchema = z.object({
  contacted: z.boolean(),
})

/**
 * Scouting feed — a club-side view onto the player marketplace. Surfaces
 * public free-agent profiles + lets the club mark "interested" on each.
 * Backed by the same FreeAgentProfile records used by /transfer-list.
 */
@Controller('clubs/:clubId/scouting')
@UseGuards(ClerkAuthGuard, AgeGateGuard, EntitlementGuard, RolesGuard)
@RequireFeature('scouting_marketplace')
// Scouting is a club-management surface: caller must be a COACH+ member of
// the club, not merely any authenticated user who knows a premium clubId.
@RequireRole(MembershipRole.COACH)
export class ScoutingController {
  constructor(private readonly scoutingService: ScoutingService) {}

  @Get()
  async listFeed(@Param('clubId') clubId: string) {
    return this.scoutingService.listFeed(clubId)
  }

  @Post(':agentId/interest')
  @RateLimit('write')
  async markInterest(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('agentId') agentId: string,
    @Body() body: unknown,
  ) {
    const data = interestSchema.parse(body)
    await this.scoutingService.markInterest(
      clubId,
      user.id,
      agentId,
      data.contacted,
    )
    return { success: true }
  }
}
