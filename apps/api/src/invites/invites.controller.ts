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
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { RolesGuard, RequireRole } from '../auth/roles.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { createInviteCampaignSchema, createInviteSchema, MembershipRole } from '@anstoss/shared'

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
  @RequireRole(MembershipRole.ADMIN)
  @RateLimit('invite-campaign')
  async create(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @CurrentMembership() membership: { role: MembershipRole },
    @Body() body: unknown,
  ) {
    const data = createInviteSchema.parse(body)
    return this.invitesService.create(clubId, user.id, data, membership.role)
  }

  @Post('clubs/:clubId/invite-campaigns')
  @UseGuards(ClerkAuthGuard, RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  @RateLimit('invite-campaign')
  createCampaign(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    return this.invitesService.createCampaign(
      clubId,
      user.id,
      createInviteCampaignSchema.parse(body),
    )
  }

  @Get('clubs/:clubId/invite-campaigns')
  @UseGuards(ClerkAuthGuard, RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  listCampaigns(@Param('clubId') clubId: string, @CurrentUser() user: { id: string }) {
    return this.invitesService.listCampaigns(clubId, user.id)
  }

  @Post('clubs/:clubId/invite-campaigns/:campaignId/revoke')
  @UseGuards(ClerkAuthGuard, RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  revokeCampaign(
    @Param('clubId') clubId: string,
    @Param('campaignId') campaignId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.invitesService.revokeCampaign(clubId, campaignId, user.id)
  }

  @Get('invite-campaigns/:code')
  validateCampaign(@Param('code') code: string) {
    return this.invitesService.validateCampaign(code)
  }

  @Post('invite-campaigns/:code/redeem')
  @UseGuards(ClerkAuthGuard)
  @RateLimit('invite-redeem')
  redeemCampaign(@CurrentUser() user: { id: string }, @Param('code') code: string) {
    return this.invitesService.redeemCampaign(code, user.id)
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
      expiresAt: invite.expiresAt,
    }
  }

  /**
   * POST /invites/:code/redeem — join club via invite.
   */
  @Post('invites/:code/redeem')
  @UseGuards(ClerkAuthGuard)
  @RateLimit('invite-redeem')
  async redeem(
    @CurrentUser() user: { id: string },
    @Param('code') code: string,
    @Body() body: { guardianEmail?: string; childName?: string },
  ) {
    return this.invitesService.redeemAny(code, user.id, body)
  }
}
