import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  FreeAgentVisibility,
  MembershipRole,
  RegistrationRole,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamRole,
  TrialInviteStatus,
  type CreateFreeAgentMediaInput,
  type CreateTrialInviteInput,
  type FreeAgentListQueryInput,
  type FreeAgentListResponse,
  type FreeAgentMediaEntry,
  type FreeAgentProfile,
  type FreeAgentProfileWriteInput,
  type TrialInvite,
} from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { tenantContext } from '../prisma/tenant.context'
import { ClubEntitlementsService } from '../billing/club-entitlements.service'

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly clubEntitlements?: ClubEntitlementsService,
  ) {}

  async getMyFreeAgentProfile(userId: string): Promise<FreeAgentProfile | null> {
    const profile = await this.prisma.freeAgentProfile.findUnique({
      where: { userId },
      include: freeAgentProfileInclude,
    })

    return profile ? this.mapProfile(profile) : null
  }

  async createFreeAgentProfile(
    userId: string,
    input: FreeAgentProfileWriteInput,
  ): Promise<FreeAgentProfile> {
    await this.assertFreeAgent(userId)
    return this.saveFreeAgentProfile(userId, input, false)
  }

  async updateFreeAgentProfile(
    userId: string,
    input: FreeAgentProfileWriteInput,
  ): Promise<FreeAgentProfile> {
    await this.assertFreeAgent(userId)
    return this.saveFreeAgentProfile(userId, input, true)
  }

  async addMedia(userId: string, input: CreateFreeAgentMediaInput): Promise<FreeAgentMediaEntry> {
    await this.assertFreeAgent(userId)
    const profile = await this.prisma.freeAgentProfile.findUnique({
      where: { userId },
      select: { id: true },
    })
    if (!profile) {
      throw new NotFoundException('Free agent profile not found')
    }

    const existingCount = await this.prisma.freeAgentMedia.count({
      where: { profileId: profile.id, type: input.type },
    })
    const limit = input.type === 'PHOTO' ? 6 : 2
    if (existingCount >= limit) {
      throw new BadRequestException(
        `You can attach up to ${limit} ${input.type === 'PHOTO' ? 'photos' : 'videos'}`,
      )
    }

    const created = await this.prisma.freeAgentMedia.create({
      data: {
        profileId: profile.id,
        type: input.type,
        url: input.url,
        thumbnailUrl: input.thumbnailUrl ?? null,
        sortOrder: existingCount,
      },
    })
    return mapMedia(created)
  }

  async deleteMedia(userId: string, mediaId: string): Promise<void> {
    await this.assertFreeAgent(userId)
    const media = await this.prisma.freeAgentMedia.findUnique({
      where: { id: mediaId },
      include: { profile: { select: { userId: true } } },
    })
    if (!media || media.profile.userId !== userId) {
      throw new NotFoundException('Media not found')
    }
    await this.prisma.freeAgentMedia.delete({ where: { id: mediaId } })
  }

  async deleteFreeAgentProfile(userId: string): Promise<void> {
    await this.assertFreeAgent(userId)

    const existing = await this.prisma.freeAgentProfile.findUnique({
      where: { userId },
      select: { id: true },
    })
    if (!existing) {
      throw new NotFoundException('Free agent profile not found')
    }

    await this.prisma.$transaction(async (tx: any) => {
      await tx.freeAgentExperience.deleteMany({
        where: { profileId: existing.id },
      })
      await tx.freeAgentProfile.delete({ where: { userId } })
    })
  }

  private async assertFreeAgent(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { registrationRole: true },
    })
    if (!user) {
      throw new NotFoundException('User not found')
    }
    if (user.registrationRole !== RegistrationRole.FREE_AGENT) {
      throw new ForbiddenException(
        'Only users registered as FREE_AGENT can manage a free-agent profile',
      )
    }
  }

  async updateRegistrationRole(userId: string, registrationRole: RegistrationRole) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    if (registrationRole === RegistrationRole.CLUB_ADMIN) {
      const existingMembership = await this.prisma.membership.findFirst({
        where: { userId },
        select: { id: true },
      })
      if (existingMembership) {
        throw new ForbiddenException(
          'Cannot change registration role to CLUB_ADMIN after joining a club',
        )
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { registrationRole },
      select: {
        id: true,
        registrationRole: true,
      },
    })
  }

  async listFreeAgents(input: FreeAgentListQueryInput): Promise<FreeAgentListResponse> {
    const where = {
      isOnTransferList: true,
      visibility: FreeAgentVisibility.PUBLIC,
      ...(input.position ? { position: input.position } : {}),
      ...(input.preferredFoot ? { preferredFoot: input.preferredFoot } : {}),
      ...(input.city
        ? {
            city: {
              contains: input.city,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(input.query
        ? {
            user: {
              name: {
                contains: input.query,
                mode: 'insensitive' as const,
              },
            },
          }
        : {}),
    }

    const [items, total] = await Promise.all([
      this.prisma.freeAgentProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          _count: {
            select: {
              experience: true,
            },
          },
        },
        orderBy: orderByForSort(input.sort),
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.freeAgentProfile.count({ where }),
    ])

    return {
      items: items.map((item: any) => ({
        id: item.id,
        userId: item.userId,
        name: item.user.name,
        avatarUrl: item.user.avatarUrl,
        position: item.position,
        preferredFoot: item.preferredFoot,
        city: item.city,
        experienceCount: item._count.experience,
        visibility: item.visibility,
        createdAt: item.createdAt.toISOString(),
      })),
      page: input.page,
      pageSize: input.pageSize,
      total,
    }
  }

  async getPublicFreeAgentProfile(id: string): Promise<FreeAgentProfile> {
    const profile = await this.prisma.freeAgentProfile.findUnique({
      where: { id },
      include: freeAgentProfileInclude,
    })

    if (!profile || profile.visibility !== FreeAgentVisibility.PUBLIC) {
      throw new NotFoundException('Free agent profile not found')
    }

    return this.mapProfile(profile)
  }

  async createTrialInvite(
    clubId: string,
    senderUserId: string,
    input: CreateTrialInviteInput,
  ): Promise<TrialInvite> {
    const [profile, team] = await Promise.all([
      this.prisma.freeAgentProfile.findUnique({
        where: { id: input.freeAgentProfileId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.team.findFirst({
        where: {
          id: input.teamId,
          clubId,
        },
        include: {
          group: {
            select: {
              displayName: true,
            },
          },
        },
      }),
    ])

    if (!profile) {
      throw new NotFoundException('Free agent profile not found')
    }

    if (!team) {
      throw new NotFoundException('Team not found')
    }

    await this.expireClubTrialInvites(clubId)

    const existingPending = await this.prisma.trialInvite.findFirst({
      where: {
        clubId,
        freeAgentProfileId: input.freeAgentProfileId,
        status: TrialInviteStatus.PENDING,
      },
    })

    if (existingPending) {
      throw new BadRequestException(
        'This free agent already has a pending trial invite from this club',
      )
    }

    const invite = await this.prisma.trialInvite.create({
      data: {
        clubId,
        freeAgentProfileId: input.freeAgentProfileId,
        teamId: input.teamId,
        sentByUserId: senderUserId,
        message: input.message?.trim() || null,
        expiresAt: new Date(input.expiresAt),
      },
      include: trialInviteInclude,
    })

    void this.push
      .sendToUserLocalized(
        profile.user.id,
        'TRIAL_INVITE',
        { clubName: invite.club.name, teamName: invite.team.displayName },
        {
          trialInviteId: invite.id,
          clubId: invite.clubId,
          teamId: invite.teamId,
        },
        { clubId },
      )
      .catch(() => {})

    return this.mapTrialInvite(invite)
  }

  async listClubTrialInvites(clubId: string): Promise<TrialInvite[]> {
    await this.expireClubTrialInvites(clubId)

    const invites = await this.prisma.trialInvite.findMany({
      where: { clubId },
      include: trialInviteInclude,
      orderBy: [{ createdAt: 'desc' }],
    })

    return invites.map((invite: any) => this.mapTrialInvite(invite))
  }

  async listMyTrialInvites(userId: string): Promise<TrialInvite[]> {
    const pendingInvites = await this.prisma.trialInvite.findMany({
      where: {
        freeAgentProfile: {
          userId,
        },
        status: TrialInviteStatus.PENDING,
      },
      select: {
        clubId: true,
      },
    })

    await this.expireTrialInvitesForClubs(
      Array.from(new Set(pendingInvites.map((invite: any) => invite.clubId))),
      userId,
    )

    const invites = await this.prisma.trialInvite.findMany({
      where: {
        freeAgentProfile: {
          userId,
        },
      },
      include: trialInviteInclude,
      orderBy: [{ createdAt: 'desc' }],
    })

    return invites.map((invite: any) => this.mapTrialInvite(invite))
  }

  async respondToTrialInvite(
    inviteId: string,
    userId: string,
    status: TrialInviteStatus.ACCEPTED | TrialInviteStatus.DECLINED,
  ): Promise<TrialInvite> {
    const invite = await this.prisma.trialInvite.findUnique({
      where: { id: inviteId },
      include: trialInviteInclude,
    })

    if (!invite || invite.freeAgentProfile.userId !== userId) {
      throw new NotFoundException('Trial invite not found')
    }

    return tenantContext.run({ clubId: invite.clubId, userId }, async () => {
      if (invite.status === TrialInviteStatus.PENDING && invite.expiresAt < new Date()) {
        const expired = await this.prisma.trialInvite.update({
          where: { id: invite.id },
          data: {
            status: TrialInviteStatus.EXPIRED,
          },
          include: trialInviteInclude,
        })
        throw new BadRequestException(
          this.mapTrialInvite(expired).status === TrialInviteStatus.EXPIRED
            ? 'Trial invite expired'
            : 'Trial invite expired',
        )
      }

      if (invite.status !== TrialInviteStatus.PENDING) {
        throw new BadRequestException('Trial invite has already been handled')
      }

      const updatedInvite =
        status === TrialInviteStatus.ACCEPTED
          ? await this.acceptTrialInvite(invite, userId)
          : await this.prisma.trialInvite.update({
              where: { id: invite.id },
              data: {
                status: TrialInviteStatus.DECLINED,
                respondedAt: new Date(),
              },
              include: trialInviteInclude,
            })

      void this.push
        .sendToUserLocalized(
          invite.sentByUserId,
          'TRIAL_RESPONSE',
          {
            playerName: invite.freeAgentProfile.user.name,
            accepted: status === TrialInviteStatus.ACCEPTED,
            teamName: invite.team.displayName,
          },
          {
            trialInviteId: invite.id,
            clubId: invite.clubId,
          },
          { clubId: invite.clubId },
        )
        .catch(() => {})

      return this.mapTrialInvite(updatedInvite)
    })
  }

  /**
   * Persists a free-agent profile (create or update).
   * Precondition: callers must await `this.assertFreeAgent(userId)` first to enforce
   * the RegistrationRole.FREE_AGENT guard. Called from `createFreeAgentProfile` and
   * `updateFreeAgentProfile`, both of which enforce this.
   */
  private async saveFreeAgentProfile(
    userId: string,
    input: FreeAgentProfileWriteInput,
    requireExisting: boolean,
  ): Promise<FreeAgentProfile> {
    const existing = await this.prisma.freeAgentProfile.findUnique({
      where: { userId },
      select: {
        id: true,
      },
    })

    if (requireExisting && !existing) {
      throw new NotFoundException('Free agent profile not found')
    }

    const profile = await this.prisma.$transaction(async (tx: any) => {
      const savedProfile = existing
        ? await tx.freeAgentProfile.update({
            where: { userId },
            data: {
              position: input.position === undefined ? undefined : input.position,
              preferredFoot: input.preferredFoot === undefined ? undefined : input.preferredFoot,
              city: input.city === undefined ? undefined : normalizeNullableString(input.city),
              bio: input.bio === undefined ? undefined : normalizeNullableString(input.bio),
              isOnTransferList:
                input.isOnTransferList === undefined ? undefined : input.isOnTransferList,
              visibility: input.visibility === undefined ? undefined : input.visibility,
            },
          })
        : await tx.freeAgentProfile.create({
            data: {
              userId,
              position: input.position ?? null,
              preferredFoot: input.preferredFoot ?? null,
              city: normalizeNullableString(input.city),
              bio: normalizeNullableString(input.bio),
              isOnTransferList: input.isOnTransferList ?? false,
              visibility: input.visibility ?? FreeAgentVisibility.PRIVATE,
            },
          })

      if (input.experience !== undefined) {
        await tx.freeAgentExperience.deleteMany({
          where: {
            profileId: savedProfile.id,
          },
        })

        if (input.experience.length > 0) {
          await tx.freeAgentExperience.createMany({
            data: input.experience.map((entry, index) => ({
              profileId: savedProfile.id,
              clubName: entry.clubName.trim(),
              roleLabel: entry.roleLabel.trim(),
              fromYear: entry.fromYear ?? null,
              toYear: entry.toYear ?? null,
              sortOrder: entry.sortOrder ?? index,
            })),
          })
        }
      }

      return tx.freeAgentProfile.findUnique({
        where: { id: savedProfile.id },
        include: freeAgentProfileInclude,
      })
    })

    if (!profile) {
      throw new NotFoundException('Free agent profile not found')
    }

    return this.mapProfile(profile)
  }

  private async acceptTrialInvite(invite: any, userId: string) {
    return this.prisma.$transaction(async (tx: any) => {
      await this.requireEntitlements().assertCanActivatePlayer(invite.clubId, userId, tx)
      await tx.membership.upsert({
        where: {
          userId_clubId: {
            userId,
            clubId: invite.clubId,
          },
        },
        update: {},
        create: {
          userId,
          clubId: invite.clubId,
          role: MembershipRole.PLAYER,
        },
      })

      await tx.teamAccess.upsert({
        where: {
          teamId_userId_role: {
            teamId: invite.teamId,
            userId,
            role: TeamRole.PLAYER,
          },
        },
        update: {
          phase: TeamAccessPhase.TRIAL,
          status: TeamAccessStatus.ACTIVE,
        },
        create: {
          clubId: invite.clubId,
          teamId: invite.teamId,
          userId,
          role: TeamRole.PLAYER,
          phase: TeamAccessPhase.TRIAL,
          status: TeamAccessStatus.ACTIVE,
        },
      })

      await tx.teamMember.upsert({
        where: {
          teamId_userId: {
            teamId: invite.teamId,
            userId,
          },
        },
        update: {},
        create: {
          teamId: invite.teamId,
          userId,
        },
      })

      return tx.trialInvite.update({
        where: { id: invite.id },
        data: {
          status: TrialInviteStatus.ACCEPTED,
          respondedAt: new Date(),
        },
        include: trialInviteInclude,
      })
    })
  }

  private async expireClubTrialInvites(clubId: string) {
    await this.prisma.trialInvite.updateMany({
      where: {
        clubId,
        status: TrialInviteStatus.PENDING,
        expiresAt: {
          lt: new Date(),
        },
      },
      data: {
        status: TrialInviteStatus.EXPIRED,
      },
    })
  }

  private async expireTrialInvitesForClubs(clubIds: string[], userId: string) {
    for (const clubId of clubIds) {
      await tenantContext.run({ clubId, userId }, async () => {
        await this.expireClubTrialInvites(clubId)
      })
    }
  }

  private requireEntitlements() {
    if (!this.clubEntitlements) {
      throw new ServiceUnavailableException('Player-seat enforcement is unavailable')
    }
    return this.clubEntitlements
  }

  private mapProfile(profile: any): FreeAgentProfile {
    return {
      id: profile.id,
      userId: profile.userId,
      position: profile.position,
      preferredFoot: profile.preferredFoot,
      city: profile.city,
      bio: profile.bio,
      avatarUrl: profile.user.avatarUrl,
      isOnTransferList: profile.isOnTransferList,
      visibility: profile.visibility,
      experience: profile.experience.map((entry: any) => ({
        id: entry.id,
        clubName: entry.clubName,
        roleLabel: entry.roleLabel,
        fromYear: entry.fromYear,
        toYear: entry.toYear,
        sortOrder: entry.sortOrder,
      })),
      media: (profile.media || []).map(mapMedia),
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
      user: {
        id: profile.user.id,
        name: profile.user.name,
        avatarUrl: profile.user.avatarUrl,
      },
    }
  }

  private mapTrialInvite(invite: any): TrialInvite {
    return {
      id: invite.id,
      clubId: invite.clubId,
      freeAgentProfileId: invite.freeAgentProfileId,
      teamId: invite.teamId,
      sentByUserId: invite.sentByUserId,
      message: invite.message,
      expiresAt: invite.expiresAt.toISOString(),
      status: invite.status,
      respondedAt: invite.respondedAt ? invite.respondedAt.toISOString() : null,
      createdAt: invite.createdAt.toISOString(),
      club: {
        id: invite.club.id,
        name: invite.club.name,
        badgeUrl: invite.club.badgeUrl,
        primaryColor: invite.club.primaryColor,
      },
      team: {
        id: invite.team.id,
        displayName: invite.team.displayName,
        groupName: invite.team.group?.displayName || null,
      },
      sender: {
        id: invite.sender.id,
        name: invite.sender.name,
      },
    }
  }
}

const freeAgentProfileInclude = {
  user: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
    },
  },
  experience: {
    orderBy: [{ sortOrder: 'asc' as const }],
  },
  media: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
}

function orderByForSort(sort: string): any[] {
  switch (sort) {
    case 'city':
      return [{ city: 'asc' }, { createdAt: 'desc' }]
    case 'name':
      // Sort by display name via the user relation. createdAt tiebreaker
      // keeps results stable across pagination.
      return [{ user: { name: 'asc' } }, { createdAt: 'desc' }]
    case 'experience':
      // Most experience entries first. Prisma sorts by relation count via
      // _count on the experience join.
      return [{ experience: { _count: 'desc' } }, { createdAt: 'desc' }]
    case 'recent':
    case 'newest':
    default:
      return [{ createdAt: 'desc' }]
  }
}

function mapMedia(entry: any): FreeAgentMediaEntry {
  return {
    id: entry.id,
    type: entry.type,
    url: entry.url,
    thumbnailUrl: entry.thumbnailUrl ?? null,
    sortOrder: entry.sortOrder,
    createdAt:
      entry.createdAt instanceof Date ? entry.createdAt.toISOString() : String(entry.createdAt),
  }
}

const trialInviteInclude = {
  club: {
    select: {
      id: true,
      name: true,
      badgeUrl: true,
      primaryColor: true,
    },
  },
  team: {
    include: {
      group: {
        select: {
          displayName: true,
        },
      },
    },
  },
  sender: {
    select: {
      id: true,
      name: true,
    },
  },
  freeAgentProfile: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
}

function normalizeNullableString(value: string | null | undefined) {
  if (value === undefined) {
    return undefined
  }

  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
