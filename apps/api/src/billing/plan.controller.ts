import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { MembershipRole, startPlanTrialSchema } from '@anstoss/shared'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { RequireRole, RolesGuard } from '../auth/roles.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { ClubEntitlementsService } from './club-entitlements.service'

/**
 * Club plan ("Abo") — REVAMP_HANDOFF.md "Plans and pricing". Every member can
 * read the plan status; only Vorstand or Kassenwart can start the card-less
 * trial (checked in the service, since Kassenwart is a club office rather
 * than a membership role). Paid subscriptions are sold on the website.
 */
@Controller('clubs/:clubId/plan')
@UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
export class PlanController {
  constructor(private readonly entitlements: ClubEntitlementsService) {}

  @Get()
  @RequireRole(MembershipRole.PARENT)
  getPlan(@Param('clubId') clubId: string, @CurrentUser() user: { id: string }) {
    return this.entitlements.plan(clubId, user.id)
  }

  @Post('trial')
  @RequireRole(MembershipRole.PARENT)
  @RateLimit('write')
  startTrial(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    startPlanTrialSchema.parse(body ?? {})
    return this.entitlements.startTrial(clubId, user.id)
  }
}
