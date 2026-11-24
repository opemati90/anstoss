import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common'
import { oauthLinkSchema, oauthProviderSchema, oauthSignInSchema, oauthTicketSchema } from '@anstoss/shared'
import { RateLimit } from '../../rate-limit/rate-limit.guard'
import { SocialLoginService } from './oauth.service'

@Controller('auth/oauth')
export class SocialLoginController {
  constructor(private readonly social: SocialLoginService) {}

  @Get('availability')
  @RateLimit('read')
  availability() { return this.social.availability() }

  @Post('apple/challenge')
  @HttpCode(200)
  @RateLimit('write')
  challenge() { return this.social.appleNonce() }

  @Post('link/resend')
  @HttpCode(200)
  @RateLimit('write')
  resend(@Body() body: unknown) {
    const input = oauthTicketSchema.safeParse(body)
    if (!input.success) throw new BadRequestException('Invalid sign-in request')
    return this.social.resendLink(input.data.ticket)
  }

  @Post('link')
  @HttpCode(200)
  @RateLimit('write')
  link(@Body() body: unknown) {
    const input = oauthLinkSchema.safeParse(body)
    if (!input.success) throw new BadRequestException('Invalid sign-in request')
    return this.social.link(input.data.ticket, input.data.code)
  }

  @Post(':provider')
  @HttpCode(200)
  @RateLimit('write')
  signIn(@Param('provider') provider: unknown, @Body() body: unknown) {
    const kind = oauthProviderSchema.safeParse(provider)
    const input = oauthSignInSchema.safeParse(body)
    if (!kind.success || !input.success) throw new BadRequestException('Invalid sign-in request')
    return this.social.signIn(kind.data, input.data)
  }
}
