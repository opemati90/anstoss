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
import { clubSetupSchema, MembershipRole } from '@anstoss/shared'
import { z } from 'zod'

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
    const schema = z.object({
      badgeUrl: z.string().url().nullable().optional(),
    })
    const data = schema.parse(body)
    return this.clubsService.updateClub(clubId, data)
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
