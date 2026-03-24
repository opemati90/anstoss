import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  AGE_GATE,
  ParentalConsentStatus,
  TeamAccessStatus,
  getAge,
} from '@anstoss/shared'
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

    return {
      ...user,
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
            avatarUrl: true,
          },
        },
      },
      orderBy: { user: { name: 'asc' } },
    })
  }
}

function isPlaceholderDate(value: Date) {
  return value.toISOString().slice(0, 10) === '1990-01-01'
}
