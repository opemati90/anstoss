import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
  DEFAULT_TEAM_GROUPS,
  MembershipRole,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamRole,
  TeamGroupType,
} from '@anstoss/shared'

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
    teamData: {
      name: string
      ageGroup?: string
      squadLabel?: string
      leagueName?: string
      seasonStart?: string
    },
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      // 3. Seed the club's default hierarchy
      const seededGroups = await Promise.all(
        DEFAULT_TEAM_GROUPS.map((group, index) =>
          tx.teamGroup.create({
            data: {
              clubId: club.id,
              type: group.type as TeamGroupType,
              displayName: group.displayName,
              sortOrder: index,
            },
          }),
        ),
      )

      const selectedGroup =
        seededGroups.find((group) => group.displayName === teamData.ageGroup) ||
        (teamData.ageGroup
          ? await tx.teamGroup.create({
              data: {
                clubId: club.id,
                type: TeamGroupType.CUSTOM,
                displayName: teamData.ageGroup,
                sortOrder: seededGroups.length,
              },
            })
          : seededGroups[0])

      const squadLabel = teamData.squadLabel?.trim() || null
      const displayName = buildTeamDisplayName(
        selectedGroup.displayName,
        squadLabel,
        teamData.name,
      )

      // 4. Create first team
      const team = await tx.team.create({
        data: {
          name: teamData.name,
          clubId: club.id,
          groupId: selectedGroup.id,
          displayName,
          ageGroup: selectedGroup.displayName,
          squadLabel,
          leagueName: teamData.leagueName?.trim() || null,
          seasonStart: teamData.seasonStart
            ? new Date(teamData.seasonStart)
            : null,
        },
      })

      // 5. Add creator as head coach and player roster entry for the first team
      await tx.teamAccess.create({
        data: {
          clubId: club.id,
          teamId: team.id,
          userId,
          role: TeamRole.HEAD_COACH,
          phase: TeamAccessPhase.FULL,
          status: TeamAccessStatus.ACTIVE,
        },
      })

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
    return memberships.map((m: typeof memberships[number]) => ({
      ...m.club,
      role: m.role,
    }))
  }
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
