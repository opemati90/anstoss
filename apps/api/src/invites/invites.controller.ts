import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { InvitesService } from './invites.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { RolesGuard, RequireRole } from '../auth/roles.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { MembershipRole } from '@anstoss/shared'

@Controller()
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  /**
   * POST /clubs/:clubId/invites — create invite (admin+ only).
   */
  @Post('clubs/:clubId/invites')
  @UseGuards(ClerkAuthGuard, RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  @RateLimit('write')
  async create(@Param('clubId') clubId: string) {
    return this.invitesService.create(clubId)
  }

  /**
   * POST /clubs/:clubId/invites/regenerate — invalidate + create new.
   */
  @Post('clubs/:clubId/invites/regenerate')
  @UseGuards(ClerkAuthGuard, RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  @RateLimit('write')
  async regenerate(@Param('clubId') clubId: string) {
    return this.invitesService.regenerate(clubId)
  }

  /**
   * GET /invites/:code — validate invite (public, for landing page).
   */
  @Get('invites/:code')
  async validate(@Param('code') code: string) {
    const invite = await this.invitesService.validate(code)
    return {
      club: invite.club,
      expiresAt: invite.expiresAt,
    }
  }

  /**
   * POST /invites/:code/redeem — join club via invite.
   */
  @Post('invites/:code/redeem')
  @UseGuards(ClerkAuthGuard)
  @RateLimit('write')
  async redeem(
    @CurrentUser() user: { id: string },
    @Param('code') code: string,
  ) {
    return this.invitesService.redeem(code, user.id)
  }
}
