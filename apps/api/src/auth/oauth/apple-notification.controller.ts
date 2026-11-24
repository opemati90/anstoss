import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common'
import { z } from 'zod'
import { RateLimit } from '../../rate-limit/rate-limit.guard'
import { AppleNotificationService } from './apple-notification.service'

const notificationSchema = z.object({ payload: z.string().min(1).max(16_384) }).strict()

@Controller('auth/oauth/apple')
export class AppleNotificationController {
  constructor(private readonly notifications: AppleNotificationService) {}

  @Post('notifications')
  @HttpCode(200)
  @RateLimit('write')
  receive(@Body() body: unknown) {
    const input = notificationSchema.safeParse(body)
    if (!input.success) throw new BadRequestException('Invalid notification')
    return this.notifications.receive(input.data.payload)
  }
}
