import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { supportActionSchema } from '@anstoss/shared'
import { CurrentUser } from '../auth/user.decorator'
import { AdminService } from './admin.service'
import { AuditService } from '../audit/audit.service'
import { AdminAuthService } from './admin-auth.service'
import { BroadcastsService } from './broadcasts.service'
import { FeatureFlagsService } from './feature-flags.service'
import { ModerationService } from './moderation.service'
import { PlatformSettingsService } from './platform-settings.service'
import { PlatformAdminGuard } from './platform-admin.guard'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { type PlatformAdminRequestUser, toPlatformAdminActor } from './platform-admin.types'

@Controller('admin')
@UseGuards(PlatformAdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminAuthService: AdminAuthService,
    private readonly auditService: AuditService,
    private readonly broadcastsService: BroadcastsService,
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly moderationService: ModerationService,
    private readonly settingsService: PlatformSettingsService,
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

  @Get('platform-admins')
  async listPlatformAdmins() {
    return this.adminAuthService.listPlatformAdmins()
  }

  @Post('platform-admins')
  @RateLimit('write')
  async createPlatformAdmin(
    @CurrentUser() user: PlatformAdminRequestUser,
    @Body() body: {
      email?: string
      name?: string
      loginIdentifier?: string
      password?: string
    },
  ) {
    return this.adminAuthService.createPlatformAdmin(toPlatformAdminActor(user), {
      email: body?.email ?? '',
      name: body?.name ?? '',
      loginIdentifier: body?.loginIdentifier ?? '',
      password: body?.password ?? '',
    })
  }

  @Get('subscriptions')
  async listSubscriptions(@Query('status') status?: string, @Query('limit') limit?: string) {
    return this.adminService.listSubscriptions({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
    })
  }

  @Get('invite-campaigns')
  listInviteCampaigns(
    @Query('suspiciousOnly') suspiciousOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listInviteCampaigns({
      suspiciousOnly: suspiciousOnly === 'true',
      limit: limit ? parseInt(limit, 10) : undefined,
    })
  }

  @Post('invite-campaigns/:campaignId/revoke')
  @RateLimit('write')
  revokeInviteCampaign(
    @CurrentUser() user: PlatformAdminRequestUser,
    @Param('campaignId') campaignId: string,
    @Body() body: { reason?: string },
  ) {
    return this.adminService.revokeInviteCampaign(
      campaignId,
      toPlatformAdminActor(user),
      body?.reason ?? '',
    )
  }

  @Get('join-requests')
  listJoinRequests(@Query('status') status?: string, @Query('limit') limit?: string) {
    return this.adminService.listJoinRequests({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
    })
  }

  @Get('contributions/health')
  contributionHealth() {
    return this.adminService.contributionHealth()
  }

  @Get('revenue')
  async revenueSummary() {
    return this.adminService.revenueSummary()
  }

  @Post('support-actions')
  async performSupportAction(@CurrentUser() user: PlatformAdminRequestUser, @Body() body: unknown) {
    const input = supportActionSchema.parse(body)
    return this.adminService.performSupportAction(toPlatformAdminActor(user), input)
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
    return this.broadcastsService.listRecent(limit ? parseInt(limit, 10) : undefined)
  }

  @Post('broadcasts')
  async createBroadcast(
    @CurrentUser() user: PlatformAdminRequestUser,
    @Body() body: { title?: string; body?: string; segment?: string },
  ) {
    if (user.authMethod !== 'session' || !user.id) {
      throw new ForbiddenException('Broadcasts require a signed-in platform admin account')
    }
    const actor = toPlatformAdminActor(user)
    return this.broadcastsService.createAndSend({
      title: body?.title ?? '',
      body: body?.body ?? '',
      segment: body?.segment ?? '',
      actor: { ...actor, id: user.id },
    })
  }

  // ─── V2: Feature-flag overrides ─────────────────────────

  @Get('feature-flags')
  async listFeatureFlags(@Query('clubId') clubId?: string) {
    return this.featureFlagsService.list(clubId)
  }

  @Post('feature-flags')
  async upsertFeatureFlag(
    @CurrentUser() user: PlatformAdminRequestUser,
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
      actor: toPlatformAdminActor(user),
    })
  }

  @Delete('feature-flags/:id')
  async removeFeatureFlag(@CurrentUser() user: PlatformAdminRequestUser, @Param('id') id: string) {
    await this.featureFlagsService.remove(id, toPlatformAdminActor(user))
    return { removed: true }
  }

  // ─── V2: Moderation queue ───────────────────────────────

  @Get('moderation/reports')
  async listReports(@Query('resolved') resolved?: string, @Query('limit') limit?: string) {
    return this.moderationService.listReports({
      resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    })
  }

  @Post('moderation/reports/:id/resolve')
  async resolveReport(
    @CurrentUser() user: PlatformAdminRequestUser,
    @Param('id') id: string,
    @Body() body: { resolution?: string; action?: 'dismiss' | 'remove' },
  ) {
    return this.moderationService.resolveReport(
      id,
      toPlatformAdminActor(user),
      body?.resolution ?? '',
      body?.action ?? 'dismiss',
    )
  }

  @Get('moderation/blocks')
  async listBlocks(@Query('limit') limit?: string) {
    return this.moderationService.listBlocks({
      limit: limit ? parseInt(limit, 10) : undefined,
    })
  }

  // ─── V3: Analytics ──────────────────────────────────────

  @Get('analytics')
  async analytics() {
    return this.adminService.analyticsSnapshot()
  }

  // ─── V3: Platform settings (release management etc.) ────

  @Get('settings')
  async listSettings() {
    return this.settingsService.listAll()
  }

  @Post('settings')
  @RateLimit('write')
  async upsertSetting(
    @CurrentUser() user: PlatformAdminRequestUser,
    @Body() body: { key?: string; value?: string; description?: string | null },
  ) {
    return this.settingsService.set({
      key: body?.key ?? '',
      value: body?.value ?? '',
      description: body?.description ?? null,
      actor: toPlatformAdminActor(user),
    })
  }
}
