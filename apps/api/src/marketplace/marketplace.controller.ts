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
  createFreeAgentMediaSchema,
  createTrialInviteSchema,
  freeAgentListQuerySchema,
  freeAgentProfileWriteSchema,
  presignFreeAgentMediaSchema,
  respondToTrialInviteSchema,
  updateRegistrationRoleSchema,
} from '@anstoss/shared'
import { BadRequestException } from '@nestjs/common'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RequireRole, RolesGuard } from '../auth/roles.guard'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { R2Provider } from '../assets/r2.provider'
import { MarketplaceService } from './marketplace.service'

const MEDIA_ALLOWED_CONTENT_TYPES: Record<'PHOTO' | 'VIDEO', Set<string>> = {
  PHOTO: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  VIDEO: new Set(['video/mp4', 'video/quicktime', 'video/webm']),
}

@Controller()
export class MarketplaceController {
  constructor(
    private readonly marketplaceService: MarketplaceService,
    private readonly r2: R2Provider,
  ) {}

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
  @Post('me/free-agent-profile/media/presign')
  @RateLimit('write')
  async presignFreeAgentMedia(
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = presignFreeAgentMediaSchema.parse(body)
    const allowed = MEDIA_ALLOWED_CONTENT_TYPES[data.type]
    if (!allowed.has(data.contentType)) {
      throw new BadRequestException('Unsupported content type')
    }

    const safeName = (data.filename || `m-${Date.now()}`).replace(
      /[^a-zA-Z0-9._-]/g,
      '-',
    )
    const objectKey = `users/${user.id}/free-agent/${data.type.toLowerCase()}/${Date.now()}-${safeName}`

    if (!this.r2.enabled) {
      return { enabled: false, objectKey, uploadUrl: null, publicUrl: null }
    }
    const { uploadUrl, publicUrl } = await this.r2.presignPut(
      objectKey,
      data.contentType,
    )
    return { enabled: true, objectKey, uploadUrl, publicUrl }
  }

  @UseGuards(ClerkAuthGuard)
  @Post('me/free-agent-profile/media')
  @RateLimit('write')
  async addFreeAgentMedia(
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = createFreeAgentMediaSchema.parse(body)
    return this.marketplaceService.addMedia(user.id, data)
  }

  @UseGuards(ClerkAuthGuard)
  @Delete('me/free-agent-profile/media/:mediaId')
  @RateLimit('write')
  async deleteFreeAgentMedia(
    @CurrentUser() user: { id: string },
    @Param('mediaId') mediaId: string,
  ) {
    await this.marketplaceService.deleteMedia(user.id, mediaId)
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
