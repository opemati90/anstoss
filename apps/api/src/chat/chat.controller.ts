import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { CurrentUser } from '../auth/user.decorator'
import { ChatService } from './chat.service'
import { privateMediaPublishSchema, updateChatRetentionSettingsSchema } from '@anstoss/shared'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { parseBody } from '../channels/parse-body'
import { z } from 'zod'

const postMediaSchema = privateMediaPublishSchema.extend({
  channelId: z.string().min(1).max(200),
  attachmentUrl: z.string().url().max(2048),
}).strict()

@Controller()
@UseGuards(ClerkAuthGuard, AgeGateGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('messages/:messageId/reactions')
  async addReaction(
    @CurrentUser() user: { id: string },
    @Param('messageId') messageId: string,
    @Body() body: { emoji: string },
  ) {
    return this.chatService.addReaction(user.id, messageId, body.emoji)
  }

  @Delete('messages/:messageId/reactions/:emoji')
  async removeReaction(
    @CurrentUser() user: { id: string },
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
  ) {
    return this.chatService.removeReaction(
      user.id,
      messageId,
      decodeURIComponent(emoji),
    )
  }

  @Patch('messages/:messageId')
  async editMessage(
    @CurrentUser() user: { id: string },
    @Param('messageId') messageId: string,
    @Body() body: { content: string },
  ) {
    return this.chatService.editMessage(user.id, messageId, body.content)
  }

  @Delete('messages/:messageId')
  async deleteMessage(
    @CurrentUser() user: { id: string },
    @Param('messageId') messageId: string,
  ) {
    return this.chatService.deleteMessage(user.id, messageId)
  }

  @Post('messages/:messageId/read')
  async markRead(
    @CurrentUser() user: { id: string },
    @Param('messageId') messageId: string,
  ) {
    return this.chatService.markRead(user.id, messageId)
  }

  @Post('teams/:teamId/messages/media')
  @RateLimit('channel-message')
  async postMedia(
    @CurrentUser() user: { id: string },
    @Param('teamId') teamId: string,
    @Body() body: unknown,
  ) {
    return this.chatService.postMedia(user.id, { ...parseBody(postMediaSchema, body), teamId })
  }

  @Get('clubs/:clubId/chat/retention')
  async getRetentionSettings(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
  ) {
    return this.chatService.getRetentionSettings(user.id, clubId)
  }

  @Patch('clubs/:clubId/chat/retention')
  async updateRetentionSettings(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Body() body: unknown,
  ) {
    const data = updateChatRetentionSettingsSchema.parse(body)
    return this.chatService.updateRetentionSettings(user.id, clubId, data)
  }

  @Post('teams/:teamId/messages/poll')
  async postPoll(
    @CurrentUser() user: { id: string },
    @Param('teamId') teamId: string,
    @Body() body: {
      channelId?: string
      question: string
      options: string[]
      multiSelect?: boolean
      closesAt?: string
    },
  ) {
    return this.chatService.postPoll(user.id, { teamId, ...body })
  }

  @Post('teams/:teamId/messages/rsvp-poll')
  async postRsvpPoll(
    @CurrentUser() user: { id: string },
    @Param('teamId') teamId: string,
    @Body() body: { channelId?: string; eventId: string },
  ) {
    return this.chatService.postRsvpPoll(user.id, { teamId, ...body })
  }

  @Post('teams/:teamId/messages/lineup')
  async postLineup(
    @CurrentUser() user: { id: string },
    @Param('teamId') teamId: string,
    @Body() body: {
      channelId?: string
      fixtureId?: string | null
      formation: string
      xi: string
    },
  ) {
    return this.chatService.postLineup(user.id, { teamId, ...body })
  }

  @Get('messages/:messageId/poll')
  async getPollByMessage(
    @CurrentUser() user: { id: string },
    @Param('messageId') messageId: string,
  ) {
    return this.chatService.getPollByMessage(user.id, messageId)
  }

  @Get('polls/:pollId')
  async getPoll(
    @CurrentUser() user: { id: string },
    @Param('pollId') pollId: string,
  ) {
    return this.chatService.getPoll(user.id, pollId)
  }

  @Post('polls/:pollId/vote')
  async votePoll(
    @CurrentUser() user: { id: string },
    @Param('pollId') pollId: string,
    @Body() body: { optionId: string },
  ) {
    return this.chatService.votePoll(user.id, pollId, body.optionId)
  }
}
