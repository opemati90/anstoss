import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { MembershipRole, parentalConsentSchema } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { RolesGuard, RequireRole } from '../auth/roles.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { ConsentService } from './consent.service'

@Controller()
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  /** Get pending consent requests for the current user (as guardian). */
  @Get('consent/pending')
  @UseGuards(ClerkAuthGuard)
  async getPendingConsents(
    @CurrentUser() user: { id: string; email: string },
  ) {
    return this.consentService.getPendingForGuardian(user.email)
  }

  /** Approve a consent request. */
  @Post('consent/:consentId/approve')
  @UseGuards(ClerkAuthGuard)
  @RateLimit('write')
  async approveConsent(
    @Param('consentId') consentId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.consentService.approveConsent(consentId, user.id)
  }

  /** Reject a consent request. */
  @Post('consent/:consentId/reject')
  @UseGuards(ClerkAuthGuard)
  @RateLimit('write')
  async rejectConsent(
    @Param('consentId') consentId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.consentService.rejectConsent(consentId, user.id)
  }

  /** Create a consent request for an under-16 player (coach/admin). */
  @Post('clubs/:clubId/consent')
  @UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
  @RequireRole(MembershipRole.COACH)
  @RateLimit('write')
  async createConsentRequest(
    @Param('clubId') clubId: string,
    @Body() body: unknown,
  ) {
    const input = parentalConsentSchema.parse(body)
    return this.consentService.createConsentRequest({
      clubId,
      teamId: input.teamId,
      playerUserId: input.playerUserId,
      guardianEmail: input.guardianEmail,
    })
  }

  /** Get consent status for a player (admin inspect). */
  @Get('clubs/:clubId/consent/inspect/:userId')
  @UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  async inspectConsentStatus(@Param('userId') userId: string) {
    return this.consentService.inspectConsentStatus(userId)
  }
}
