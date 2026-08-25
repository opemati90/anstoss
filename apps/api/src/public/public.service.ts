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
    let invite
    try {
      invite = await this.invitesService.validate(code)
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error
      const campaign = await this.invitesService.validateCampaign(code)
      invite = {
        code: campaign.code,
        expiresAt: campaign.expiresAt,
        kind: 'MEMBER_INVITE' as const,
        role: campaign.role,
        phase: 'FULL' as const,
        status: 'PENDING' as const,
        club: campaign.club,
        team: campaign.team,
      }
    }

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
          'https://apps.apple.com/app/anstoss/id6761143230',
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
        city: true,
        directoryEntry: {
          select: {
            id: true,
            source: true,
            state: true,
            association: true,
          },
        },
        _count: { select: { memberships: true, teams: true } },
      },
    })

    if (club) {
      return {
        id: club.id,
        activeClubId: club.id,
        directoryEntryId: club.directoryEntry?.id ?? null,
        name: club.name,
        slug: club.slug,
        badgeUrl: club.badgeUrl,
        primaryColor: club.primaryColor,
        city: club.city,
        state: club.directoryEntry?.state ?? null,
        association: club.directoryEntry?.association ?? null,
        source: 'ANSTOSS',
        isActive: true,
        memberCount: club._count.memberships,
        teamCount: club._count.teams,
      }
    }

    const directoryEntry = await this.prisma.clubDirectoryEntry.findUnique({
      where: { slug },
      select: {
        id: true,
        activeClubId: true,
        source: true,
        name: true,
        slug: true,
        badgeUrl: true,
        primaryColor: true,
        city: true,
        state: true,
        association: true,
        activeClub: {
          select: {
            id: true,
            name: true,
            slug: true,
            badgeUrl: true,
            primaryColor: true,
            city: true,
            directoryEntry: {
              select: {
                id: true,
                state: true,
                association: true,
              },
            },
            _count: { select: { memberships: true, teams: true } },
          },
        },
      },
    })

    if (!directoryEntry) {
      throw new NotFoundException('Club not found')
    }

    if (directoryEntry.activeClub) {
      return {
        id: directoryEntry.activeClub.id,
        activeClubId: directoryEntry.activeClub.id,
        directoryEntryId: directoryEntry.activeClub.directoryEntry?.id ?? directoryEntry.id,
        name: directoryEntry.activeClub.name,
        slug: directoryEntry.activeClub.slug,
        badgeUrl: directoryEntry.activeClub.badgeUrl,
        primaryColor: directoryEntry.activeClub.primaryColor,
        city: directoryEntry.activeClub.city,
        state: directoryEntry.activeClub.directoryEntry?.state ?? directoryEntry.state,
        association:
          directoryEntry.activeClub.directoryEntry?.association ?? directoryEntry.association,
        source: 'ANSTOSS',
        isActive: true,
        memberCount: directoryEntry.activeClub._count.memberships,
        teamCount: directoryEntry.activeClub._count.teams,
      }
    }

    return {
      id: directoryEntry.id,
      activeClubId: directoryEntry.activeClubId,
      directoryEntryId: directoryEntry.id,
      name: directoryEntry.name,
      slug: directoryEntry.slug,
      badgeUrl: directoryEntry.badgeUrl,
      primaryColor: directoryEntry.primaryColor,
      city: directoryEntry.city,
      state: directoryEntry.state,
      association: directoryEntry.association,
      source: directoryEntry.source,
      isActive: false,
      memberCount: 0,
      teamCount: 0,
    }
  }

  async getClubSummary(clubId: string): Promise<ClubPublicSummary> {
    return this.fussballService.getClubSummary(clubId)
  }
}
