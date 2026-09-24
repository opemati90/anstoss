import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { MembershipRole, parentalConsentSchema, withdrawConsentSchema } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard, AllowWithoutConsent } from '../auth/age-gate.guard'
import { RolesGuard, RequireRole } from '../auth/roles.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { ConsentService } from './consent.service'

@Controller()
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  /** Get pending consent requests for the current user (as guardian). */
  @AllowWithoutConsent()
  @Get('consent/pending')
  @UseGuards(ClerkAuthGuard)
  async getPendingConsents(
    @CurrentUser() user: { id: string; email: string },
  ) {
    return this.consentService.getPendingForGuardian(user.email)
  }

  /** Approve a consent request. */
  @AllowWithoutConsent()
  @Post('consent/:consentId/approve')
  @UseGuards(ClerkAuthGuard)
  @RateLimit('write')
  async approveConsent(
    @Param('consentId') consentId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.consentService.approveConsent(consentId, user.id)
  }

  /**
   * Privacy: every consent the caller gave or was asked for (guardian view),
   * so they can review and withdraw it.
   */
  @AllowWithoutConsent()
  @Get('consent/mine')
  @UseGuards(ClerkAuthGuard)
  async listMyConsents(
    @CurrentUser() user: { id: string; email?: string | null },
  ) {
    return this.consentService.listForGuardian(user)
  }

  /**
   * Privacy: withdraw an approved consent (GDPR Art. 7(3)). The guardian of
   * the consent, or a club OWNER/ADMIN acting on the guardian's written
   * request (body.note required). Revokes the dependent team access.
   */
  @AllowWithoutConsent()
  @Post('consent/:consentId/withdraw')
  @UseGuards(ClerkAuthGuard)
  @RateLimit('write')
  async withdrawConsent(
    @Param('consentId') consentId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const input = withdrawConsentSchema.parse(body ?? {})
    return this.consentService.withdrawConsent(consentId, user.id, input)
  }

  /** Reject a consent request. */
  @AllowWithoutConsent()
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
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const input = parentalConsentSchema.parse(body)
    return this.consentService.createConsentRequest({
      clubId,
      teamId: input.teamId,
      playerUserId: input.playerUserId,
      guardianEmail: input.guardianEmail,
      // M3: the requester can never be the consenting guardian.
      requestedByUserId: user.id,
    })
  }

  /** Get consent status for a player (admin inspect). */
  @Get('clubs/:clubId/consent/inspect/:userId')
  @UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  async inspectConsentStatus(
    @Param('clubId') clubId: string,
    @Param('userId') userId: string,
  ) {
    // Tenant-scoped: an admin may only inspect members of their own club.
    return this.consentService.inspectConsentStatus(clubId, userId)
  }
}
