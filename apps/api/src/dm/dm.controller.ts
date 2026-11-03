import {
  Body,
  Controller,
  Delete,
  Get,
  ForbiddenException,
  HttpCode,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { DmService } from './dm.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import {
  presignDmMediaSchema,
  sendDirectMessageSchema,
  updateChatMuteSchema,
} from '@anstoss/shared'
import { z } from 'zod'
import { parseBody } from '../channels/parse-body'
import { parseChatMediaTab } from '../channels/chat-media'
import { requirePrivateMediaCapability } from '../media/private-media-capability'

const reactionSchema = z.object({ emoji: z.string().min(1).max(16) })

@Controller('clubs/:clubId/conversations')
@UseGuards(ClerkAuthGuard, AgeGateGuard)
export class DmController {
  constructor(private readonly dmService: DmService) {}

  @Get()
  async listConversations(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
  ) {
    return this.dmService.listConversations(user.id, clubId)
  }

  @Post()
  @RateLimit('write')
  async findOrCreateConversation(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Body() body: { participantId: string },
  ) {
    return this.dmService.findOrCreateConversation(user.id, clubId, body.participantId)
  }

  @Get(':conversationId')
  async getConversation(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.dmService.getConversationDetail(user.id, clubId, conversationId)
  }

  @Patch(':conversationId')
  @RateLimit('write')
  async muteConversation(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('conversationId') conversationId: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(updateChatMuteSchema, body)
    return this.dmService.setConversationMute(user.id, clubId, conversationId, input)
  }

  @Get(':conversationId/messages')
  async getMessages(
    @CurrentUser() user: { id: string },
    @Param('conversationId') conversationId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.dmService.getMessages(user.id, conversationId, cursor)
  }

  /** Send a DM (text, photo/video/PDF/voice upload, or lineup card). */
  @Post(':conversationId/messages')
  @HttpCode(201)
  @RateLimit('channel-message')
  async sendMessage(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('conversationId') conversationId: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(sendDirectMessageSchema, body)
    return this.dmService.sendMessage(user.id, clubId, conversationId, input)
  }

  @Post(':conversationId/media/presign')
  @RateLimit('write')
  async presignMedia(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('conversationId') conversationId: string,
    @Body() body: unknown,
    @Headers('x-anstoss-private-media') capability?: string,
  ) {
    requirePrivateMediaCapability(capability)
    const input = parseBody(presignDmMediaSchema, body)
    return this.dmService.presignMedia(user.id, clubId, conversationId, input)
  }

  @Get(':conversationId/messages/:messageId/media-url')
  async mediaUrl(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Headers('x-expected-actor-id') expectedActorId?: string,
  ) {
    if (expectedActorId && expectedActorId !== user.id) throw new ForbiddenException('Account changed')
    return this.dmService.getMediaUrl(user.id, clubId, conversationId, messageId)
  }

  @Get(':conversationId/lineup-options')
  async lineupOptions(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.dmService.listLineupOptions(user.id, clubId, conversationId)
  }

  @Get(':conversationId/media')
  async media(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('conversationId') conversationId: string,
    @Query('tab') tab?: string,
    @Headers('x-expected-actor-id') expectedActorId?: string,
  ) {
    if (expectedActorId && expectedActorId !== user.id) throw new ForbiddenException('Account changed')
    return this.dmService.listMedia(user.id, clubId, conversationId, parseChatMediaTab(tab))
  }

  @Post(':conversationId/messages/:messageId/reactions')
  @RateLimit('write')
  async addReaction(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(reactionSchema, body)
    return this.dmService.setReaction(user.id, clubId, conversationId, messageId, input.emoji, true)
  }

  @Delete(':conversationId/messages/:messageId/reactions/:emoji')
  @RateLimit('write')
  async removeReaction(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
  ) {
    return this.dmService.setReaction(
      user.id,
      clubId,
      conversationId,
      messageId,
      decodeURIComponent(emoji),
      false,
    )
  }

  @Delete(':conversationId/messages/:messageId')
  @RateLimit('write')
  async deleteMessage(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.dmService.deleteMessage(user.id, clubId, conversationId, messageId)
  }

  @Put(':conversationId/read')
  @RateLimit('write')
  async markAsRead(
    @CurrentUser() user: { id: string },
    @Param('conversationId') conversationId: string,
  ) {
    return this.dmService.markAsRead(user.id, conversationId)
  }
}

/**
 * GET /clubs/:clubId/chat/contacts — who the caller can start a chat with,
 * grouped by team, each with whether a private message is allowed.
 */
@Controller('clubs/:clubId/chat')
@UseGuards(ClerkAuthGuard, AgeGateGuard)
export class ChatContactsController {
  constructor(private readonly dmService: DmService) {}

  @Get('contacts')
  async contacts(@CurrentUser() user: { id: string }, @Param('clubId') clubId: string) {
    return this.dmService.listContacts(user.id, clubId)
  }
}
