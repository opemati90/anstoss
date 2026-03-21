import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { MembershipRole } from '@anstoss/shared'

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a club + first team in a single transaction.
   * Creator gets OWNER membership on club and is added to the team.
   */
  async createClubWithTeam(
    userId: string,
    clubData: { name: string; primaryColor: string; badgeUrl?: string },
    teamData: { name: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const slug = slugify(clubData.name)

      // 1. Create club
      const club = await tx.club.create({
        data: {
          name: clubData.name,
          slug,
          primaryColor: clubData.primaryColor,
          badgeUrl: clubData.badgeUrl ?? null,
        },
      })

      // 2. Create OWNER membership for creator
      await tx.membership.create({
        data: {
          userId,
          clubId: club.id,
          role: MembershipRole.OWNER,
        },
      })

      // 3. Create first team
      const team = await tx.team.create({
        data: {
          name: teamData.name,
          clubId: club.id,
        },
      })

      // 4. Add creator as team member
      await tx.teamMember.create({
        data: {
          teamId: team.id,
          userId,
        },
      })

      return { club, team }
    })
  }

  async findById(id: string) {
    return this.prisma.club.findUnique({ where: { id } })
  }

  async findByUser(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { club: true },
    })
    return memberships.map((m) => ({
      ...m.club,
      role: m.role,
    }))
  }
}

/**
 * Generate URL-safe slug from club name.
 * Handles German umlauts: ä→ae, ö→oe, ü→ue, ß→ss
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
