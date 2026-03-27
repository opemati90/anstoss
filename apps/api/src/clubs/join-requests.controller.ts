import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { JoinRequestsService } from './join-requests.service'
import { ClubsService } from './clubs.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RequireRole, RolesGuard } from '../auth/roles.guard'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import {
  createJoinRequestSchema,
  reviewJoinRequestSchema,
  MembershipRole,
} from '@anstoss/shared'

@Controller('clubs')
export class JoinRequestsController {
  constructor(
    private readonly joinRequests: JoinRequestsService,
    private readonly clubs: ClubsService,
  ) {}

  /**
   * GET /clubs/lookup?slug=fc-example — public club lookup by slug.
   * Returns minimal public info. Rate-limited.
   */
  @Get('lookup')
  @UseGuards(ClerkAuthGuard)
  @RateLimit('read')
  async lookupBySlug(@Query('slug') slug: string) {
    if (!slug || slug.length < 2) {
      return null
    }
    const club = await this.clubs.findBySlug(slug)
    if (!club) return null
    return {
      id: club.id,
      name: club.name,
      badgeUrl: club.badgeUrl,
      primaryColor: club.primaryColor,
    }
  }

  /**
   * POST /clubs/:clubId/join-requests — submit a join request.
   */
  @Post(':clubId/join-requests')
  @UseGuards(ClerkAuthGuard, AgeGateGuard)
  @RateLimit('write')
  async createJoinRequest(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Body() body: unknown,
  ) {
    const input = createJoinRequestSchema.parse(body)
    return this.joinRequests.create(user.id, clubId, input)
  }

  /**
   * GET /clubs/:clubId/join-requests — list pending requests (COACH+).
   */
  @Get(':clubId/join-requests')
  @UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
  @RequireRole(MembershipRole.COACH)
  async listJoinRequests(@Param('clubId') clubId: string) {
    return this.joinRequests.listPending(clubId)
  }

  /**
   * POST /clubs/:clubId/join-requests/:id/approve — approve request (COACH+).
   */
  @Post(':clubId/join-requests/:id/approve')
  @UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
  @RequireRole(MembershipRole.COACH)
  @RateLimit('write')
  async approveRequest(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('id') requestId: string,
    @Body() body: unknown,
  ) {
    const input = reviewJoinRequestSchema.parse(body)
    return this.joinRequests.approve(clubId, requestId, user.id, input)
  }

  /**
   * POST /clubs/:clubId/join-requests/:id/reject — reject request (COACH+).
   */
  @Post(':clubId/join-requests/:id/reject')
  @UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
  @RequireRole(MembershipRole.COACH)
  @RateLimit('write')
  async rejectRequest(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('id') requestId: string,
    @Body() body: unknown,
  ) {
    const input = reviewJoinRequestSchema.parse(body)
    return this.joinRequests.reject(clubId, requestId, user.id, input)
  }
}
