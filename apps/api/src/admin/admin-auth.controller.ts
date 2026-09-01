import { Body, Controller, ForbiddenException, Get, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { CurrentUser } from '../auth/user.decorator'
import { AdminAuthService } from './admin-auth.service'
import { PlatformAdminGuard } from './platform-admin.guard'
import { type PlatformAdminRequestUser, toPlatformAdminActor } from './platform-admin.types'

const adminLoginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(12).max(256),
})

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly authService: AdminAuthService) {}

  @Post('login')
  @RateLimit('admin-login')
  login(@Body() body: unknown) {
    const input = adminLoginSchema.parse(body)
    return this.authService.login(input.username, input.password)
  }

  @Get('me')
  @UseGuards(PlatformAdminGuard)
  me(@CurrentUser() user: PlatformAdminRequestUser) {
    if (!user.id || user.authMethod !== 'session') {
      throw new ForbiddenException('Current profile requires a signed-in admin account')
    }
    return this.authService.getSessionProfile(user.id!)
  }

  @Post('password')
  @UseGuards(PlatformAdminGuard)
  @RateLimit('write')
  changePassword(@CurrentUser() user: PlatformAdminRequestUser, @Body() body: unknown) {
    const input = changePasswordSchema.parse(body)
    return this.authService.changePassword(toPlatformAdminActor(user), input)
  }
}
