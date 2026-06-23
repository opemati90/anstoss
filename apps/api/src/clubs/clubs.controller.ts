import {
  Body,
  Controller,
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
import { clubSetupSchema, updateClubSchema, MembershipRole } from '@anstoss/shared'

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
  async setup(
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const {
      club: clubData,
      team: teamData,
      directoryEntryId,
    } = clubSetupSchema.parse(body)

    const result = await this.clubsService.createClubWithTeam(
      user.id,
      clubData,
      teamData,
      directoryEntryId,
    )

    return {
      club: {
        id: result.club.id,
        name: result.club.name,
        primaryColor: result.club.primaryColor,
        badgeUrl: result.club.badgeUrl,
      },
      team: {
        id: result.team.id,
        name: result.team.name,
        ageGroup: result.team.ageGroup,
      },
    }
  }

  /**
   * PATCH /clubs/:clubId — update club settings (ADMIN+).
   */
  @Patch(':clubId')
  @UseGuards(RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  @RateLimit('write')
  async updateClub(
    @Param('clubId') clubId: string,
    @Body() body: unknown,
  ) {
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
  async leaveClub(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
  ) {
    return this.clubsService.leaveClub(user.id, clubId)
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
