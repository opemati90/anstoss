import { Injectable, NotFoundException } from '@nestjs/common'
import type { ClubPublicSummary, PublicInvitePayload } from '@anstoss/shared'
import { InvitesService } from '../invites/invites.service'
import { FussballService } from '../integrations/fussball.service'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class PublicService {
  constructor(
    private readonly invitesService: InvitesService,
    private readonly fussballService: FussballService,
    private readonly prisma: PrismaService,
  ) {}

  async getInvite(code: string): Promise<PublicInvitePayload> {
    const invite = await this.invitesService.validate(code)

    return {
      code: invite.code,
      expiresAt: invite.expiresAt.toISOString(),
      kind: invite.kind,
      role: invite.role,
      phase: invite.phase,
      status: invite.status,
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
          'https://play.google.com/store/apps/details?id=com.renuirug.anstoss',
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

  async getInviteBySlug(
    clubSlug: string,
    code: string,
  ): Promise<PublicInvitePayload> {
    const club = await this.prisma.club.findUnique({
      where: { slug: clubSlug },
      select: { id: true },
    })

    if (!club) {
      throw new NotFoundException('Club not found')
    }

    const payload = await this.getInvite(code)

    if (payload.club.id !== club.id) {
      throw new NotFoundException('Invite not found for this club')
    }

    return payload
  }

  async getClubBySlug(slug: string) {
    const club = await this.prisma.club.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        badgeUrl: true,
        primaryColor: true,
        _count: { select: { memberships: true, teams: true } },
      },
    })

    if (!club) {
      throw new NotFoundException('Club not found')
    }

    return {
      id: club.id,
      name: club.name,
      slug: club.slug,
      badgeUrl: club.badgeUrl,
      primaryColor: club.primaryColor,
      memberCount: club._count.memberships,
      teamCount: club._count.teams,
    }
  }

  async getClubSummary(clubId: string): Promise<ClubPublicSummary> {
    return this.fussballService.getClubSummary(clubId)
  }
}
