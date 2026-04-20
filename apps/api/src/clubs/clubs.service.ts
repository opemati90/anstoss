import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
  DEFAULT_TEAM_GROUPS,
  MembershipRole,
  RegistrationRole,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamGroupType,
  TeamRole,
} from '@anstoss/shared'
import { tenantContext } from '../prisma/tenant.context'

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a club + first team in a single transaction.
   * Creator gets OWNER membership on club and is added to the team.
   */
  async createClubWithTeam(
    userId: string,
    clubData: {
      name: string
      primaryColor: string
      badgeUrl?: string
      welcomeText?: string
    },
    teamData: {
      name: string
      ageGroup?: string
      squadLabel?: string
      leagueName?: string
      seasonStart?: string
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { registrationRole: true },
    })
    if (!user) {
      throw new NotFoundException('User not found')
    }
    if (user.registrationRole !== RegistrationRole.CLUB_ADMIN) {
      throw new ForbiddenException(
        'Only users registered as CLUB_ADMIN can create a club',
      )
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Create club
      const club = await createClubWithUniqueSlug(tx, clubData)

      // 2. Create OWNER membership for creator
      await tx.membership.create({
        data: {
          userId,
          clubId: club.id,
          role: MembershipRole.OWNER,
        },
      })

      return tenantContext.run({ clubId: club.id, userId }, async () => {
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
    })
  }

  async updateClub(clubId: string, data: { badgeUrl?: string | null }) {
    return this.prisma.club.update({
      where: { id: clubId },
      data,
    })
  }

  async findById(id: string) {
    return this.prisma.club.findUnique({ where: { id } })
  }

  async findBySlug(slug: string) {
    return this.prisma.club.findUnique({
      where: { slug },
      include: {
        teams: {
          select: { id: true, name: true, displayName: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
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

async function createClubWithUniqueSlug(
  tx: Prisma.TransactionClient,
  clubData: {
    name: string
    primaryColor: string
    badgeUrl?: string
    welcomeText?: string
  },
) {
  const baseSlug = slugify(clubData.name) || 'club'

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = await generateUniqueClubSlug(tx, baseSlug)

    try {
      return await tx.club.create({
        data: {
          name: clubData.name,
          slug,
          primaryColor: clubData.primaryColor,
          badgeUrl: clubData.badgeUrl ?? null,
          welcomeText: clubData.welcomeText ?? null,
        },
      })
    } catch (error) {
      if (!isClubSlugConflict(error)) {
        throw error
      }
    }
  }

  throw new Error('Unable to allocate a unique club slug')
}

async function generateUniqueClubSlug(
  tx: Prisma.TransactionClient,
  baseSlug: string,
) {
  const existingClubs = await tx.club.findMany({
    where: {
      OR: [
        { slug: baseSlug },
        { slug: { startsWith: `${baseSlug}-` } },
      ],
    },
    select: { slug: true },
  })

  if (existingClubs.length === 0) {
    return baseSlug
  }

  const usedSlugs = new Set(existingClubs.map((club) => club.slug))
  let suffix = 2

  while (usedSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1
  }

  return `${baseSlug}-${suffix}`
}

function isClubSlugConflict(error: unknown) {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    error.code !== 'P2002'
  ) {
    return false
  }

  const meta = 'meta' in error ? error.meta : undefined
  const target =
    meta &&
    typeof meta === 'object' &&
    'target' in meta &&
    (Array.isArray(meta.target)
      ? meta.target
      : typeof meta.target === 'string'
        ? [meta.target]
        : [])

  return Array.isArray(target) && target.some((value) => value === 'slug')
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
