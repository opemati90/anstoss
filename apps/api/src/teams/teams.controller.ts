import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import {
  createHierarchicalTeamSchema,
  createTeamGroupSchema,
  trialDecisionSchema,
} from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { TeamsService } from './teams.service'

@Controller('clubs/:clubId')
@UseGuards(ClerkAuthGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get('team-groups')
  async listTeamGroups(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.teamsService.listTeamGroups(clubId, user.id)
  }

  @Post('team-groups')
  @RateLimit('write')
  async createTeamGroup(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = createTeamGroupSchema.parse(body)
    return this.teamsService.createTeamGroup(clubId, user.id, data)
  }

  @Post('team-groups/:groupId/teams')
  @RateLimit('write')
  async createTeam(
    @Param('clubId') clubId: string,
    @Param('groupId') groupId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = createHierarchicalTeamSchema.parse(body)
    return this.teamsService.createTeam(clubId, groupId, user.id, data)
  }

  @Post('team-access/:teamAccessId/decision')
  @RateLimit('write')
  async decideTrialAccess(
    @Param('clubId') clubId: string,
    @Param('teamAccessId') teamAccessId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = trialDecisionSchema.parse(body)
    return this.teamsService.decideTrialAccess(
      clubId,
      teamAccessId,
      user.id,
      data,
    )
  }
}
