import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
      },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    return user
  }

  /**
   * Update profile — name, avatarUrl. DOB is read-only after registration.
   */
  async updateProfile(
    userId: string,
    data: { name?: string; avatarUrl?: string },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
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
  async listClubMembers(clubId: string) {
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
