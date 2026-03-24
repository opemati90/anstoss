import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import {
  createHierarchicalTeamSchema,
  createTeamGroupSchema,
  trialDecisionSchema,
  updateGuardianRelationshipSchema,
  updateTeamCoachAssignmentsSchema,
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

  @Post('teams/:teamId/coaches')
  @RateLimit('write')
  async updateTeamCoachAssignments(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = updateTeamCoachAssignmentsSchema.parse(body)
    return this.teamsService.updateTeamCoachAssignments(
      clubId,
      teamId,
      user.id,
      data,
    )
  }

  @Get('teams/:teamId/family-access')
  async listTeamFamilyAccess(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.teamsService.listTeamFamilyAccess(clubId, teamId, user.id)
  }

  @Patch('teams/:teamId/family-links/:relationshipId')
  @RateLimit('write')
  async updateGuardianRelationship(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('relationshipId') relationshipId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = updateGuardianRelationshipSchema.parse(body)
    return this.teamsService.updateGuardianRelationship(
      clubId,
      teamId,
      relationshipId,
      user.id,
      data,
    )
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
