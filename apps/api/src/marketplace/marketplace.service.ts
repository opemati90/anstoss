import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  FreeAgentVisibility,
  MembershipRole,
  RegistrationRole,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamRole,
  TrialInviteStatus,
  type CreateTrialInviteInput,
  type FreeAgentListQueryInput,
  type FreeAgentListResponse,
  type FreeAgentProfile,
  type FreeAgentProfileWriteInput,
  type TrialInvite,
} from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { tenantContext } from '../prisma/tenant.context'

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
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
    return this.saveFreeAgentProfile(userId, input, false)
  }

  async updateFreeAgentProfile(
    userId: string,
    input: FreeAgentProfileWriteInput,
  ): Promise<FreeAgentProfile> {
    return this.saveFreeAgentProfile(userId, input, true)
  }

  async updateRegistrationRole(userId: string, registrationRole: RegistrationRole) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })

    if (!user) {
      throw new NotFoundException('User not found')
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
        orderBy:
          input.sort === 'city'
            ? [{ city: 'asc' }, { createdAt: 'desc' }]
            : [{ createdAt: 'desc' }],
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
      .sendToUser(
        profile.user.id,
        `${invite.club.name} invited you for a trial`,
        `${invite.team.displayName} wants to see you at training.`,
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

    return tenantContext.run(
      { clubId: invite.clubId, userId },
      async () => {
        if (
          invite.status === TrialInviteStatus.PENDING &&
          invite.expiresAt < new Date()
        ) {
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
          .sendToUser(
            invite.sentByUserId,
            status === TrialInviteStatus.ACCEPTED
              ? `${invite.freeAgentProfile.user.name} accepted the trial`
              : `${invite.freeAgentProfile.user.name} declined the trial`,
            status === TrialInviteStatus.ACCEPTED
              ? `${invite.team.displayName} can now activate the trial access.`
              : `${invite.team.displayName} will need a new invite if you want to retry.`,
            {
              trialInviteId: invite.id,
              clubId: invite.clubId,
            },
            { clubId: invite.clubId },
          )
          .catch(() => {})

        return this.mapTrialInvite(updatedInvite)
      },
    )
  }

  private async saveFreeAgentProfile(
    userId: string,
    input: FreeAgentProfileWriteInput,
    requireExisting: boolean,
  ): Promise<FreeAgentProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        registrationRole: true,
      },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    if (user.registrationRole !== RegistrationRole.FREE_AGENT) {
      throw new BadRequestException(
        'Only free-agent accounts can manage a free-agent profile',
      )
    }

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
              preferredFoot:
                input.preferredFoot === undefined ? undefined : input.preferredFoot,
              city:
                input.city === undefined ? undefined : normalizeNullableString(input.city),
              bio:
                input.bio === undefined ? undefined : normalizeNullableString(input.bio),
              isOnTransferList:
                input.isOnTransferList === undefined
                  ? undefined
                  : input.isOnTransferList,
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
