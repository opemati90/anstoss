import {
  BadRequestException,
  Body,
  ForbiddenException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { TeamsService } from '../teams/teams.service'
import { R2Provider } from '../assets/r2.provider'
import { ChannelsService } from '../channels/channels.service'
import { PrismaService } from '../prisma/prisma.service'
import { newOwnedPrivateV1Key } from './private-v1-owner'
import { reservePrivateV1Upload } from './private-v1-reservations'
import { requirePrivateMediaCapability } from './private-media-capability'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { presignDmMediaSchema } from '@anstoss/shared'
import { parseBody } from '../channels/parse-body'

import {
  ALL_CHAT_UPLOAD_CONTENT_TYPES,
  CHAT_UPLOAD_CONTENT_TYPES,
  CHAT_UPLOAD_MAX_BYTES,
  safeUploadName,
  type ChatUploadKind,
} from './chat-media-limits'

@Controller()
@UseGuards(ClerkAuthGuard)
export class MediaController {
  constructor(
    private readonly teamsService: TeamsService,
    private readonly r2: R2Provider,
    private readonly channelsService: ChannelsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Presign a chat-media upload. Any team member can upload to their team's
   * channel. Object key namespaces by team to keep tenant scoping cheap.
   *
   * Body: { kind: 'voice'|'image'|'video'|'file', contentType: string, filename?: string }
   */
  @Post('teams/:teamId/media/presign')
  @RateLimit('write')
  async presign(
    @CurrentUser() user: { id: string },
    @Param('teamId') teamId: string,
    @Body() body: unknown,
    @Headers('x-anstoss-private-media') capability?: string,
  ) {
    requirePrivateMediaCapability(capability)
    const input = parseBody(presignDmMediaSchema, body)
    const access = await this.teamsService.assertReadableAccess(user.id, teamId)
    if (!Object.prototype.hasOwnProperty.call(CHAT_UPLOAD_MAX_BYTES, input.kind)) {
      throw new BadRequestException('Unsupported media kind')
    }
    const kind = input.kind as ChatUploadKind
    if (
      !ALL_CHAT_UPLOAD_CONTENT_TYPES.has(input.contentType) ||
      !CHAT_UPLOAD_CONTENT_TYPES[kind].has(input.contentType)
    ) {
      throw new BadRequestException('Unsupported content type')
    }
    if (
      !Number.isInteger(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      input.sizeBytes > CHAT_UPLOAD_MAX_BYTES[kind]
    ) {
      throw new BadRequestException('File exceeds the allowed size')
    }

    const safeName = safeUploadName(input.filename)
    const objectKey = newOwnedPrivateV1Key({ targetType: 'chat', clubId: access.team.clubId,
      targetId: teamId, ownerId: user.id, kind }, safeName)

    if (!this.r2.enabled) {
      return { enabled: false, objectKey, uploadUrl: null, publicUrl: null }
    }
    const expiresAt = await reservePrivateV1Upload(this.prisma, user.id, objectKey, {
      targetType: 'chat', clubId: access.team.clubId, targetId: teamId, ...input,
    })
    const { uploadUrl, publicUrl } = await this.r2.presignPut(
      objectKey,
      input.contentType,
      input.sizeBytes,
      300,
      new Date(expiresAt.getTime() - 15 * 60_000),
    )
    return { enabled: true, objectKey, uploadUrl, publicUrl, uploadHeaders: { 'If-None-Match': '*' } }
  }

  /**
   * Mint a fresh signed-GET URL for a chat-media message. Private chat URLs
   * are capped at five minutes by the storage provider. Used so
   * the URL stored on Message.attachmentUrl never has to be the
   * canonical read path — each render rotates a short-lived URL after
   * we re-verify the requester can still read the channel.
   *
   * Returns `{ url: null }` when (a) the message has no attachment,
   * (b) R2 isn't configured (dev), or (c) the stored URL doesn't
   * resolve to an objectKey under the configured bucket. Clients must not
   * fall back to a persisted remote URL when authorization or signing fails.
   */
  @Get('messages/:messageId/media-url')
  async getMessageMediaUrl(
    @CurrentUser() user: { id: string },
    @Param('messageId') messageId: string,
    @Headers('x-expected-actor-id') expectedActorId?: string,
  ): Promise<{ url: string | null }> {
    if (expectedActorId && expectedActorId !== user.id) throw new ForbiddenException('Account changed')
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        clubId: true,
        teamId: true,
        channelId: true,
        attachmentUrl: true,
        deletedAt: true,
      },
    })
    if (!message) throw new NotFoundException('Message not found')
    if (message.deletedAt) return { url: null }
    if (!message.attachmentUrl) return { url: null }

    if (message.channelId) {
      const channelId = message.channelId
      return this.prisma.$transaction(async (tx) => {
        await this.channelsService.authorizePrivateUpload(user.id, message.clubId, message.teamId, channelId, 'read', tx)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`chat-message:${messageId}`}))`
        const current = await tx.message.findUnique({ where: { id: messageId }, select: {
          clubId: true, teamId: true, channelId: true, attachmentUrl: true, deletedAt: true,
        } })
        if (!current || current.clubId !== message.clubId || current.teamId !== message.teamId || current.channelId !== channelId) {
          throw new ForbiddenException('Message is no longer available')
        }
        if (current.deletedAt || !current.attachmentUrl || !this.r2.enabled) return { url: null }
        const key = this.r2.objectKeyFromUrl(current.attachmentUrl)
        if (!key || !key.startsWith(`chat/${current.clubId}/${current.teamId}/`)) return { url: null }
        return { url: await this.r2.presignGet(key, 3600) }
      })
    }

    await this.teamsService.assertReadableAccess(user.id, message.teamId)
    // Older unchannelled messages lack the channel-scoped authorization locks
    // needed to safely issue a fresh capability during revocation. Keep the
    // data intact, but do not mint a URL until a safe migration is available.
    return { url: null }
  }
}
