import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ClubsService } from './clubs.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RequireRole, RolesGuard } from '../auth/roles.guard'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { updateClubSchema, MembershipRole } from '@anstoss/shared'

@Controller('clubs')
@UseGuards(ClerkAuthGuard, AgeGateGuard)
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  /**
   * POST /clubs/setup — 3-step wizard endpoint.
   * Creates club + first team + OWNER membership in one call.
   */
  @Post('setup')
  @RateLimit('write')
  async setup(@CurrentUser() _user: { id: string }, @Body() _body: unknown) {
    throw new ForbiddenException(
      'Direct club creation is disabled. Submit a verified administrator claim.',
    )
  }

  /**
   * PATCH /clubs/:clubId — update club settings (ADMIN+).
   */
  @Patch(':clubId')
  @UseGuards(RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  @RateLimit('write')
  async updateClub(@Param('clubId') clubId: string, @Body() body: unknown) {
    const data = updateClubSchema.parse(body)
    return this.clubsService.updateClub(clubId, data)
  }

  /**
   * POST /clubs/:clubId/leave — the caller leaves the club (e.g. ended their
   * contract / moved clubs). Removes their membership, team access/roster
   * rows, and CUSTOM-channel memberships for this club. Any member may leave;
   * the last OWNER is blocked (must transfer ownership or delete the club).
   */
  @Post(':clubId/leave')
  @RateLimit('write')
  async leaveClub(@CurrentUser() user: { id: string }, @Param('clubId') clubId: string) {
    return this.clubsService.leaveClub(user.id, clubId)
  }

  /**
   * DELETE /clubs/:clubId/members/:userId — an OWNER/ADMIN removes another
   * member from the club (cascade-removes their access). Owners are protected;
   * removing yourself is blocked (use POST /clubs/:clubId/leave).
   */
  @Delete(':clubId/members/:userId')
  @UseGuards(RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  @RateLimit('write')
  async removeMember(
    @CurrentUser() actor: { id: string },
    @Param('clubId') clubId: string,
    @Param('userId') userId: string,
  ) {
    return this.clubsService.removeMemberFromClub(actor.id, clubId, userId)
  }

  /**
   * GET /clubs — list clubs for the authenticated user.
   */
  @Get()
  async listMyClubs(@CurrentUser() user: { id: string }) {
    return this.clubsService.findByUser(user.id)
  }

  /**
   * GET /clubs/:clubId — get club details.
   */
  @Get(':clubId')
  async getClub(@Param('clubId') clubId: string) {
    return this.clubsService.findById(clubId)
  }
}
