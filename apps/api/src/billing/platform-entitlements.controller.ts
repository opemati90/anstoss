import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { createEntitlementGrantSchema, publishPlanDefinitionSchema } from '@anstoss/shared'
import { PlatformAdminGuard } from '../admin/platform-admin.guard'
import type { PlatformAdminRequestUser } from '../admin/platform-admin.types'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { ClubEntitlementsService } from './club-entitlements.service'

@Controller('admin')
@UseGuards(PlatformAdminGuard)
export class PlatformEntitlementsController {
  constructor(private readonly entitlements: ClubEntitlementsService) {}

  @Post('plans')
  @RateLimit('write')
  publishPlan(@CurrentUser() user: PlatformAdminRequestUser, @Body() body: unknown) {
    return this.entitlements.publishPlan(
      user.id,
      publishPlanDefinitionSchema.parse(body),
      user.authMethod === 'admin-key' ? 'Admin API key (break-glass)' : user.email ?? user.name,
    )
  }

  @Get('plans')
  listPlans() {
    return this.entitlements.listPlans()
  }

  @Get('clubs/:clubId/entitlements')
  getClubEntitlements(@Param('clubId') clubId: string) {
    return this.entitlements.snapshot(clubId)
  }

  @Post('clubs/:clubId/entitlements')
  @RateLimit('write')
  grant(
    @CurrentUser() user: PlatformAdminRequestUser,
    @Param('clubId') clubId: string,
    @Body() body: unknown,
  ) {
    return this.entitlements.grant(
      clubId,
      user.id,
      createEntitlementGrantSchema.parse(body),
      user.authMethod === 'admin-key' ? 'Admin API key (break-glass)' : user.email ?? user.name,
    )
  }

  @Delete('entitlements/:grantId')
  @RateLimit('write')
  revoke(@CurrentUser() user: PlatformAdminRequestUser, @Param('grantId') grantId: string) {
    return this.entitlements.revoke(
      grantId,
      user.id,
      user.authMethod === 'admin-key' ? 'Admin API key (break-glass)' : user.email ?? user.name,
    )
  }
}
