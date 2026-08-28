import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import {
  createOwnershipTransferSchema,
  requestOwnershipTransferChallengeSchema,
  verifyOwnershipTransferChallengeSchema,
  reviewClubClaimSchema,
  respondClubClaimSchema,
  submitFirstClubClaimSchema,
  submitStaffAccessRequestSchema,
  MembershipRole,
} from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RequireRole, RolesGuard } from '../auth/roles.guard'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { ClubActivationService } from './club-activation.service'

@Controller()
@UseGuards(ClerkAuthGuard)
export class ClubActivationController {
  constructor(private readonly activation: ClubActivationService) {}

  @Post('club-claims/first')
  @RateLimit('club-claim')
  submitFirstClaim(
    @CurrentUser() user: { id: string; email: string | null },
    @Body() body: unknown,
  ) {
    return this.activation.submitFirstClaim(
      user.id,
      user.email,
      submitFirstClubClaimSchema.parse(body),
    )
  }

  @Post('clubs/:clubId/staff-access-requests')
  @RateLimit('club-claim')
  submitStaffRequest(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Body() body: unknown,
  ) {
    return this.activation.submitStaffRequest(
      user.id,
      clubId,
      submitStaffAccessRequestSchema.parse(body),
    )
  }

  @Get('club-claims/mine')
  listMine(@CurrentUser() user: { id: string }) {
    return this.activation.listMine(user.id)
  }

  @Get('clubs/:clubId/staff-access-requests')
  @UseGuards(RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  listClubRequests(@Param('clubId') clubId: string) {
    return this.activation.listClubRequests(clubId)
  }

  @Post('clubs/:clubId/staff-access-requests/:claimId/decision')
  @UseGuards(RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  @RateLimit('write')
  reviewStaffRequest(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('claimId') claimId: string,
    @Body() body: unknown,
  ) {
    return this.activation.reviewStaffRequest(
      user.id,
      clubId,
      claimId,
      reviewClubClaimSchema.parse(body),
    )
  }

  @Post('club-claims/:claimId/withdraw')
  @RateLimit('write')
  withdraw(@CurrentUser() user: { id: string }, @Param('claimId') claimId: string) {
    return this.activation.withdraw(user.id, claimId)
  }

  @Post('club-claims/:claimId/respond')
  @RateLimit('club-claim')
  respond(
    @CurrentUser() user: { id: string; email: string | null },
    @Param('claimId') claimId: string,
    @Body() body: unknown,
  ) {
    return this.activation.respondToInformationRequest(
      user,
      claimId,
      respondClubClaimSchema.parse(body),
    )
  }

  @Post('clubs/:clubId/ownership-transfers')
  @UseGuards(RolesGuard)
  @RequireRole(MembershipRole.OWNER)
  @RateLimit('ownership-challenge')
  startOwnershipTransfer(
    @CurrentUser() user: { id: string; authenticatedAt?: number },
    @Param('clubId') clubId: string,
    @Body() body: unknown,
  ) {
    return this.activation.startOwnershipTransfer(
      user,
      clubId,
      createOwnershipTransferSchema.parse(body),
    )
  }

  @Post('clubs/:clubId/ownership-transfers/challenge')
  @UseGuards(RolesGuard)
  @RequireRole(MembershipRole.OWNER)
  @RateLimit('ownership-challenge')
  requestOwnershipTransferChallenge(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Body() body: unknown,
  ) {
    return this.activation.requestOwnershipTransferChallenge(
      user,
      clubId,
      requestOwnershipTransferChallengeSchema.parse(body),
    )
  }

  @Post('ownership-transfers/:transferId/challenge')
  @RateLimit('ownership-challenge')
  requestOwnershipAcceptanceChallenge(
    @CurrentUser() user: { id: string },
    @Param('transferId') transferId: string,
  ) {
    return this.activation.requestOwnershipAcceptanceChallenge(user, transferId)
  }

  @Post('ownership-transfers/:transferId/accept')
  @RateLimit('ownership-challenge')
  acceptOwnershipTransfer(
    @CurrentUser() user: { id: string; authenticatedAt?: number },
    @Param('transferId') transferId: string,
    @Body() body: unknown,
  ) {
    return this.activation.acceptOwnershipTransfer(
      user,
      transferId,
      verifyOwnershipTransferChallengeSchema.parse(body),
    )
  }

  @Get('ownership-transfers/mine')
  listOwnershipTransfers(@CurrentUser() user: { id: string }) {
    return this.activation.listOwnershipTransfersForUser(user.id)
  }

  @Post('ownership-transfers/:transferId/cancel')
  @RateLimit('write')
  cancelOwnershipTransfer(
    @CurrentUser() user: { id: string; authenticatedAt?: number },
    @Param('transferId') transferId: string,
  ) {
    return this.activation.cancelOwnershipTransfer(user, transferId)
  }
}
