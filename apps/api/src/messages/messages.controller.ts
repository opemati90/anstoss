import {
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common'
import { MessagesService } from './messages.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { RolesGuard } from '../auth/roles.guard'
import { RequireRole } from '../auth/roles.guard'
import { MembershipRole } from '@anstoss/shared'

@Controller('clubs/:clubId/teams/:teamId/messages')
@UseGuards(ClerkAuthGuard, AgeGateGuard, RolesGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  /**
   * Pin a message (coach+ only). Max 1 pinned per team.
   */
  @Patch(':messageId/pin')
  @RequireRole(MembershipRole.COACH)
  async pinMessage(
    @Param('teamId') teamId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.messagesService.pinMessage(messageId, teamId)
  }

  /**
   * Unpin a message (coach+ only).
   */
  @Patch(':messageId/unpin')
  @RequireRole(MembershipRole.COACH)
  async unpinMessage(
    @Param('teamId') teamId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.messagesService.unpinMessage(messageId, teamId)
  }

  /**
   * Get the currently pinned message for a team.
   */
  @Get('pinned')
  async getPinnedMessage(@Param('teamId') teamId: string) {
    return this.messagesService.getPinnedMessage(teamId)
  }
}
