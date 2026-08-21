import {
  BadRequestException,
  Body,
  Controller,
  Get,
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

const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'video/mp4',
  'audio/m4a',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'application/pdf',
])
const MAX_BYTES = {
  voice: 25 * 1024 * 1024,
  image: 10 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  file: 25 * 1024 * 1024,
} as const

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
  async presign(
    @CurrentUser() user: { id: string },
    @Param('teamId') teamId: string,
    @Body()
    body: {
      kind: 'voice' | 'image' | 'video' | 'file'
      contentType: string
      filename?: string
      sizeBytes: number
    },
  ) {
    const access = await this.teamsService.assertReadableAccess(user.id, teamId)
    if (!Object.prototype.hasOwnProperty.call(MAX_BYTES, body.kind)) {
      throw new BadRequestException('Unsupported media kind')
    }
    if (!ALLOWED.has(body.contentType)) {
      throw new BadRequestException('Unsupported content type')
    }
    if (!Number.isInteger(body.sizeBytes) || body.sizeBytes <= 0 || body.sizeBytes > MAX_BYTES[body.kind]) {
      throw new BadRequestException('File exceeds the allowed size')
    }

    const safeName = (body.filename || `m-${Date.now()}`).replace(
      /[^a-zA-Z0-9._-]/g,
      '-',
    )
    const objectKey = `chat/${access.team.clubId}/${teamId}/${body.kind}/${Date.now()}-${user.id.slice(0, 8)}-${safeName}`

    if (!this.r2.enabled) {
      return { enabled: false, objectKey, uploadUrl: null, publicUrl: null }
    }
    const { uploadUrl, publicUrl } = await this.r2.presignPut(
      objectKey,
      body.contentType,
      body.sizeBytes,
    )
    return { enabled: true, objectKey, uploadUrl, publicUrl }
  }

  /**
   * Mint a fresh 1h signed-GET URL for a chat-media message. Used so
   * the URL stored on Message.attachmentUrl never has to be the
   * canonical read path — each render rotates a short-lived URL after
   * we re-verify the requester can still read the channel.
   *
   * Returns `{ url: null }` when (a) the message has no attachment,
   * (b) R2 isn't configured (dev), or (c) the stored URL doesn't
   * resolve to an objectKey under the configured bucket — caller
   * falls back to the stored attachmentUrl in those cases.
   */
  @Get('messages/:messageId/media-url')
  async getMessageMediaUrl(
    @CurrentUser() user: { id: string },
    @Param('messageId') messageId: string,
  ): Promise<{ url: string | null }> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        teamId: true,
        channelId: true,
        attachmentUrl: true,
        deletedAt: true,
      },
    })
    if (!message) throw new NotFoundException('Message not found')
    if (message.deletedAt) return { url: null }
    if (!message.attachmentUrl) return { url: null }

    await this.teamsService.assertReadableAccess(user.id, message.teamId)
    if (message.channelId) {
      const visible = await this.channelsService.listForUser(user.id, message.teamId)
      if (!visible.some((c) => c.id === message.channelId)) {
        return { url: null }
      }
    }

    if (!this.r2.enabled) return { url: null }
    const objectKey = this.r2.objectKeyFromUrl(message.attachmentUrl)
    if (!objectKey) return { url: null }
    const url = await this.r2.presignGet(objectKey, 3600)
    return { url }
  }
}
