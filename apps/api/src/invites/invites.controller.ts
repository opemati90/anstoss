import {
  Body,
  Controller,
  createParamDecorator,
  ExecutionContext,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { InvitesService } from './invites.service'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { RolesGuard, RequireRole } from '../auth/roles.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { createInviteSchema, MembershipRole } from '@anstoss/shared'

/**
 * Extracts the caller's club membership (attached by RolesGuard) from the request.
 * Requires @UseGuards(RolesGuard) + @RequireRole(...) on the route.
 */
const CurrentMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): { role: MembershipRole } => {
    const request = ctx.switchToHttp().getRequest()
    return request.membership
  },
)

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
    @CurrentMembership() membership: { role: MembershipRole },
    @Body() body: unknown,
  ) {
    const data = createInviteSchema.parse(body)
    return this.invitesService.create(clubId, user.id, data, membership.role)
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
  @UseGuards(ClerkAuthGuard, AgeGateGuard)
  @RateLimit('write')
  async redeem(
    @CurrentUser() user: { id: string },
    @Param('code') code: string,
    @Body() body: { guardianEmail?: string; childName?: string },
  ) {
    return this.invitesService.redeem(code, user.id, body)
  }
}
