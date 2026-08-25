/**
 * Email-OTP auth endpoints (replaces Clerk-hosted sign-in).
 *
 *   POST /auth/otp/request  { email }            → 200 { ok: true } (no enumeration)
 *   POST /auth/otp/verify   { email, code }      → 200 { token, user } | 400/401
 *   POST /auth/session/refresh (Bearer current)  → 200 { token } (re-minted)
 *
 * request/verify are unauthenticated; request is write-rate-limited (the global
 * RateLimitGuard reads @RateLimit). refresh is guarded by ClerkAuthGuard (our
 * JWT guard) so a near-expiry session can be extended.
 */
import {
  Body,
  Controller,
  HttpCode,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { OtpService } from './otp.service'
import { RateLimit } from '../../rate-limit/rate-limit.guard'
import { ClerkAuthGuard } from '../clerk.guard'
import { CurrentUser } from '../user.decorator'
import { signSessionToken } from './jwt.util'
import type { AuthenticatedUserShape } from './otp.service'

@Controller('auth')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('otp/request')
  @HttpCode(200)
  @RateLimit('write')
  async request(@Body() body: { email?: string }): Promise<{ ok: true }> {
    // Always returns ok:true — no email enumeration. Internal validation
    // errors are swallowed so the response shape is invariant.
    try {
      await this.otpService.requestCode(body?.email ?? '')
    } catch {
      // Intentionally ignored to keep the response constant.
    }
    return { ok: true }
  }

  @Post('otp/verify')
  @HttpCode(200)
  @RateLimit('write')
  async verify(
    @Body() body: { email?: string; code?: string },
  ): Promise<{ token: string; user: AuthenticatedUserShape }> {
    return this.otpService.verifyCode(body?.email ?? '', body?.code)
  }

  @Post('session/refresh')
  @HttpCode(200)
  @UseGuards(ClerkAuthGuard)
  async refresh(
    @CurrentUser() user: { id?: string; authenticatedAt?: number },
  ): Promise<{ token: string }> {
    if (!user?.id) {
      throw new UnauthorizedException('Not authenticated')
    }
    return {
      token: signSessionToken(user.id, { authenticatedAt: user.authenticatedAt }),
    }
  }
}
