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
  type UpdateTeamCoachAssignmentsInput,
} from '@anstoss/shared'

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTeamGroups(clubId: string, userId: string) {
    const membership = await this.getMembership(userId, clubId)
    const canManageClub = isClubManager(membership.role)

    const groups = await this.prisma.teamGroup.findMany({
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
            access: {
              where: {
                status: TeamAccessStatus.ACTIVE,
                role: {
                  in: [TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH],
                },
              },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    avatarUrl: true,
                  },
                },
              },
              orderBy: [{ createdAt: 'asc' }],
            },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
    })

    return groups.map((group) => ({
      ...group,
      teams: group.teams.map((team) => {
        const headCoach =
          team.access.find((entry) => entry.role === TeamRole.HEAD_COACH) || null
        const assistants = team.access.filter(
          (entry) => entry.role === TeamRole.ASSISTANT_COACH,
        )

        return {
          id: team.id,
          displayName: team.displayName,
          squadLabel: team.squadLabel,
          leagueName: team.leagueName,
          memberCount: team._count.access,
          coachAssignments: {
            headCoach: headCoach
              ? {
                  userId: headCoach.user.id,
                  name: headCoach.user.name,
                  avatarUrl: headCoach.user.avatarUrl,
                }
              : null,
            assistants: assistants.map((entry) => ({
              userId: entry.user.id,
              name: entry.user.name,
              avatarUrl: entry.user.avatarUrl,
            })),
          },
        }
      }),
    }))
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
    const headCoachUserId = data.headCoachUserId?.trim() || null

    await this.assertCoachAssignmentsAreValid(clubId, {
      headCoachUserId,
      assistantCoachUserIds: [],
    })

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

    if (headCoachUserId) {
      await this.syncCoachAssignments(clubId, team.id, {
        headCoachUserId,
        assistantCoachUserIds: [],
      })
    }

    return team
  }

  async updateTeamCoachAssignments(
    clubId: string,
    teamId: string,
    userId: string,
    input: UpdateTeamCoachAssignmentsInput,
  ) {
    await this.assertClubManager(clubId, userId)

    const team = await this.prisma.team.findFirst({
      where: {
        id: teamId,
        clubId,
      },
    })

    if (!team) {
      throw new NotFoundException('Team not found')
    }

    const assignments = normalizeCoachAssignments(input)
    await this.assertCoachAssignmentsAreValid(clubId, assignments)
    await this.syncCoachAssignments(clubId, teamId, assignments)

    return this.getTeamCoachAssignments(teamId)
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

  private async assertCoachAssignmentsAreValid(
    clubId: string,
    input: UpdateTeamCoachAssignmentsInput,
  ) {
    const coachUserIds = [
      ...(input.headCoachUserId ? [input.headCoachUserId] : []),
      ...input.assistantCoachUserIds,
    ]

    if (coachUserIds.length === 0) {
      return
    }

    const memberships = await this.prisma.membership.findMany({
      where: {
        clubId,
        userId: {
          in: coachUserIds,
        },
      },
      select: {
        userId: true,
        role: true,
      },
    })

    if (memberships.length !== coachUserIds.length) {
      throw new BadRequestException(
        'Assigned coaches must already be members of this club',
      )
    }

    const invalidMembership = memberships.find(
      (membership) => !isClubManager(membership.role),
    )

    if (invalidMembership) {
      throw new BadRequestException(
        'Assigned coaches must already be part of the club staff',
      )
    }
  }

  private async syncCoachAssignments(
    clubId: string,
    teamId: string,
    input: UpdateTeamCoachAssignmentsInput,
  ) {
    const assignments = normalizeCoachAssignments(input)

    if (assignments.headCoachUserId) {
      await this.prisma.teamAccess.updateMany({
        where: {
          teamId,
          role: TeamRole.HEAD_COACH,
          status: {
            in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
          },
          NOT: {
            userId: assignments.headCoachUserId,
          },
        },
        data: {
          status: TeamAccessStatus.REVOKED,
        },
      })

      await this.prisma.teamAccess.upsert({
        where: {
          teamId_userId_role: {
            teamId,
            userId: assignments.headCoachUserId,
            role: TeamRole.HEAD_COACH,
          },
        },
        update: {
          phase: TeamAccessPhase.FULL,
          status: TeamAccessStatus.ACTIVE,
        },
        create: {
          clubId,
          teamId,
          userId: assignments.headCoachUserId,
          role: TeamRole.HEAD_COACH,
          phase: TeamAccessPhase.FULL,
          status: TeamAccessStatus.ACTIVE,
        },
      })
    } else {
      await this.prisma.teamAccess.updateMany({
        where: {
          teamId,
          role: TeamRole.HEAD_COACH,
          status: {
            in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
          },
        },
        data: {
          status: TeamAccessStatus.REVOKED,
        },
      })
    }

    if (assignments.assistantCoachUserIds.length > 0) {
      await this.prisma.teamAccess.updateMany({
        where: {
          teamId,
          role: TeamRole.ASSISTANT_COACH,
          status: {
            in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
          },
          userId: {
            notIn: assignments.assistantCoachUserIds,
          },
        },
        data: {
          status: TeamAccessStatus.REVOKED,
        },
      })
    } else {
      await this.prisma.teamAccess.updateMany({
        where: {
          teamId,
          role: TeamRole.ASSISTANT_COACH,
          status: {
            in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
          },
        },
        data: {
          status: TeamAccessStatus.REVOKED,
        },
      })
    }

    if (assignments.headCoachUserId) {
      await this.prisma.teamAccess.updateMany({
        where: {
          teamId,
          role: TeamRole.ASSISTANT_COACH,
          userId: assignments.headCoachUserId,
          status: {
            in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
          },
        },
        data: {
          status: TeamAccessStatus.REVOKED,
        },
      })
    }

    for (const assistantCoachUserId of assignments.assistantCoachUserIds) {
      await this.prisma.teamAccess.upsert({
        where: {
          teamId_userId_role: {
            teamId,
            userId: assistantCoachUserId,
            role: TeamRole.ASSISTANT_COACH,
          },
        },
        update: {
          phase: TeamAccessPhase.FULL,
          status: TeamAccessStatus.ACTIVE,
        },
        create: {
          clubId,
          teamId,
          userId: assistantCoachUserId,
          role: TeamRole.ASSISTANT_COACH,
          phase: TeamAccessPhase.FULL,
          status: TeamAccessStatus.ACTIVE,
        },
      })
    }
  }

  private async getTeamCoachAssignments(teamId: string) {
    const access = await this.prisma.teamAccess.findMany({
      where: {
        teamId,
        status: TeamAccessStatus.ACTIVE,
        role: {
          in: [TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH],
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    })

    const headCoach =
      access.find((entry) => entry.role === TeamRole.HEAD_COACH) || null

    return {
      teamId,
      coachAssignments: {
        headCoach: headCoach
          ? {
              userId: headCoach.user.id,
              name: headCoach.user.name,
              avatarUrl: headCoach.user.avatarUrl,
            }
          : null,
        assistants: access
          .filter((entry) => entry.role === TeamRole.ASSISTANT_COACH)
          .map((entry) => ({
            userId: entry.user.id,
            name: entry.user.name,
            avatarUrl: entry.user.avatarUrl,
          })),
      },
    }
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

function normalizeCoachAssignments(input: UpdateTeamCoachAssignmentsInput) {
  const headCoachUserId = input.headCoachUserId?.trim() || null
  const assistantCoachUserIds = Array.from(
    new Set(
      input.assistantCoachUserIds
        .map((userId) => userId.trim())
        .filter(Boolean),
    ),
  )

  if (headCoachUserId) {
    return {
      headCoachUserId,
      assistantCoachUserIds: assistantCoachUserIds.filter(
        (userId) => userId !== headCoachUserId,
      ),
    }
  }

  return {
    headCoachUserId: null,
    assistantCoachUserIds,
  }
}
