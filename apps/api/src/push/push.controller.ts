import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common'
import { PushService } from './push.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { registerPushTokenSchema, unregisterPushTokenSchema } from '@anstoss/shared'

@Controller('push')
@UseGuards(ClerkAuthGuard, AgeGateGuard)
export class PushController {
  constructor(private readonly pushService: PushService) {}

  /**
   * Register an Expo push token for the authenticated user.
   */
  @Post('register')
  async registerToken(
    @Req() req: { user: { id: string } },
    @Body() body: unknown,
  ) {
    const { token, platform } = registerPushTokenSchema.parse(body)
    await this.pushService.registerToken(req.user.id, token, platform)
    return { success: true }
  }

  /**
   * Remove a push token (on logout or token refresh).
   */
  @Delete('unregister')
  async unregisterToken(
    @Req() req: { user: { id: string } },
    @Body() body: unknown,
  ) {
    const { token } = unregisterPushTokenSchema.parse(body)
    await this.pushService.removeToken(token, req.user.id)
    return { success: true }
  }
}
