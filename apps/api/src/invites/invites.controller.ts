import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { InvitesService } from './invites.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { RolesGuard, RequireRole } from '../auth/roles.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { createInviteSchema, redeemInviteSchema, MembershipRole } from '@anstoss/shared'

@Controller()
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  /**
   * POST /clubs/:clubId/invites — create invite (admin+ only).
   */
  @Post('clubs/:clubId/invites')
  @UseGuards(ClerkAuthGuard, RolesGuard)
  @RequireRole(MembershipRole.COACH)
  @RateLimit('write')
  async create(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = createInviteSchema.parse(body)
    return this.invitesService.create(clubId, user.id, data)
  }

  /**
   * GET /invites/:code — validate invite (public, for landing page).
   */
  @Get('invites/:code')
  async validate(@Param('code') code: string) {
    const invite = await this.invitesService.validate(code)
    return {
      club: invite.club,
      team: invite.team,
      role: invite.role,
      phase: invite.phase,
      kind: invite.kind,
      status: invite.status,
      recipientEmail: invite.recipientEmail,
      guardianEmail: invite.guardianEmail,
      childName: invite.childName,
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
    @Body() body: { guardianEmail?: string; childName?: string },
  ) {
    return this.invitesService.redeem(code, user.id, body)
  }
}
