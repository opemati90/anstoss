import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { TeamsService } from '../teams/teams.service'
import { R2Provider } from '../assets/r2.provider'

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

@Controller()
@UseGuards(ClerkAuthGuard)
export class MediaController {
  constructor(
    private readonly teamsService: TeamsService,
    private readonly r2: R2Provider,
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
    },
  ) {
    const access = await this.teamsService.assertReadableAccess(user.id, teamId)
    if (!ALLOWED.has(body.contentType)) {
      throw new BadRequestException('Unsupported content type')
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
    )
    return { enabled: true, objectKey, uploadUrl, publicUrl }
  }
}
