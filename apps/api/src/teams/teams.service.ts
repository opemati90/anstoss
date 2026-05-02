import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { generateJoinCode } from './team-join-code.util'
import {
  ClubCapability,
  ClubOperationalRole,
  ParentalConsentStatus,
  JoinCodeExhaustionError,
  TeamAccessDeniedError,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamGroupType,
  TeamRole,
  rsvpStatusSchema,
  type CreateInjuryReportInput,
  type CreateHierarchicalTeamInput,
  type CreatePlayerLoanInput,
  type CreateTeamGroupInput,
  type RotateTeamDutyInput,
  type RosterOpsSnapshot,
  type TeamFamilyAccessSnapshot,
  type TrialDecisionInput,
  type UpdateTeamCoachAssignmentsInput,
  type UpdateInjuryReportInput,
  type UpdateTeamDutyInput,
  type UpdateTeamMemberInput,
  type UpdateGuardianRelationshipInput,
  type ClubAggregateStats,
} from '@anstoss/shared'
import { buildClubPermissionMap } from '@anstoss/shared'

const RsvpStatus = rsvpStatusSchema.enum
const MAX_JOIN_CODE_RETRIES = 5

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

    return groups.map((group: typeof groups[number]) => ({
      ...group,
      teams: group.teams.map((team: typeof group.teams[number]) => {
        const headCoach =
          team.access.find((entry: typeof team.access[number]) => entry.role === TeamRole.HEAD_COACH) || null
        const assistants = team.access.filter(
          (entry: typeof team.access[number]) => entry.role === TeamRole.ASSISTANT_COACH,
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
            assistants: assistants.map((entry: typeof assistants[number]) => ({
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

  async listTeamFamilyAccess(
    clubId: string,
    teamId: string,
    userId: string,
  ): Promise<TeamFamilyAccessSnapshot> {
    const access = await this.assertManageAccess(userId, teamId)

    const [playerAccess, relationships, pendingConsents] = await Promise.all([
      this.prisma.teamAccess.findMany({
        where: {
          clubId,
          teamId,
          role: TeamRole.PLAYER,
          status: {
            in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
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
        orderBy: [{ user: { name: 'asc' } }],
      }),
      this.prisma.guardianRelationship.findMany({
        where: {
          clubId,
          OR: [
            { teamId },
            {
              player: {
                teamAccess: {
                  some: {
                    teamId,
                    role: TeamRole.PLAYER,
                    status: {
                      in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
                    },
                  },
                },
              },
            },
          ],
        },
        include: {
          parent: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
              teamAccess: {
                where: {
                  teamId,
                  role: TeamRole.PARENT,
                  status: {
                    in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
                  },
                },
                select: {
                  id: true,
                  phase: true,
                  status: true,
                },
                take: 1,
              },
            },
          },
          player: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.parentalConsent.findMany({
        where: {
          clubId,
          teamId,
          status: {
            in: [ParentalConsentStatus.REQUIRED, ParentalConsentStatus.PENDING],
          },
        },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          guardian: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: [{ requestedAt: 'desc' }],
      }),
    ])

    return {
      team: {
        id: access.team.id,
        displayName: access.team.displayName,
        group: {
          id: access.team.group.id,
          displayName: access.team.group.displayName,
        },
      },
      players: playerAccess.map((entry: any) => ({
        id: entry.user.id,
        name: entry.user.name,
        avatarUrl: entry.user.avatarUrl,
      })),
      relationships: relationships.map((relationship: any) => ({
        id: relationship.id,
        teamId: relationship.teamId,
        childName: relationship.childName,
        createdAt: relationship.createdAt.toISOString(),
        updatedAt: relationship.updatedAt.toISOString(),
        parent: {
          id: relationship.parent.id,
          name: relationship.parent.name,
          email: relationship.parent.email,
          avatarUrl: relationship.parent.avatarUrl,
        },
        player: relationship.player
          ? {
              id: relationship.player.id,
              name: relationship.player.name,
              avatarUrl: relationship.player.avatarUrl,
            }
          : null,
        parentAccess: relationship.parent.teamAccess[0]
          ? {
              id: relationship.parent.teamAccess[0].id,
              phase: relationship.parent.teamAccess[0].phase as TeamAccessPhase,
              status: relationship.parent.teamAccess[0].status as TeamAccessStatus,
            }
          : null,
      })),
      pendingConsents: pendingConsents.map((consent: any) => ({
        id: consent.id,
        guardianEmail: consent.guardianEmail,
        status: consent.status as ParentalConsentStatus,
        requestedAt: consent.requestedAt.toISOString(),
        approvedAt: consent.approvedAt?.toISOString() || null,
        player: {
          id: consent.player.id,
          name: consent.player.name,
          avatarUrl: consent.player.avatarUrl,
        },
        guardianUser: consent.guardian
          ? {
              id: consent.guardian.id,
              name: consent.guardian.name,
              email: consent.guardian.email,
              avatarUrl: consent.guardian.avatarUrl,
            }
          : null,
      })),
    }
  }

  async updateGuardianRelationship(
    clubId: string,
    teamId: string,
    relationshipId: string,
    userId: string,
    input: UpdateGuardianRelationshipInput,
  ) {
    await this.assertManageAccess(userId, teamId)

    const relationship = await this.prisma.guardianRelationship.findFirst({
      where: {
        id: relationshipId,
        clubId,
        OR: [
          { teamId },
          {
            player: {
              teamAccess: {
                some: {
                  teamId,
                  role: TeamRole.PLAYER,
                  status: {
                    in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
                  },
                },
              },
            },
          },
        ],
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!relationship) {
      throw new NotFoundException('Family link not found')
    }

    let nextPlayerUserId =
      input.playerUserId === undefined
        ? relationship.playerUserId
        : input.playerUserId
    let nextChildName =
      input.childName === undefined ? relationship.childName : input.childName

    if (input.playerUserId) {
      const playerAccess = await this.prisma.teamAccess.findFirst({
        where: {
          clubId,
          teamId,
          userId: input.playerUserId,
          role: TeamRole.PLAYER,
          status: {
            in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
          },
        },
        include: {
          user: {
            select: {
              name: true,
            },
          },
        },
      })

      if (!playerAccess) {
        throw new BadRequestException(
          'Linked child must already have player access in this squad',
        )
      }

      nextPlayerUserId = playerAccess.userId

      if (!nextChildName) {
        nextChildName = playerAccess.user.name
      }
    }

    if (!nextPlayerUserId && !nextChildName) {
      throw new BadRequestException(
        'Family link must keep a child assignment or child name',
      )
    }

    const updated = await this.prisma.guardianRelationship.update({
      where: { id: relationship.id },
      data: {
        teamId,
        playerUserId: nextPlayerUserId,
        childName: nextChildName,
      },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            teamAccess: {
              where: {
                teamId,
                role: TeamRole.PARENT,
                status: {
                  in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
                },
              },
              select: {
                id: true,
                phase: true,
                status: true,
              },
              take: 1,
            },
          },
        },
        player: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    })

    return {
      id: updated.id,
      teamId: updated.teamId,
      childName: updated.childName,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      parent: {
        id: updated.parent.id,
        name: updated.parent.name,
        email: updated.parent.email,
        avatarUrl: updated.parent.avatarUrl,
      },
      player: updated.player
        ? {
            id: updated.player.id,
            name: updated.player.name,
            avatarUrl: updated.player.avatarUrl,
          }
        : null,
      parentAccess: updated.parent.teamAccess[0]
        ? {
            id: updated.parent.teamAccess[0].id,
            phase: updated.parent.teamAccess[0].phase as TeamAccessPhase,
            status: updated.parent.teamAccess[0].status as TeamAccessStatus,
          }
        : null,
    }
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

    const manageableTeamAccess = access.activeTeamAccess.find((entry: any) =>
      isCoachRole(entry.role),
    )

    if (manageableTeamAccess) {
      return access
    }

    throw new TeamAccessDeniedError('You do not manage this team.')
  }

  async assertEventManagementAccess(userId: string, teamId: string) {
    const access = await this.getTeamContext(userId, teamId)

    if (access.membership) {
      const permissions = buildClubPermissionMap({
        membershipRole: access.membership.role as any,
        operationalRoles: access.membership.operationalRoles as ClubOperationalRole[],
      })

      if (permissions[ClubCapability.EVENTS]) {
        return access
      }
    }

    const manageableTeamAccess = access.activeTeamAccess.find((entry: any) =>
      isCoachRole(entry.role),
    )

    if (manageableTeamAccess) {
      return access
    }

    throw new TeamAccessDeniedError('You do not manage events for this team.')
  }

  // ── ANS-38: Player Loans ─────────────────────────────────────

  async createPlayerLoan(
    clubId: string,
    sourceTeamId: string,
    userId: string,
    input: CreatePlayerLoanInput,
  ) {
    // Actor must be coach+ on source team
    await this.assertManageAccess(userId, sourceTeamId)

    // Both teams must be in the same club
    const targetTeam = await this.prisma.team.findUnique({
      where: { id: input.targetTeamId },
    })
    if (!targetTeam || targetTeam.clubId !== clubId) {
      throw new BadRequestException('Target team must be in the same club.')
    }
    if (input.targetTeamId === sourceTeamId) {
      throw new BadRequestException('Cannot loan a player to the same team.')
    }

    // Player must have ACTIVE access on source team
    const sourceAccess = await this.prisma.teamAccess.findFirst({
      where: {
        teamId: sourceTeamId,
        userId: input.playerUserId,
        role: TeamRole.PLAYER,
        status: TeamAccessStatus.ACTIVE,
      },
    })
    if (!sourceAccess) {
      throw new BadRequestException(
        'Player must have active access on the source team.',
      )
    }

    // Check if player already has active access on target team
    const existingAccess = await this.prisma.teamAccess.findFirst({
      where: {
        teamId: input.targetTeamId,
        userId: input.playerUserId,
        role: TeamRole.PLAYER,
        status: { in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING] },
      },
    })
    if (existingAccess) {
      throw new BadRequestException(
        'Player already has access to the target team.',
      )
    }

    return this.prisma.teamAccess.create({
      data: {
        clubId,
        teamId: input.targetTeamId,
        userId: input.playerUserId,
        role: TeamRole.PLAYER,
        phase: TeamAccessPhase.FULL,
        status: TeamAccessStatus.ACTIVE,
        loanedFromTeamId: sourceTeamId,
        loanStartDate: new Date(),
        loanEndDate: input.loanEndDate ? new Date(input.loanEndDate) : null,
      },
      include: { team: true },
    })
  }

  async recallPlayerLoan(
    clubId: string,
    sourceTeamId: string,
    teamAccessId: string,
    userId: string,
  ) {
    await this.assertManageAccess(userId, sourceTeamId)

    const loanAccess = await this.prisma.teamAccess.findUnique({
      where: { id: teamAccessId },
    })
    if (
      !loanAccess ||
      loanAccess.clubId !== clubId ||
      loanAccess.loanedFromTeamId !== sourceTeamId
    ) {
      throw new NotFoundException('Loan record not found.')
    }
    if (loanAccess.status === TeamAccessStatus.REVOKED) {
      throw new BadRequestException('Loan already recalled.')
    }

    return this.prisma.teamAccess.update({
      where: { id: teamAccessId },
      data: { status: TeamAccessStatus.REVOKED },
    })
  }

  async getTeamByCode(rawCode: string) {
    const code = rawCode.trim().toUpperCase()
    const team = await this.prisma.team.findUnique({
      where: { joinCode: code },
      include: { club: { select: { id: true, name: true, badgeUrl: true, primaryColor: true } } },
    })
    if (!team) throw new NotFoundException('Team not found for this code')
    return { team: { id: team.id, name: team.name, displayName: team.displayName, clubId: team.clubId }, club: team.club }
  }

  async regenerateJoinCode(clubId: string, teamId: string, userId: string) {
    const membership = await this.getMembership(userId, clubId)
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
      throw new TeamAccessDeniedError('You do not have access to regenerate the join code.')
    }
    for (let attempt = 0; attempt < MAX_JOIN_CODE_RETRIES; attempt++) {
      const code = generateJoinCode()
      try {
        return await this.prisma.team.update({
          where: { id: teamId, clubId },
          data: { joinCode: code },
          select: { id: true, joinCode: true },
        })
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          Array.isArray(err.meta?.target) &&
          (err.meta.target as string[]).includes('joinCode')
        ) {
          continue
        }
        throw err
      }
    }
    throw new JoinCodeExhaustionError()
  }

  // ── ANS-39: Enhanced Roster ──────────────────────────────────

  async updateRosterEntry(
    clubId: string,
    teamId: string,
    targetUserId: string,
    userId: string,
    input: UpdateTeamMemberInput,
  ) {
    await this.assertManageAccess(userId, teamId)

    return this.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId: targetUserId } },
      update: {
        ...(input.position !== undefined && { position: input.position }),
        ...(input.jerseyNumber !== undefined && {
          jerseyNumber: input.jerseyNumber,
        }),
        ...(input.operationalStatus !== undefined &&
          input.operationalStatus !== null && {
            operationalStatus: input.operationalStatus,
          }),
      },
      create: {
        teamId,
        userId: targetUserId,
        position: input.position ?? null,
        jerseyNumber: input.jerseyNumber ?? null,
        operationalStatus:
          input.operationalStatus ?? 'ACTIVE',
      },
    })
  }

  async getRosterOperations(
    clubId: string,
    teamId: string,
    userId: string,
  ): Promise<RosterOpsSnapshot> {
    await this.assertReadableAccess(userId, teamId)

    const team = await this.prisma.team.findFirst({
      where: { id: teamId, clubId },
      select: {
        id: true,
        name: true,
        displayName: true,
        squadTarget: true,
      },
    })

    if (!team) {
      throw new NotFoundException('Team not found')
    }

    const accessEntries = await this.prisma.teamAccess.findMany({
      where: {
        clubId,
        teamId,
        status: {
          in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
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
        loanedFromTeam: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    })

    const teamMemberRecords = await this.prisma.teamMember.findMany({
      where: {
        teamId,
        userId: {
          in: accessEntries.map((entry: any) => entry.userId),
        },
      },
    })

    const teamMemberByUserId = new Map(
      teamMemberRecords.map((member: any) => [member.userId, member]),
    )

    const rosterEntries = accessEntries
      .map((entry: any) => {
        const member = teamMemberByUserId.get(entry.userId)
        return {
          id: entry.id,
          userId: entry.userId,
          name: entry.user.name,
          avatarUrl: entry.user.avatarUrl,
          role: entry.role,
          phase: entry.phase,
          status: entry.status,
          position: member?.position ?? null,
          jerseyNumber: member?.jerseyNumber ?? null,
          operationalStatus:
            member?.operationalStatus ?? 'ACTIVE',
          createdAt: entry.createdAt.toISOString(),
          loanedFromTeamId: entry.loanedFromTeamId,
          loanedFromTeamName: entry.loanedFromTeam
            ? entry.loanedFromTeam.displayName || entry.loanedFromTeam.name
            : null,
        }
      })
      .sort(compareRosterEntries)

    const [injuryReports, dutyAssignments] = await Promise.all([
      this.prisma.injuryReport.findMany({
        where: {
          clubId,
          teamId,
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
        orderBy: [{ updatedAt: 'desc' }],
      }),
      this.prisma.teamDutyAssignment.findMany({
        where: {
          clubId,
          teamId,
        },
        include: {
          assignedUser: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }],
      }),
    ])

    return {
      team: {
        id: team.id,
        displayName: team.displayName || team.name,
        squadTarget: team.squadTarget,
      },
      squad: rosterEntries.filter(
        (entry) =>
          entry.phase === TeamAccessPhase.FULL &&
          entry.status === TeamAccessStatus.ACTIVE &&
          entry.operationalStatus === 'ACTIVE',
      ),
      operations: {
        trials: rosterEntries.filter(
          (entry) =>
            entry.phase === TeamAccessPhase.TRIAL &&
            entry.status !== TeamAccessStatus.REJECTED &&
            entry.status !== TeamAccessStatus.REVOKED,
        ),
        newPlayers: rosterEntries.filter(
          (entry) =>
            entry.phase === TeamAccessPhase.FULL &&
            entry.status === TeamAccessStatus.ACTIVE &&
            entry.operationalStatus === 'NEW_PLAYER',
        ),
        inactive: rosterEntries.filter(
          (entry) =>
            entry.status === TeamAccessStatus.ACTIVE &&
            entry.operationalStatus === 'INACTIVE',
        ),
      },
      medic: {
        active: injuryReports
          .filter((report: any) => !report.clearedAt)
          .map(serializeInjuryReport),
        recentlyCleared: injuryReports
          .filter((report: any) => Boolean(report.clearedAt))
          .slice(0, 6)
          .map(serializeInjuryReport),
      },
      kit: {
        pending: dutyAssignments
          .filter((assignment: any) => assignment.status === 'PENDING')
          .map(serializeDutyAssignment),
        recent: dutyAssignments
          .filter((assignment: any) => assignment.status !== 'PENDING')
          .slice(0, 6)
          .map(serializeDutyAssignment),
      },
    }
  }

  async createInjuryReport(
    clubId: string,
    teamId: string,
    actorUserId: string,
    input: CreateInjuryReportInput,
  ) {
    await this.assertManageAccess(actorUserId, teamId)
    await this.assertRosterMemberExists(clubId, teamId, input.userId)

    const report = await this.prisma.injuryReport.create({
      data: {
        clubId,
        teamId,
        userId: input.userId,
        reportedById: actorUserId,
        title: input.title.trim(),
        notes: input.notes?.trim() || null,
        status: input.status,
        expectedReturnAt: input.expectedReturnAt
          ? new Date(input.expectedReturnAt)
          : null,
        expectedReturnLabel: input.expectedReturnLabel?.trim() || null,
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
    })

    return serializeInjuryReport(report)
  }

  async updateInjuryReport(
    clubId: string,
    teamId: string,
    injuryId: string,
    actorUserId: string,
    input: UpdateInjuryReportInput,
  ) {
    await this.assertManageAccess(actorUserId, teamId)

    const existing = await this.prisma.injuryReport.findFirst({
      where: {
        id: injuryId,
        clubId,
        teamId,
      },
    })

    if (!existing) {
      throw new NotFoundException('Injury report not found')
    }

    const report = await this.prisma.injuryReport.update({
      where: { id: injuryId },
      data: {
        ...(input.title !== undefined && { title: input.title.trim() }),
        ...(input.notes !== undefined && { notes: input.notes?.trim() || null }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.expectedReturnAt !== undefined && {
          expectedReturnAt: input.expectedReturnAt
            ? new Date(input.expectedReturnAt)
            : null,
        }),
        ...(input.expectedReturnLabel !== undefined && {
          expectedReturnLabel: input.expectedReturnLabel?.trim() || null,
        }),
        ...(input.cleared !== undefined && {
          clearedAt: input.cleared ? new Date() : null,
        }),
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
    })

    return serializeInjuryReport(report)
  }

  async rotateTeamDuty(
    clubId: string,
    teamId: string,
    actorUserId: string,
    input: RotateTeamDutyInput,
  ) {
    await this.assertManageAccess(actorUserId, teamId)

    const eligibleEntries = await this.prisma.teamAccess.findMany({
      where: {
        clubId,
        teamId,
        role: TeamRole.PLAYER,
        phase: TeamAccessPhase.FULL,
        status: TeamAccessStatus.ACTIVE,
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
      orderBy: [{ user: { name: 'asc' } }],
    })

    const eligibilityMembers = await this.prisma.teamMember.findMany({
      where: {
        teamId,
        userId: {
          in: eligibleEntries.map((entry: any) => entry.userId),
        },
        operationalStatus: {
          not: 'INACTIVE',
        },
      },
    })

    const eligibilityByUserId = new Map(
      eligibilityMembers.map((member: any) => [member.userId, member]),
    )
    const eligibleRoster = eligibleEntries.filter((entry: any) => {
      const member = eligibilityByUserId.get(entry.userId)
      return (
        !member ||
        member.operationalStatus !== 'INACTIVE'
      )
    })

    if (eligibleRoster.length === 0) {
      throw new BadRequestException(
        'No eligible active players are available for kit rotation.',
      )
    }

    const lastAssignment = await this.prisma.teamDutyAssignment.findFirst({
      where: {
        clubId,
        teamId,
        kind: input.kind,
      },
      orderBy: [{ createdAt: 'desc' }],
    })

    const lastIndex = eligibleRoster.findIndex(
      (entry: any) => entry.userId === lastAssignment?.assignedUserId,
    )
    const nextAssignee =
      eligibleRoster[(lastIndex + 1 + eligibleRoster.length) % eligibleRoster.length]

    const assignment = await this.prisma.teamDutyAssignment.create({
      data: {
        clubId,
        teamId,
        assignedUserId: nextAssignee.userId,
        createdById: actorUserId,
        kind: input.kind,
        status: 'PENDING',
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        notes: input.notes?.trim() || null,
      },
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    })

    return serializeDutyAssignment(assignment)
  }

  async updateTeamDuty(
    clubId: string,
    teamId: string,
    dutyId: string,
    actorUserId: string,
    input: UpdateTeamDutyInput,
  ) {
    await this.assertManageAccess(actorUserId, teamId)

    const existing = await this.prisma.teamDutyAssignment.findFirst({
      where: {
        id: dutyId,
        clubId,
        teamId,
      },
    })

    if (!existing) {
      throw new NotFoundException('Team duty assignment not found')
    }

    const assignment = await this.prisma.teamDutyAssignment.update({
      where: { id: dutyId },
      data: {
        status: input.status,
        ...(input.notes !== undefined && {
          notes: input.notes?.trim() || null,
        }),
        completedAt:
          input.status === 'COMPLETED' ? new Date() : null,
      },
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    })

    return serializeDutyAssignment(assignment)
  }

  async getAggregateRoster(clubId: string, userId: string) {
    await this.assertClubManager(clubId, userId)

    const teams = await this.prisma.team.findMany({
      where: { clubId },
      include: {
        group: true,
        access: {
          where: { status: TeamAccessStatus.ACTIVE },
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
        members: true,
      },
      orderBy: [{ group: { sortOrder: 'asc' } }, { displayName: 'asc' }],
    })

    const teamNameById = new Map(
      teams.map((t: any) => [t.id, t.displayName || t.name]),
    )

    return teams.reduce((acc: any, team: any) => {
      acc[team.id] = {
        teamName: team.name,
        teamDisplayName: team.displayName,
        groupName: team.group?.displayName ?? null,
        members: team.access.map((access: any) => {
          const memberData = team.members.find((m: any) => m.userId === access.userId)
          return {
            userId: access.userId,
            name: access.user.name,
            email: access.user.email,
            avatarUrl: access.user.avatarUrl,
            role: access.role,
            phase: access.phase,
            status: access.status,
            position: memberData?.position ?? null,
            jerseyNumber: memberData?.jerseyNumber ?? null,
            loanedFromTeamId: access.loanedFromTeamId,
            loanedFromTeamName: access.loanedFromTeamId
              ? teamNameById.get(access.loanedFromTeamId) ?? null
              : null,
          }
        }),
      }
      return acc
    }, {})
  }

  // ── ANS-41: Club Stats ───────────────────────────────────────

  async getClubStats(clubId: string, userId: string): Promise<ClubAggregateStats> {
    await this.assertClubManager(clubId, userId)

    const now = new Date()

    const [memberCount, teams, upcomingEvents, rsvps] = await Promise.all([
      this.prisma.membership.count({ where: { clubId } }),
      this.prisma.team.findMany({
        where: { clubId },
        select: {
          id: true,
          name: true,
          displayName: true,
          _count: { select: { access: { where: { status: TeamAccessStatus.ACTIVE } } } },
          events: {
            where: { date: { gte: now }, cancelledAt: null },
            select: { id: true },
          },
        },
      }),
      this.prisma.event.count({
        where: { clubId, date: { gte: now }, cancelledAt: null },
      }),
      this.prisma.rsvp.findMany({
        where: {
          event: { clubId, date: { gte: now }, cancelledAt: null },
        },
        select: { status: true, event: { select: { teamId: true } } },
      }),
    ])

    const totalRsvps = rsvps.length
    const yesRsvps = rsvps.filter((r: any) => r.status === RsvpStatus.YES).length
    const overallRsvpRate = totalRsvps > 0 ? yesRsvps / totalRsvps : 0

    const perTeamRsvp = rsvps.reduce((acc: any, rsvp: any) => {
      const teamId = rsvp.event.teamId
      const stats = acc[teamId] ?? { total: 0, yes: 0 }
      stats.total += 1
      if (rsvp.status === RsvpStatus.YES) stats.yes += 1
      acc[teamId] = stats
      return acc
    }, {})

    return {
      memberCount,
      teamCount: teams.length,
      upcomingEventCount: upcomingEvents,
      overallRsvpRate: Math.round(overallRsvpRate * 100),
      teams: teams.map((team: any) => {
        const stats = perTeamRsvp[team.id] ?? { total: 0, yes: 0 }
        return {
          teamId: team.id,
          teamName: team.name,
          teamDisplayName: team.displayName,
          memberCount: team._count.access,
          upcomingEventCount: team.events.length,
          rsvpRate: stats.total > 0 ? Math.round((stats.yes / stats.total) * 100) : 0,
        }
      }),
    }
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
      (membership: any) => !isClubManager(membership.role),
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
      access.find((entry: any) => entry.role === TeamRole.HEAD_COACH) || null

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
          .filter((entry: any) => entry.role === TeamRole.ASSISTANT_COACH)
          .map((entry: any) => ({
            userId: entry.user.id,
            name: entry.user.name,
            avatarUrl: entry.user.avatarUrl,
          })),
      },
    }
  }

  private async assertRosterMemberExists(
    clubId: string,
    teamId: string,
    targetUserId: string,
  ) {
    const teamAccess = await this.prisma.teamAccess.findFirst({
      where: {
        clubId,
        teamId,
        userId: targetUserId,
        status: {
          in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
        },
      },
    })

    if (!teamAccess) {
      throw new BadRequestException('Roster member was not found in this team.')
    }

    return teamAccess
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

function compareRosterEntries(
  left: {
    role: string
    phase: string
    name: string
  },
  right: {
    role: string
    phase: string
    name: string
  },
) {
  const roleDelta =
    getRosterRoleSortOrder(left.role) - getRosterRoleSortOrder(right.role)

  if (roleDelta !== 0) {
    return roleDelta
  }

  const phaseDelta =
    getRosterPhaseSortOrder(left.phase) - getRosterPhaseSortOrder(right.phase)

  if (phaseDelta !== 0) {
    return phaseDelta
  }

  return left.name.localeCompare(right.name, 'de')
}

function getRosterRoleSortOrder(role: string) {
  switch (role) {
    case TeamRole.HEAD_COACH:
      return 0
    case TeamRole.ASSISTANT_COACH:
      return 1
    case TeamRole.PLAYER:
      return 2
    case TeamRole.PARENT:
      return 3
    default:
      return 99
  }
}

function getRosterPhaseSortOrder(phase: string) {
  return phase === TeamAccessPhase.FULL ? 0 : 1
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

function serializeInjuryReport(report: any) {
  return {
    id: report.id,
    clubId: report.clubId,
    teamId: report.teamId,
    userId: report.userId,
    reportedById: report.reportedById,
    title: report.title,
    notes: report.notes ?? null,
    status: report.status,
    expectedReturnAt: report.expectedReturnAt
      ? report.expectedReturnAt.toISOString()
      : null,
    expectedReturnLabel: report.expectedReturnLabel ?? null,
    clearedAt: report.clearedAt ? report.clearedAt.toISOString() : null,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    user: report.user
      ? {
          id: report.user.id,
          name: report.user.name,
          avatarUrl: report.user.avatarUrl,
        }
      : undefined,
  }
}

function serializeDutyAssignment(assignment: any) {
  return {
    id: assignment.id,
    clubId: assignment.clubId,
    teamId: assignment.teamId,
    assignedUserId: assignment.assignedUserId,
    createdById: assignment.createdById,
    kind: assignment.kind,
    status: assignment.status,
    dueDate: assignment.dueDate ? assignment.dueDate.toISOString() : null,
    notes: assignment.notes ?? null,
    completedAt: assignment.completedAt
      ? assignment.completedAt.toISOString()
      : null,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
    assignedUser: assignment.assignedUser
      ? {
          id: assignment.assignedUser.id,
          name: assignment.assignedUser.name,
          avatarUrl: assignment.assignedUser.avatarUrl,
        }
      : undefined,
  }
}
