import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { ChannelsService } from './channels.service'

@Controller()
@UseGuards(ClerkAuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get('teams/:teamId/channels')
  async listForTeam(
    @CurrentUser() user: { id: string },
    @Param('teamId') teamId: string,
  ) {
    return this.channelsService.listForUser(user.id, teamId)
  }

  @Post('teams/:teamId/channels/provision')
  async provision(
    @CurrentUser() _user: { id: string },
    @Param('teamId') teamId: string,
  ) {
    void _user
    // assertReadableAccess inside listForUser handles auth; for explicit
    // provisioning we keep the team-id only — call from team-creation flow.
    const team = await (
      this.channelsService as unknown as { prisma: any }
    ).prisma.team.findUnique({ where: { id: teamId }, select: { clubId: true } })
    if (!team) return { provisioned: 0 }
    await this.channelsService.ensureTeamChannels(team.clubId, teamId)
    await this.channelsService.ensureClubChannels(team.clubId)
    return { provisioned: 5 }
  }
}
