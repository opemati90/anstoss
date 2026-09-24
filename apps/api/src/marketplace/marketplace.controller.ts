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
  clubTrialActionSchema,
  createFreeAgentMediaSchema,
  createPlayerSearchSchema,
  createTrialInviteSchema,
  createTrialRequestSchema,
  freeAgentListQuerySchema,
  freeAgentProfileWriteSchema,
  playerSearchListQuerySchema,
  presignFreeAgentMediaSchema,
  respondToTrialInviteSchema,
  updatePlayerSearchSchema,
  updateRegistrationRoleSchema,
} from '@anstoss/shared'
import { BadRequestException } from '@nestjs/common'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { R2Provider } from '../assets/r2.provider'
import { MarketplaceService } from './marketplace.service'
import { PlayerSearchService } from './player-search.service'
import { AllowWithoutConsent } from '../auth/age-gate.guard'

const MEDIA_ALLOWED_CONTENT_TYPES: Record<'PHOTO' | 'VIDEO', Set<string>> = {
  PHOTO: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  VIDEO: new Set(['video/mp4', 'video/quicktime', 'video/webm']),
}

@Controller()
export class MarketplaceController {
  constructor(
    private readonly marketplaceService: MarketplaceService,
    private readonly r2: R2Provider,
    private readonly playerSearches: PlayerSearchService,
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
    // H2: no photos/videos for under-18s (and no role/age bypass via presign).
    await this.marketplaceService.assertMayAddMedia(user.id)
    const allowed = MEDIA_ALLOWED_CONTENT_TYPES[data.type]
    if (!allowed.has(data.contentType)) {
      throw new BadRequestException('Unsupported content type')
    }
    const maxBytes = data.type === 'VIDEO' ? 100 * 1024 * 1024 : 10 * 1024 * 1024
    if (data.sizeBytes > maxBytes) {
      throw new BadRequestException('File exceeds the allowed size')
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
      data.sizeBytes,
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
    if (this.r2.enabled) {
      const objectKey = this.r2.objectKeyFromUrl(data.url)
      const expectedPrefix = `users/${user.id}/free-agent/${data.type.toLowerCase()}/`
      if (!objectKey || !objectKey.startsWith(expectedPrefix)) {
        throw new BadRequestException('Media does not belong to this user upload')
      }
      try {
        await this.r2.assertStoredObject(objectKey, {
          maxBytes: data.type === 'VIDEO' ? 100 * 1024 * 1024 : 10 * 1024 * 1024,
          allowedContentTypes: MEDIA_ALLOWED_CONTENT_TYPES[data.type],
        })
      } catch {
        throw new BadRequestException('Media upload is invalid or incomplete')
      }
    }
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
  @AllowWithoutConsent()
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

  @UseGuards(ClerkAuthGuard)
  @Get('free-agents')
  @RateLimit('read')
  async listFreeAgents(
    @CurrentUser() user: { id: string },
    @Query() query: Record<string, unknown>,
  ) {
    const parsed = freeAgentListQuerySchema.parse(query)
    return this.marketplaceService.listFreeAgents(parsed, user.id)
  }

  @UseGuards(ClerkAuthGuard)
  @Get('free-agents/:id')
  @RateLimit('read')
  async getFreeAgentProfile(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.marketplaceService.getPublicFreeAgentProfile(id, user.id)
  }

  // ── Probetraining (club side). Coaches of the team or club admins; the
  // service resolves the per-team scope (see trial-scope.ts).

  @UseGuards(ClerkAuthGuard)
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

  @UseGuards(ClerkAuthGuard)
  @Get('clubs/:clubId/trial-invites')
  async listClubTrialInvites(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.marketplaceService.listClubTrialInvites(clubId, user.id)
  }

  @UseGuards(ClerkAuthGuard)
  @Patch('clubs/:clubId/trial-invites/:id')
  @RateLimit('write')
  async applyClubTrialAction(
    @Param('clubId') clubId: string,
    @Param('id') inviteId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = clubTrialActionSchema.parse(body)
    return this.marketplaceService.applyClubTrialAction(clubId, inviteId, user.id, data)
  }

  // ── Gesuche

  @UseGuards(ClerkAuthGuard)
  @Get('clubs/:clubId/player-searches')
  async listClubPlayerSearches(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.playerSearches.listForClub(clubId, user.id)
  }

  @UseGuards(ClerkAuthGuard)
  @Post('clubs/:clubId/player-searches')
  @RateLimit('write')
  async createPlayerSearch(
    @Param('clubId') clubId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = createPlayerSearchSchema.parse(body)
    return this.playerSearches.create(clubId, user.id, data)
  }

  @UseGuards(ClerkAuthGuard)
  @Patch('clubs/:clubId/player-searches/:id')
  @RateLimit('write')
  async updatePlayerSearch(
    @Param('clubId') clubId: string,
    @Param('id') searchId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = updatePlayerSearchSchema.parse(body)
    return this.playerSearches.update(clubId, searchId, user.id, data)
  }

  @UseGuards(ClerkAuthGuard)
  @Get('player-searches')
  @RateLimit('read')
  async listOpenPlayerSearches(
    @CurrentUser() user: { id: string },
    @Query() query: Record<string, unknown>,
  ) {
    const parsed = playerSearchListQuerySchema.parse(query)
    return this.playerSearches.listOpen(parsed, user.id)
  }

  @UseGuards(ClerkAuthGuard)
  @Post('player-searches/:id/trial-requests')
  @RateLimit('write')
  async createTrialRequest(
    @Param('id') searchId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const data = createTrialRequestSchema.parse(body ?? {})
    return this.marketplaceService.createTrialRequest(searchId, user.id, data)
  }

  // ── Probetraining (player side)

  @UseGuards(ClerkAuthGuard)
  @Get('me/trial-invites')
  async listMyTrialInvites(@CurrentUser() user: { id: string }) {
    return this.marketplaceService.listMyTrialInvites(user.id)
  }

  @UseGuards(ClerkAuthGuard)
  @Get('trial-invites/:id')
  async getTrialInvite(@Param('id') inviteId: string, @CurrentUser() user: { id: string }) {
    return this.marketplaceService.getTrialInvite(inviteId, user.id)
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
    return this.marketplaceService.respondToTrialInvite(inviteId, user.id, data.status)
  }
}
