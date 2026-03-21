import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common'
import { PushService } from './push.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'

@Controller('push')
@UseGuards(ClerkAuthGuard)
export class PushController {
  constructor(private readonly pushService: PushService) {}

  /**
   * Register an Expo push token for the authenticated user.
   */
  @Post('register')
  async registerToken(
    @Req() req: { user: { id: string } },
    @Body() body: { token: string; platform: string },
  ) {
    await this.pushService.registerToken(req.user.id, body.token, body.platform)
    return { success: true }
  }

  /**
   * Remove a push token (on logout or token refresh).
   */
  @Delete('unregister')
  async unregisterToken(@Body() body: { token: string }) {
    await this.pushService.removeToken(body.token)
    return { success: true }
  }
}
