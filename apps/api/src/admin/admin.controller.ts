import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { supportActionSchema } from '@anstoss/shared'
import { CurrentUser } from '../auth/user.decorator'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AdminService } from './admin.service'
import { InternalAdminGuard } from './internal-admin.guard'

@Controller('admin')
@UseGuards(ClerkAuthGuard, InternalAdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  async getDashboard() {
    return this.adminService.getDashboard()
  }

  @Get('clubs')
  async listClubs() {
    return this.adminService.listClubs()
  }

  @Post('support-actions')
  async performSupportAction(
    @CurrentUser() user: { id: string; email: string; name: string },
    @Body() body: unknown,
  ) {
    const input = supportActionSchema.parse(body)
    return this.adminService.performSupportAction(user, input)
  }
}
