import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  TeamAccessDeniedError,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamGroupType,
  TeamRole,
  type CreateHierarchicalTeamInput,
  type CreateTeamGroupInput,
  type TrialDecisionInput,
} from '@anstoss/shared'

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTeamGroups(clubId: string, userId: string) {
    const membership = await this.getMembership(userId, clubId)
    const canManageClub = isClubManager(membership.role)

    return this.prisma.teamGroup.findMany({
      where: {
        clubId,
        ...(canManageClub
          ? {}
          : {
              teams: {
                some: {
                  access: {
                    some: {
                      userId,
                      status: TeamAccessStatus.ACTIVE,
                    },
                  },
                },
              },
            }),
      },
      include: {
        teams: {
          where: canManageClub
            ? undefined
            : {
                access: {
                  some: {
                    userId,
                    status: TeamAccessStatus.ACTIVE,
                  },
                },
              },
          orderBy: [{ displayName: 'asc' }],
          include: {
            _count: {
              select: {
                access: {
                  where: { status: TeamAccessStatus.ACTIVE },
                },
              },
            },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
    })
  }

  async createTeamGroup(
    clubId: string,
    userId: string,
    data: CreateTeamGroupInput,
  ) {
    await this.assertClubManager(clubId, userId)

    const existingCount = await this.prisma.teamGroup.count({
      where: { clubId },
    })

    return this.prisma.teamGroup.create({
      data: {
        clubId,
        type: data.type as TeamGroupType,
        displayName: data.displayName.trim(),
        sortOrder: data.sortOrder ?? existingCount,
      },
    })
  }

  async createTeam(
    clubId: string,
    groupId: string,
    userId: string,
    data: CreateHierarchicalTeamInput,
  ) {
    await this.assertClubManager(clubId, userId)

    const group = await this.prisma.teamGroup.findFirst({
      where: { id: groupId, clubId },
    })

    if (!group) {
      throw new NotFoundException('Team group not found')
    }

    const squadLabel = data.squadLabel?.trim() || null
    const displayName = buildTeamDisplayName(
      group.displayName,
      squadLabel,
      data.name.trim(),
    )

    const team = await this.prisma.team.create({
      data: {
        clubId,
        groupId: group.id,
        name: data.name.trim(),
        displayName,
        ageGroup: group.displayName,
        squadLabel,
        leagueName: data.leagueName?.trim() || null,
        seasonStart: data.seasonStart ? new Date(data.seasonStart) : null,
      },
      include: {
        group: true,
      },
    })

    const headCoachUserId = data.headCoachUserId?.trim()
    if (headCoachUserId) {
      const existingMembership = await this.prisma.membership.findUnique({
        where: {
          userId_clubId: {
            userId: headCoachUserId,
            clubId,
          },
        },
      })

      if (!existingMembership) {
        throw new BadRequestException(
          'Assigned head coach must already be a club member',
        )
      }

      await this.prisma.teamAccess.upsert({
        where: {
          teamId_userId_role: {
            teamId: team.id,
            userId: headCoachUserId,
            role: TeamRole.HEAD_COACH,
          },
        },
        update: {
          phase: TeamAccessPhase.FULL,
          status: TeamAccessStatus.ACTIVE,
        },
        create: {
          clubId,
          teamId: team.id,
          userId: headCoachUserId,
          role: TeamRole.HEAD_COACH,
          phase: TeamAccessPhase.FULL,
          status: TeamAccessStatus.ACTIVE,
        },
      })
    }

    return team
  }

  async decideTrialAccess(
    clubId: string,
    teamAccessId: string,
    userId: string,
    input: TrialDecisionInput,
  ) {
    const teamAccess = await this.prisma.teamAccess.findFirst({
      where: {
        id: teamAccessId,
        clubId,
      },
      include: {
        team: true,
      },
    })

    if (!teamAccess) {
      throw new NotFoundException('Trial access not found')
    }

    await this.assertManageAccess(userId, teamAccess.teamId)

    if (teamAccess.phase !== TeamAccessPhase.TRIAL) {
      throw new BadRequestException('Only trial access can be decided')
    }

    if (input.decision === 'ACCEPT') {
      return this.prisma.teamAccess.update({
        where: { id: teamAccess.id },
        data: {
          phase: TeamAccessPhase.FULL,
          status: TeamAccessStatus.ACTIVE,
        },
      })
    }

    return this.prisma.teamAccess.update({
      where: { id: teamAccess.id },
      data: {
        status: TeamAccessStatus.REJECTED,
      },
    })
  }

  async assertReadableAccess(userId: string, teamId: string) {
    const access = await this.getTeamContext(userId, teamId)

    if (access.membership && isClubManager(access.membership.role)) {
      return access
    }

    if (access.activeTeamAccess.length > 0) {
      return access
    }

    throw new TeamAccessDeniedError('You do not have access to this team.')
  }

  async assertManageAccess(userId: string, teamId: string) {
    const access = await this.getTeamContext(userId, teamId)

    if (access.membership && isClubManager(access.membership.role)) {
      return access
    }

    const manageableTeamAccess = access.activeTeamAccess.find((entry) =>
      isCoachRole(entry.role),
    )

    if (manageableTeamAccess) {
      return access
    }

    throw new TeamAccessDeniedError('You do not manage this team.')
  }

  private async assertClubManager(clubId: string, userId: string) {
    const membership = await this.getMembership(userId, clubId)

    if (!isClubManager(membership.role)) {
      throw new TeamAccessDeniedError('You do not manage this club.')
    }

    return membership
  }

  private async getMembership(userId: string, clubId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_clubId: { userId, clubId },
      },
    })

    if (!membership) {
      throw new TeamAccessDeniedError('You are not a member of this club.')
    }

    return membership
  }

  private async getTeamContext(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        group: true,
      },
    })

    if (!team) {
      throw new NotFoundException('Team not found')
    }

    const [membership, teamAccess] = await Promise.all([
      this.prisma.membership.findUnique({
        where: {
          userId_clubId: {
            userId,
            clubId: team.clubId,
          },
        },
      }),
      this.prisma.teamAccess.findMany({
        where: {
          teamId,
          userId,
          status: TeamAccessStatus.ACTIVE,
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
    ])

    return {
      team,
      membership,
      activeTeamAccess: teamAccess,
    }
  }
}

function isClubManager(role: string) {
  return role === 'OWNER' || role === 'ADMIN' || role === 'COACH'
}

function isCoachRole(role: string) {
  return role === 'HEAD_COACH' || role === 'ASSISTANT_COACH'
}

function buildTeamDisplayName(
  groupDisplayName: string,
  squadLabel: string | null,
  fallbackName: string,
) {
  if (squadLabel) {
    return `${groupDisplayName} ${squadLabel}`.trim()
  }

  return fallbackName.trim()
}
