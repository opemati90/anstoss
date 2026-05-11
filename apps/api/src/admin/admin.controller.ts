import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { supportActionSchema } from '@anstoss/shared'
import { CurrentUser } from '../auth/user.decorator'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AdminService } from './admin.service'
import { AuditService } from '../audit/audit.service'
import { PlatformAdminGuard } from './platform-admin.guard'

@Controller('admin')
@UseGuards(ClerkAuthGuard, PlatformAdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditService: AuditService,
  ) {}

  @Get('dashboard')
  async getDashboard() {
    return this.adminService.getDashboard()
  }

  @Get('health')
  async getHealth() {
    return this.adminService.healthSnapshot()
  }

  @Get('clubs')
  async listClubs(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.listClubs({
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    })
  }

  @Get('clubs/:clubId')
  async getClub(@Param('clubId') clubId: string) {
    return this.adminService.getClub(clubId)
  }

  @Get('users')
  async listUsers(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.listUsers({
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    })
  }

  @Get('subscriptions')
  async listSubscriptions(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listSubscriptions({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
    })
  }

  @Get('revenue')
  async revenueSummary() {
    return this.adminService.revenueSummary()
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
