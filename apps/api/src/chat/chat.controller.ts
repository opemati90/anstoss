import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { ChatService } from './chat.service'

@Controller()
@UseGuards(ClerkAuthGuard)
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
}
