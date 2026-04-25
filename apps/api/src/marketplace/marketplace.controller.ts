import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  MembershipRole,
  createTrialInviteSchema,
  freeAgentListQuerySchema,
  freeAgentProfileWriteSchema,
  respondToTrialInviteSchema,
  updateRegistrationRoleSchema,
} from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RequireRole, RolesGuard } from '../auth/roles.guard'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { MarketplaceService } from './marketplace.service'

@Controller()
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @UseGuards(ClerkAuthGuard)
  @Get('me/free-agent-profile')
  async getMyFreeAgentProfile(@CurrentUser() user: { id: string }) {
    return this.marketplaceService.getMyFreeAgentProfile(user.id)
  }

  @UseGuards(ClerkAuthGuard)
  @Post('me/free-agent-profile')
  @RateLimit('write')
  async createFreeAgentProfile(
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = freeAgentProfileWriteSchema.parse(body)
    return this.marketplaceService.createFreeAgentProfile(user.id, data)
  }

  @UseGuards(ClerkAuthGuard)
  @Patch('me/free-agent-profile')
  @RateLimit('write')
  async updateFreeAgentProfile(
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = freeAgentProfileWriteSchema.parse(body)
    return this.marketplaceService.updateFreeAgentProfile(user.id, data)
  }

  @UseGuards(ClerkAuthGuard)
  @Delete('me/free-agent-profile')
  @RateLimit('write')
  async deleteMyFreeAgentProfile(@CurrentUser() user: { id: string }) {
    await this.marketplaceService.deleteFreeAgentProfile(user.id)
    return { success: true }
  }

  @UseGuards(ClerkAuthGuard)
  @Patch('me/registration-role')
  @RateLimit('write')
  async updateRegistrationRole(
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = updateRegistrationRoleSchema.parse(body)
    return this.marketplaceService.updateRegistrationRole(
      user.id,
      data.registrationRole,
    )
  }

  @Get('free-agents')
  @RateLimit('read')
  async listFreeAgents(@Query() query: Record<string, unknown>) {
    const parsed = freeAgentListQuerySchema.parse(query)
    return this.marketplaceService.listFreeAgents(parsed)
  }

  @Get('free-agents/:id')
  @RateLimit('read')
  async getFreeAgentProfile(@Param('id') id: string) {
    return this.marketplaceService.getPublicFreeAgentProfile(id)
  }

  @UseGuards(ClerkAuthGuard, RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  @Post('clubs/:clubId/trial-invites')
  @RateLimit('write')
  async createTrialInvite(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = createTrialInviteSchema.parse(body)
    return this.marketplaceService.createTrialInvite(clubId, user.id, data)
  }

  @UseGuards(ClerkAuthGuard, RolesGuard)
  @RequireRole(MembershipRole.ADMIN)
  @Get('clubs/:clubId/trial-invites')
  async listClubTrialInvites(@Param('clubId') clubId: string) {
    return this.marketplaceService.listClubTrialInvites(clubId)
  }

  @UseGuards(ClerkAuthGuard)
  @Get('me/trial-invites')
  async listMyTrialInvites(@CurrentUser() user: { id: string }) {
    return this.marketplaceService.listMyTrialInvites(user.id)
  }

  @UseGuards(ClerkAuthGuard)
  @Patch('trial-invites/:id')
  @RateLimit('write')
  async respondToTrialInvite(
    @Param('id') inviteId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = respondToTrialInviteSchema.parse(body)
    return this.marketplaceService.respondToTrialInvite(
      inviteId,
      user.id,
      data.status,
    )
  }
}
