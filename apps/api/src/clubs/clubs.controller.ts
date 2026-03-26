import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ClubsService } from './clubs.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { clubSetupSchema } from '@anstoss/shared'

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
    const { club: clubData, team: teamData } = clubSetupSchema.parse(body)

    const result = await this.clubsService.createClubWithTeam(
      user.id,
      clubData,
      teamData,
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
