import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { supportActionSchema } from '@anstoss/shared'
import { CurrentUser } from '../auth/user.decorator'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AdminService } from './admin.service'
import { AuditService } from '../audit/audit.service'
import { InternalAdminGuard } from './internal-admin.guard'

@Controller('admin')
@UseGuards(ClerkAuthGuard, InternalAdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditService: AuditService,
  ) {}

  @Get('dashboard')
  async getDashboard() {
    return this.adminService.getDashboard()
  }

  @Get('clubs')
  async listClubs() {
    return this.adminService.listClubs()
  }

  @Get('fussball/team-links')
  async listFussballTeamLinks() {
    return this.adminService.listFussballTeamLinks()
  }

  @Get('fussball/sync-runs')
  async listFussballSyncRuns() {
    return this.adminService.listFussballSyncRuns()
  }

  @Post('support-actions')
  async performSupportAction(
    @CurrentUser() user: { id: string; email: string; name: string },
    @Body() body: unknown,
  ) {
    const input = supportActionSchema.parse(body)
    return this.adminService.performSupportAction(user, input)
  }

  @Get('support-actions')
  async listSupportActions(@Query('clubId') clubId?: string) {
    return this.adminService.listSupportActions(clubId)
  }

  @Get('audit-log')
  async getAuditLog(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    return this.auditService.getPlatformFeed({
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
      type,
    })
  }
}
