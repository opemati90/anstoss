import { Body, Controller, Delete, Post, Req, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { PushRegistrationChangedException, PushService } from './push.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard, AllowWithoutConsent } from '../auth/age-gate.guard'
import { registerPushTokenSchema, unregisterPushTokenSchema } from '@anstoss/shared'

@Controller('push')
@UseGuards(ClerkAuthGuard, AgeGateGuard)
export class PushController {
  constructor(private readonly pushService: PushService) {}

  /**
   * Register an Expo push token for the authenticated user.
   */
  @AllowWithoutConsent()
  @Post('register')
  async registerToken(
    @Req() req: { user: { id: string } },
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { token, platform, registration } = registerPushTokenSchema.parse(body)
    try {
      const lease = await this.pushService.registerToken(req.user.id, token, platform, registration)
      return { success: true, registration: lease }
    } catch (error) {
      // Return only the CAS lease. The global error filter intentionally strips
      // arbitrary exception fields; unrelated errors keep using that filter.
      if (!(error instanceof PushRegistrationChangedException)) throw error
      response.status(409)
      return error.getResponse()
    }
  }

  /**
   * Remove a push token (on logout or token refresh).
   */
  @AllowWithoutConsent()
  @Delete('unregister')
  async unregisterToken(
    @Req() req: { user: { id: string } },
    @Body() body: unknown,
  ) {
    const { token, registration } = unregisterPushTokenSchema.parse(body)
    await this.pushService.removeToken(token, req.user.id, registration)
    return { success: true }
  }
}
