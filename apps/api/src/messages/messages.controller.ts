import {
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common'
import { MessagesService } from './messages.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'

@Controller('clubs/:clubId/teams/:teamId/messages')
@UseGuards(ClerkAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  /**
   * Pin a message (coach+ only). Max 1 pinned per team.
   */
  @Patch(':messageId/pin')
  async pinMessage(
    @CurrentUser() user: { id: string },
    @Param('teamId') teamId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.messagesService.pinMessage(messageId, teamId, user.id)
  }

  /**
   * Unpin a message (coach+ only).
   */
  @Patch(':messageId/unpin')
  async unpinMessage(
    @CurrentUser() user: { id: string },
    @Param('teamId') teamId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.messagesService.unpinMessage(messageId, teamId, user.id)
  }

  /**
   * Get the currently pinned message for a team.
   */
  @Get('pinned')
  async getPinnedMessage(
    @CurrentUser() user: { id: string },
    @Param('teamId') teamId: string,
  ) {
    return this.messagesService.getPinnedMessage(teamId, user.id)
  }
}
