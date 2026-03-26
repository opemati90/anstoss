import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  AGE_GATE,
  MembershipRole,
  ParentalConsentStatus,
  TeamAccessStatus,
  TeamRole,
  getAge,
} from '@anstoss/shared'
import type { CrossTeamEventItem } from '@anstoss/shared'
import { TeamsService } from '../teams/teams.service'

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
  ) {}

  /**
   * Get current user's profile with all club memberships.
   */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            club: {
              select: {
                id: true,
                name: true,
                badgeUrl: true,
                primaryColor: true,
                slug: true,
              },
            },
          },
        },
        teamMembers: {
          include: {
            team: {
              select: {
                id: true,
                name: true,
                clubId: true,
                ageGroup: true,
              },
            },
          },
        },
        teamAccess: {
          where: {
            status: {
              in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
            },
          },
          include: {
            team: {
              include: {
                group: true,
              },
            },
          },
          orderBy: [{ createdAt: 'asc' }],
        },
        guardianRelationshipsAsParent: true,
        parentalConsentsAsPlayer: {
          orderBy: [{ requestedAt: 'desc' }],
        },
      },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    const age = getAge(user.dateOfBirth)
    const latestConsent = user.parentalConsentsAsPlayer[0]

    const ageGate =
      age >= AGE_GATE.MIN_AGE || latestConsent?.status === ParentalConsentStatus.APPROVED
        ? {
            isUnder16: age < AGE_GATE.MIN_AGE,
            status: 'CLEARED' as const,
            guardianEmail: latestConsent?.guardianEmail || null,
            message: null,
          }
        : latestConsent
          ? {
              isUnder16: true,
              status: 'PENDING_PARENT_APPROVAL' as const,
              guardianEmail: latestConsent.guardianEmail,
              message:
                latestConsent.status === ParentalConsentStatus.REJECTED
                  ? 'Parental approval was declined.'
                  : 'Parental approval is still pending.',
            }
          : {
              isUnder16: true,
              status: 'BLOCKED' as const,
              guardianEmail: null,
              message: `You must be at least ${AGE_GATE.MIN_AGE} or have parental approval to access Anstoss.`,
            }

    // Derive teamMembers from teamAccess for the mobile client.
    // The mobile AuthContext expects { id, role, team: { id, name, displayName, clubId, ageGroup } }.
    const teamMembers = user.teamAccess.map((ta: any) => ({
      id: ta.id,
      role: ta.role,
      team: {
        id: ta.team.id,
        name: ta.team.name,
        displayName: ta.team.displayName,
        clubId: ta.team.clubId,
        ageGroup: ta.team.ageGroup,
      },
    }))

    return {
      ...user,
      teamMembers,
      ageGate,
    }
  }

  /**
   * Update profile — name, avatarUrl. DOB is read-only after registration.
   */
  async updateProfile(
    userId: string,
    data: { name?: string; avatarUrl?: string; dateOfBirth?: string },
  ) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dateOfBirth: true },
    })

    if (!currentUser) {
      throw new NotFoundException('User not found')
    }

    const updateData: {
      name?: string
      avatarUrl?: string
      dateOfBirth?: Date
    } = {}

    if (data.name !== undefined) {
      updateData.name = data.name
    }

    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = data.avatarUrl
    }

    if (data.dateOfBirth) {
      const parsedDate = new Date(data.dateOfBirth)
      if (Number.isNaN(parsedDate.getTime())) {
        throw new BadRequestException('Invalid date of birth')
      }

      if (
        !isPlaceholderDate(currentUser.dateOfBirth) &&
        currentUser.dateOfBirth.toISOString().slice(0, 10) !==
          parsedDate.toISOString().slice(0, 10)
      ) {
        throw new BadRequestException(
          'Date of birth is read-only after registration',
        )
      }

      updateData.dateOfBirth = parsedDate
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    })
  }

  /**
   * Get a user's profile within a club context (visible to teammates).
   */
  async getClubProfile(userId: string, clubId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId, clubId } },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            teamMembers: {
              where: {
                team: { clubId },
              },
              include: {
                team: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
      },
    })

    if (!membership) {
      throw new NotFoundException('Member not found in this club')
    }

    return membership
  }

  /**
   * List all members of a club (for roster view).
   */
  async listClubMembers(clubId: string, userId: string, teamId?: string) {
    if (teamId) {
      await this.teamsService.assertReadableAccess(userId, teamId)

      return this.prisma.teamAccess.findMany({
        where: {
          clubId,
          teamId,
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
        orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
      })
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_clubId: {
          userId,
          clubId,
        },
      },
    })

    if (!membership) {
      throw new NotFoundException('Club membership not found')
    }

    return this.prisma.membership.findMany({
      where: { clubId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            teamAccess: {
              where: {
                clubId,
                status: TeamAccessStatus.ACTIVE,
                role: {
                  in: [TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH],
                },
              },
              include: {
                team: {
                  select: {
                    id: true,
                    displayName: true,
                    group: {
                      select: {
                        id: true,
                        displayName: true,
                      },
                    },
                  },
                },
              },
              orderBy: [{ createdAt: 'asc' }],
            },
          },
        },
      },
      orderBy: { user: { name: 'asc' } },
    })
  }

  async updateClubMemberRole(
    clubId: string,
    actorUserId: string,
    memberUserId: string,
    nextRole: MembershipRole,
  ) {
    const [actorMembership, targetMembership] = await Promise.all([
      this.prisma.membership.findUnique({
        where: {
          userId_clubId: {
            userId: actorUserId,
            clubId,
          },
        },
      }),
      this.prisma.membership.findUnique({
        where: {
          userId_clubId: {
            userId: memberUserId,
            clubId,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      }),
    ])

    if (!actorMembership) {
      throw new NotFoundException('Club membership not found')
    }

    if (!targetMembership) {
      throw new NotFoundException('Member not found in this club')
    }

    if (actorUserId === memberUserId) {
      throw new BadRequestException('You cannot change your own club role here')
    }

    if (targetMembership.role === MembershipRole.OWNER) {
      throw new BadRequestException('Owner role cannot be changed here')
    }

    if (!canManageMembershipRole(actorMembership.role)) {
      throw new ForbiddenException('You do not manage club roles')
    }

    if (!canAssignMembershipRole(actorMembership.role, nextRole)) {
      throw new ForbiddenException('Only club owners can assign admin role')
    }

    if (
      actorMembership.role === MembershipRole.ADMIN &&
      targetMembership.role === MembershipRole.ADMIN
    ) {
      throw new ForbiddenException('Admins cannot change other admins')
    }

    if (targetMembership.role === nextRole) {
      return targetMembership
    }

    const activeCoachAssignments = await this.prisma.teamAccess.findMany({
      where: {
        clubId,
        userId: memberUserId,
        status: TeamAccessStatus.ACTIVE,
        role: {
          in: [TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH],
        },
      },
      select: {
        id: true,
      },
    })

    if (
      activeCoachAssignments.length > 0 &&
      !isStaffMembershipRole(nextRole)
    ) {
      throw new BadRequestException(
        'Reassign squad coaching responsibilities before removing club staff role',
      )
    }

    return this.prisma.membership.update({
      where: {
        userId_clubId: {
          userId: memberUserId,
          clubId,
        },
      },
      data: {
        role: nextRole,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    })
  }

  /**
   * Get upcoming events across all teams for a parent's children.
   * Queries GuardianRelationship → child TeamAccess → Events.
   */
  async getChildrenEvents(
    userId: string,
    filters?: { dateFrom?: string; dateTo?: string },
  ): Promise<CrossTeamEventItem[]> {
    // Find all guardian relationships for this parent
    const relationships = await this.prisma.guardianRelationship.findMany({
      where: { parentUserId: userId },
      select: {
        playerUserId: true,
        childName: true,
      },
    })

    if (relationships.length === 0) return []

    // Get player user IDs (some might be null if child isn't a registered user)
    const playerUserIds = relationships
      .map((r: any) => r.playerUserId)
      .filter((id: any): id is string => id !== null)

    if (playerUserIds.length === 0) return []

    // Find all active team access records for these children (including loans)
    const teamAccessRecords = await this.prisma.teamAccess.findMany({
      where: {
        userId: { in: playerUserIds },
        status: TeamAccessStatus.ACTIVE,
      },
      select: {
        teamId: true,
        team: {
          select: {
            id: true,
            name: true,
            group: {
              select: { displayName: true },
            },
          },
        },
      },
    })

    const teamIds = [...new Set(teamAccessRecords.map((ta: any) => ta.teamId))]
    if (teamIds.length === 0) return []

    // Build team name lookup
    const teamNameMap = new Map<string, { name: string; displayName: string }>()
    for (const ta of teamAccessRecords) {
      if (!teamNameMap.has(ta.teamId)) {
        teamNameMap.set(ta.teamId, {
          name: ta.team.name,
          displayName: ta.team.group?.displayName
            ? `${ta.team.group.displayName} — ${ta.team.name}`
            : ta.team.name,
        })
      }
    }

    // Query upcoming events for all those teams
    const dateFilter: Record<string, Date> = { gte: new Date() }
    if (filters?.dateFrom) dateFilter.gte = new Date(filters.dateFrom)
    if (filters?.dateTo) dateFilter.lte = new Date(filters.dateTo)

    const events = await this.prisma.event.findMany({
      where: {
        teamId: { in: teamIds },
        date: dateFilter,
        cancelledAt: null,
      },
      include: {
        _count: { select: { rsvps: true } },
        rsvps: {
          where: { userId },
          select: { status: true },
        },
      },
      orderBy: { date: 'asc' },
    })

    return events.map((event: any) => {
      const teamInfo = teamNameMap.get(event.teamId)
      return {
        id: event.id,
        teamId: event.teamId,
        clubId: event.clubId,
        title: event.title,
        type: event.type,
        date: event.date.toISOString(),
        location: event.location ?? null,
        notes: event.notes ?? null,
        createdById: event.createdById,
        createdAt: event.createdAt.toISOString(),
        responseCount: event._count.rsvps,
        myRsvp: event.rsvps[0]?.status ?? null,
        teamName: teamInfo?.name ?? '',
        teamDisplayName: teamInfo?.displayName ?? '',
      }
    })
  }
}

function isPlaceholderDate(value: Date) {
  return value.toISOString().slice(0, 10) === '1990-01-01'
}

function canManageMembershipRole(role: string) {
  return role === MembershipRole.OWNER || role === MembershipRole.ADMIN
}

function canAssignMembershipRole(
  actorRole: string,
  nextRole: MembershipRole,
) {
  if (nextRole === MembershipRole.OWNER) {
    return false
  }

  if (actorRole === MembershipRole.OWNER) {
    return true
  }

  if (actorRole === MembershipRole.ADMIN) {
    return nextRole !== MembershipRole.ADMIN
  }

  return false
}

function isStaffMembershipRole(role: MembershipRole) {
  return (
    role === MembershipRole.OWNER ||
    role === MembershipRole.ADMIN ||
    role === MembershipRole.COACH
  )
}
