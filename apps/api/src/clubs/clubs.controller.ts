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
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { createClubSchema, createTeamSchema } from '@anstoss/shared'

interface SetupWizardBody {
  club: { name: string; primaryColor: string; badgeUrl?: string }
  team: { name: string }
}

@Controller('clubs')
@UseGuards(ClerkAuthGuard)
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
    @Body() body: SetupWizardBody,
  ) {
    // Validate with Zod schemas from shared package
    const clubData = createClubSchema.parse(body.club)
    const teamData = createTeamSchema.parse(body.team)

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
