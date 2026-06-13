import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common'
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

  @Get('clubs/:clubId/channels')
  async listForClub(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
  ) {
    return this.channelsService.listClubChannelsForUser(user.id, clubId)
  }

  @Post('clubs/:clubId/channels')
  async createGroup(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Body() body: { name: string; description?: string; teamId?: string },
  ) {
    return this.channelsService.createCustomChannel(user.id, {
      clubId,
      name: body.name,
      description: body.description,
      teamId: body.teamId,
    })
  }

  @Post('clubs/:clubId/channels/:channelId/messages')
  @HttpCode(201)
  async postMessage(
    @Param('clubId') clubId: string,
    @Param('channelId') channelId: string,
    @Body() body: { content: string },
    @CurrentUser() user: { id: string },
  ): Promise<{ id: string }> {
    return this.channelsService.postMessage(clubId, channelId, body.content, user.id)
  }

  @Post('teams/:teamId/channels/provision')
  async provision(
    @CurrentUser() user: { id: string },
    @Param('teamId') teamId: string,
  ) {
    // Caller must be a club manager (OWNER/ADMIN/COACH) of the team's club.
    return this.channelsService.provisionTeamChannels(user.id, teamId)
  }
}
