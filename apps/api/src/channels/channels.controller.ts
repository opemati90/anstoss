import {
  Query,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import {
  addChannelMembersSchema,
  createGroupChannelSchema,
  postChannelMessageSchema,
  updateChatMuteSchema,
} from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { parseChatMediaTab } from './chat-media'
import { CurrentUser } from '../auth/user.decorator'
import { ChannelsService } from './channels.service'
import { ChatInboxService } from './chat-inbox.service'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { parseBody } from './parse-body'

// H5: an under-16 without valid parental consent reads no inbox previews,
// channel lists or members. The AgeGateGuard is global (APP_GUARD in
// AuthModule, per club/team resolved from :clubId / :teamId / :channelId), so
// it is not repeated here; the socket gateway applies AgeGateService itself.
@Controller()
@UseGuards(ClerkAuthGuard)
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly inboxService: ChatInboxService,
  ) {}

  /**
   * GET /clubs/:clubId/inbox — one WhatsApp-style list of every channel the
   * caller can read across their teams plus their direct conversations.
   */
  @Get('clubs/:clubId/inbox')
  async inbox(@CurrentUser() user: { id: string }, @Param('clubId') clubId: string) {
    return this.inboxService.getInbox(user.id, clubId)
  }

  @Get('teams/:teamId/channels')
  async listForTeam(
    @CurrentUser() user: { id: string },
    @Param('teamId') teamId: string,
  ) {
    return this.channelsService.listForUser(user.id, teamId)
  }

  /**
   * GET /clubs/:clubId/announcements?limit=3 — the latest announcements the
   * caller can read across the club's announcement channels. Home and the
   * team-channel banner read this; the first paragraph is the title.
   */
  @Get('clubs/:clubId/announcements')
  async listAnnouncements(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number.parseInt(limit ?? '', 10)
    return this.channelsService.listAnnouncements(
      user.id,
      clubId,
      Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 20) : 3,
    )
  }

  @Get('clubs/:clubId/channels')
  async listForClub(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
  ) {
    return this.channelsService.listClubChannelsForUser(user.id, clubId)
  }

  @Post('clubs/:clubId/channels')
  @RateLimit('write')
  async createGroup(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(createGroupChannelSchema, body)
    return this.channelsService.createCustomChannel(user.id, { clubId, ...input })
  }

  @Get('clubs/:clubId/channels/:channelId')
  async detail(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('channelId') channelId: string,
  ) {
    return this.channelsService.getChannelDetail(user.id, clubId, channelId)
  }

  @Patch('clubs/:clubId/channels/:channelId')
  @RateLimit('write')
  async mute(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('channelId') channelId: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(updateChatMuteSchema, body)
    return this.channelsService.setChannelMute(user.id, clubId, channelId, input)
  }

  @Post('clubs/:clubId/channels/:channelId/read')
  @HttpCode(200)
  @RateLimit('write')
  async markRead(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('channelId') channelId: string,
  ) {
    return this.channelsService.markChannelReadForUser(user.id, clubId, channelId)
  }

  @Get('clubs/:clubId/channels/:channelId/members')
  async listChannelMembers(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('channelId') channelId: string,
  ) {
    return this.channelsService.listChannelMembers(user.id, clubId, channelId)
  }

  @Post('clubs/:clubId/channels/:channelId/members')
  @HttpCode(201)
  @RateLimit('write')
  async addChannelMembers(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('channelId') channelId: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(addChannelMembersSchema, body)
    return this.channelsService.addChannelMembers(user.id, clubId, channelId, input.userIds)
  }

  @Delete('clubs/:clubId/channels/:channelId/members/:userId')
  @RateLimit('write')
  async removeChannelMember(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('channelId') channelId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.channelsService.removeChannelMember(user.id, clubId, channelId, targetUserId)
  }

  /** Info screen media grid: ?tab=media|files|links */
  @Get('clubs/:clubId/channels/:channelId/media')
  async listChannelMedia(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('channelId') channelId: string,
    @Query('tab') tab?: string,
  ) {
    return this.channelsService.listChannelMedia(user.id, clubId, channelId, parseChatMediaTab(tab))
  }

  @Post('clubs/:clubId/channels/:channelId/messages')
  @HttpCode(201)
  @RateLimit('channel-message')
  async postMessage(
    @Param('clubId') clubId: string,
    @Param('channelId') channelId: string,
    @Body() body: unknown,
    @CurrentUser() user: { id: string },
  ): Promise<{ id: string }> {
    const input = parseBody(postChannelMessageSchema, body)
    return this.channelsService.postMessage(clubId, channelId, input.content, user.id)
  }

  @Get('teams/:teamId/channels/:channelId/members')
  async listMembers(
    @CurrentUser() user: { id: string },
    @Param('teamId') teamId: string,
    @Param('channelId') channelId: string,
  ) {
    return this.channelsService.listMembers(user.id, teamId, channelId)
  }

  // H2: the legacy POST/DELETE teams/:teamId/channels/:channelId/members
  // routes were removed. They skipped the group eligibility and safeguarding
  // rules; clients use clubs/:clubId/channels/:channelId/members.

  @Post('teams/:teamId/channels/provision')
  async provision(
    @CurrentUser() user: { id: string },
    @Param('teamId') teamId: string,
  ) {
    // Caller must be a club manager (OWNER/ADMIN/COACH) of the team's club.
    return this.channelsService.provisionTeamChannels(user.id, teamId)
  }
}
