import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import { upsertNotificationPreferenceSchema } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { NotificationsService } from './notifications.service'

@Controller()
@UseGuards(ClerkAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get('clubs/:clubId/notification-preferences')
  async getPreferences(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.notificationsService.getPreferences(user.id, clubId)
  }

  @Put('clubs/:clubId/notification-preferences')
  @RateLimit('write')
  async upsertPreference(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = upsertNotificationPreferenceSchema.parse(body)
    return this.notificationsService.upsertPreference(user.id, clubId, data)
  }
}
