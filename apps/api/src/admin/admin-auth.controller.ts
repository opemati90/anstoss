import { Body, Controller, Post } from '@nestjs/common'
import { z } from 'zod'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { AdminAuthService } from './admin-auth.service'

const adminLoginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
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
}
