import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common'
import { notificationInboxQuerySchema } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { InboxService } from './inbox.service'

/**
 * The signed-in user's notifications inbox (screen 09 Mitteilungen).
 * Always scoped to the caller; there is no way to read another user's inbox.
 */
@Controller('me/notifications')
@UseGuards(ClerkAuthGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  /** GET /me/notifications?cursor=&limit= — newest first, cursor-paginated. */
  @Get()
  list(@CurrentUser() user: { id: string }, @Query() query: unknown) {
    return this.inbox.list(user.id, notificationInboxQuerySchema.parse(query ?? {}))
  }

  /** GET /me/notifications/unread-count — for the bell dot. */
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: { id: string }) {
    return { unreadCount: await this.inbox.unreadCount(user.id) }
  }

  /** POST /me/notifications/read-all — "Alle gelesen". */
  @Post('read-all')
  @HttpCode(200)
  @RateLimit('write')
  markAllRead(@CurrentUser() user: { id: string }) {
    return this.inbox.markAllRead(user.id)
  }

  /** POST /me/notifications/:id/read — opening an entry marks it read. */
  @Post(':id/read')
  @HttpCode(200)
  @RateLimit('write')
  markRead(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.inbox.markRead(user.id, id)
  }
}
