import {
  Body,
  Controller,
  Get,
  Param,
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

  @Get(':conversationId/messages')
  async getMessages(
    @CurrentUser() user: { id: string },
    @Param('conversationId') conversationId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.dmService.getMessages(user.id, conversationId, cursor)
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
