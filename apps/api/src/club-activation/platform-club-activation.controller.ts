import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import {
  openClubDisputeSchema,
  resolveClubDisputeSchema,
  reviewClubClaimSchema,
} from '@anstoss/shared'
import { CurrentUser } from '../auth/user.decorator'
import { PlatformAdminGuard } from '../admin/platform-admin.guard'
import type { PlatformAdminRequestUser } from '../admin/platform-admin.types'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { ClubActivationService } from './club-activation.service'

@Controller('admin/club-claims')
@UseGuards(PlatformAdminGuard)
export class PlatformClubActivationController {
  constructor(private readonly activation: ClubActivationService) {}

  @Get()
  listFirstClaims() {
    return this.activation.listPlatformClaims()
  }

  @Post(':claimId/decision')
  @RateLimit('write')
  reviewClaim(
    @CurrentUser() user: PlatformAdminRequestUser,
    @Param('claimId') claimId: string,
    @Body() body: unknown,
  ) {
    return this.activation.reviewPlatformClaim(
      user.id ?? user.email ?? 'platform-admin',
      claimId,
      reviewClubClaimSchema.parse(body),
    )
  }

  @Get('/disputes')
  listDisputes() {
    return this.activation.listPlatformDisputes()
  }

  @Post('/disputes')
  @RateLimit('write')
  openDispute(@CurrentUser() user: PlatformAdminRequestUser, @Body() body: unknown) {
    return this.activation.openPlatformDispute(
      user.id ?? user.email ?? 'platform-admin',
      openClubDisputeSchema.parse(body),
    )
  }

  @Post('/disputes/:disputeId/resolve')
  @RateLimit('write')
  resolveDispute(
    @CurrentUser() user: PlatformAdminRequestUser,
    @Param('disputeId') disputeId: string,
    @Body() body: unknown,
  ) {
    return this.activation.resolvePlatformDispute(
      user.id ?? user.email ?? 'platform-admin',
      disputeId,
      resolveClubDisputeSchema.parse(body),
    )
  }
}
