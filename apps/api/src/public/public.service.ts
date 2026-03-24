import { Injectable } from '@nestjs/common'
import type { PublicInvitePayload } from '@anstoss/shared'
import { InvitesService } from '../invites/invites.service'

@Injectable()
export class PublicService {
  constructor(private readonly invitesService: InvitesService) {}

  async getInvite(code: string): Promise<PublicInvitePayload> {
    const invite = await this.invitesService.validate(code)

    return {
      code: invite.code,
      expiresAt: invite.expiresAt.toISOString(),
      kind: invite.kind,
      role: invite.role,
      phase: invite.phase,
      status: invite.status,
      recipientEmail: invite.recipientEmail,
      guardianEmail: invite.guardianEmail,
      childName: invite.childName,
      club: {
        id: invite.club.id,
        name: invite.club.name,
        slug: invite.club.slug,
        badgeUrl: invite.club.badgeUrl,
        primaryColor: invite.club.primaryColor,
      },
      team: {
        id: invite.team.id,
        displayName: invite.team.displayName,
        squadLabel: invite.team.squadLabel,
        leagueName: invite.team.leagueName,
        group: {
          id: invite.team.group.id,
          displayName: invite.team.group.displayName,
          type: invite.team.group.type,
        },
      },
      installUrls: {
        ios:
          process.env.PUBLIC_IOS_APP_URL ||
          'https://apps.apple.com/app/anstoss/id0000000000',
        android:
          process.env.PUBLIC_ANDROID_APP_URL ||
          'https://play.google.com/store/apps/details?id=app.anstoss.mobile',
      },
    }
  }

  getPlatformInfo() {
    return {
      name: 'Anstoss',
      tagline: 'White-label club operations for amateur football clubs.',
      websiteMode: 'platform-foundation',
    }
  }
}
