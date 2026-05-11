import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { supportActionSchema } from '@anstoss/shared'
import { CurrentUser } from '../auth/user.decorator'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AdminService } from './admin.service'
import { AuditService } from '../audit/audit.service'
import { BroadcastsService } from './broadcasts.service'
import { FeatureFlagsService } from './feature-flags.service'
import { ModerationService } from './moderation.service'
import { PlatformAdminGuard } from './platform-admin.guard'

@Controller('admin')
@UseGuards(ClerkAuthGuard, PlatformAdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditService: AuditService,
    private readonly broadcastsService: BroadcastsService,
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly moderationService: ModerationService,
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

  // ─── V2: Broadcasts ─────────────────────────────────────

  @Get('broadcasts')
  async listBroadcasts(@Query('limit') limit?: string) {
    return this.broadcastsService.listRecent(
      limit ? parseInt(limit, 10) : undefined,
    )
  }

  @Post('broadcasts')
  async createBroadcast(
    @CurrentUser() user: { id: string },
    @Body() body: { title?: string; body?: string; segment?: string },
  ) {
    return this.broadcastsService.createAndSend({
      title: body?.title ?? '',
      body: body?.body ?? '',
      segment: body?.segment ?? '',
      createdById: user.id,
    })
  }

  // ─── V2: Feature-flag overrides ─────────────────────────

  @Get('feature-flags')
  async listFeatureFlags(@Query('clubId') clubId?: string) {
    return this.featureFlagsService.list(clubId)
  }

  @Post('feature-flags')
  async upsertFeatureFlag(
    @CurrentUser() user: { id: string },
    @Body()
    body: {
      clubId?: string
      featureSlug?: string
      enabled?: boolean
      reason?: string | null
      expiresAt?: string | null
    },
  ) {
    return this.featureFlagsService.upsert({
      clubId: body?.clubId ?? '',
      featureSlug: body?.featureSlug ?? '',
      enabled: body?.enabled ?? false,
      reason: body?.reason ?? null,
      expiresAt: body?.expiresAt ? new Date(body.expiresAt) : null,
      createdById: user.id,
    })
  }

  @Delete('feature-flags/:id')
  async removeFeatureFlag(@Param('id') id: string) {
    await this.featureFlagsService.remove(id)
    return { removed: true }
  }

  // ─── V2: Moderation queue ───────────────────────────────

  @Get('moderation/reports')
  async listReports(
    @Query('resolved') resolved?: string,
    @Query('limit') limit?: string,
  ) {
    return this.moderationService.listReports({
      resolved:
        resolved === 'true' ? true : resolved === 'false' ? false : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    })
  }

  @Post('moderation/reports/:id/resolve')
  async resolveReport(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() body: { resolution?: string },
  ) {
    return this.moderationService.resolveReport(
      id,
      user.id,
      body?.resolution ?? '',
    )
  }

  @Get('moderation/blocks')
  async listBlocks(@Query('limit') limit?: string) {
    return this.moderationService.listBlocks({
      limit: limit ? parseInt(limit, 10) : undefined,
    })
  }
}
