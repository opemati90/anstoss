import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { ModerationService } from './moderation.service'

@Controller()
@UseGuards(ClerkAuthGuard, AgeGateGuard)
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  /**
   * Apple 1.2 report endpoint. Body: { reason, details? } where reason
   * is one of SPAM | ABUSE | INAPPROPRIATE | OTHER. Idempotent on
   * duplicate (same reporter, same message) so a double-tap doesn't
   * surface an error.
   */
  @Post('messages/:messageId/report')
  @RateLimit('write')
  async reportMessage(
    @CurrentUser() user: { id: string },
    @Param('messageId') messageId: string,
    @Body() body: { reason: string; details?: string },
  ) {
    return this.moderationService.reportMessage(user.id, messageId, body)
  }

  @Post('direct-messages/:messageId/report')
  @RateLimit('write')
  async reportDirectMessage(
    @CurrentUser() user: { id: string },
    @Param('messageId') messageId: string,
    @Body() body: { reason: string; details?: string },
  ) {
    return this.moderationService.reportDirectMessage(user.id, messageId, body)
  }

  /**
   * Block a user. Idempotent. Hides the blocked user's messages from
   * the caller's chat history + search and suppresses DM conversations.
   */
  @Post('users/:userId/block')
  @RateLimit('write')
  async blockUser(
    @CurrentUser() user: { id: string },
    @Param('userId') targetUserId: string,
  ) {
    return this.moderationService.blockUser(user.id, targetUserId)
  }

  @Delete('users/:userId/block')
  @RateLimit('write')
  async unblockUser(
    @CurrentUser() user: { id: string },
    @Param('userId') targetUserId: string,
  ) {
    return this.moderationService.unblockUser(user.id, targetUserId)
  }

  @Get('me/blocks')
  async listMyBlocks(@CurrentUser() user: { id: string }) {
    return this.moderationService.listMyBlocks(user.id)
  }
}
