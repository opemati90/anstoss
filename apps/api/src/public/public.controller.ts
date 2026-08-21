import { Controller, Get, Header, Param } from '@nestjs/common'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { PublicService } from './public.service'

@Controller()
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('.well-known/apple-app-site-association')
  @Header('Content-Type', 'application/json')
  getAppleAppSiteAssociation() {
    return {
      applinks: {
        apps: [],
        details: [
          {
            appIDs: ['A3H3NSC234.com.renuirug.anstoss'],
            components: [{ '/': '/join/*', comment: 'Club invite deep links' }],
          },
        ],
      },
    }
  }

  @Get('.well-known/assetlinks.json')
  getAssetLinks() {
    const easSigningFingerprint =
      '92:FC:95:00:C7:B8:D6:55:9B:82:E4:15:53:9A:6D:D8:97:B4:74:4D:F3:89:EC:99:F5:CD:B3:40:9A:81:A1:CE'
    const fingerprints = Array.from(
      new Set([
        easSigningFingerprint,
        ...(process.env.ANDROID_CERT_FINGERPRINTS
          ? process.env.ANDROID_CERT_FINGERPRINTS.split(',').map((f) => f.trim())
          : []),
      ]),
    ).filter(Boolean)
    return [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.renuirug.anstoss',
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ]
  }

  @Get('public/platform')
  getPlatformInfo() {
    return this.publicService.getPlatformInfo()
  }

  @Get('public/invites/:code')
  @RateLimit('read')
  async getInvite(@Param('code') code: string) {
    return this.publicService.getInvite(code)
  }

  /** Slug + code based invite lookup for web landing page. */
  @Get('join/:clubSlug/:code')
  @RateLimit('read')
  async getInviteBySlug(
    @Param('clubSlug') clubSlug: string,
    @Param('code') code: string,
  ) {
    return this.publicService.getInviteBySlug(clubSlug, code)
  }

  @Get('public/clubs/:slug')
  @RateLimit('read')
  async getClubBySlug(@Param('slug') slug: string) {
    return this.publicService.getClubBySlug(slug)
  }

  @Get('clubs/:clubId/public/summary')
  @RateLimit('read')
  async getClubSummary(@Param('clubId') clubId: string) {
    return this.publicService.getClubSummary(clubId)
  }
}
