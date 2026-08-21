import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Optional,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { R2Provider } from '../assets/r2.provider'
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
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
    @Optional() private readonly r2?: R2Provider,
  ) {}

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
    directoryEntryId?: string,
  ) {
    if (clubData.badgeUrl) {
      throw new BadRequestException('Create the club before uploading its badge')
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { registrationRole: true },
    })
    if (!user) {
      throw new NotFoundException('User not found')
    }
    if (user.registrationRole !== RegistrationRole.CLUB_ADMIN) {
      throw new ForbiddenException(
        `Only users registered as CLUB_ADMIN can create a club (current registrationRole: ${user.registrationRole ?? 'null'})`,
      )
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Serialize concurrent /clubs/setup calls for the SAME user with a
      // transaction-scoped advisory lock, so the existing-owner check and the
      // creation below are atomic. Without it, two near-simultaneous calls (a
      // double-tapped "finish setup" on a stale client) can both pass the check
      // and mint two owner clubs — the schema only enforces unique (userId,
      // clubId), not "one OWNER club per user". The lock auto-releases at commit.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`

      // Idempotency guard: setup is the only club-creation path (no
      // multi-club-create UI exists), so a user owns at most one club — if they
      // already own one, return it instead of minting a duplicate. Returning
      // (not throwing) keeps the double-tap a no-op success so the client routes
      // straight into the app.
      const existingOwner = await tx.membership.findFirst({
        where: { userId, role: MembershipRole.OWNER },
        select: { clubId: true },
      })
      if (existingOwner) {
        const [club, team] = await Promise.all([
          tx.club.findUnique({ where: { id: existingOwner.clubId } }),
          tx.team.findFirst({
            where: { clubId: existingOwner.clubId },
            orderBy: { createdAt: 'asc' },
          }),
        ])
        // A club always has its first team from setup; if either is somehow
        // missing the data is corrupt — surface it rather than guess.
        if (!club || !team) {
          throw new ConflictException('You already own a club.')
        }
        return { club, team }
      }

      const directoryEntry = directoryEntryId
        ? await tx.clubDirectoryEntry.findUnique({
            where: { id: directoryEntryId },
            select: {
              id: true,
              name: true,
              normalizedName: true,
              slug: true,
              city: true,
              association: true,
              activeClubId: true,
            },
          })
        : null

      if (directoryEntryId && !directoryEntry) {
        throw new NotFoundException('Club directory entry not found')
      }

      if (directoryEntry?.activeClubId) {
        throw new ConflictException('Club directory entry is already linked')
      }

      // 1. Create club
      const resolvedClubData = directoryEntry
        ? { ...clubData, name: directoryEntry.name }
        : clubData

      const club = await createClubWithUniqueSlug(tx, resolvedClubData, {
        city: directoryEntry?.city ?? null,
        slugBase: directoryEntry?.slug ?? null,
        directoryEntryId: directoryEntry?.id ?? null,
        searchAliases: directoryEntry
          ? [directoryEntry.normalizedName, directoryEntry.association]
          : [],
      })

      if (directoryEntry) {
        const claimed = await tx.clubDirectoryEntry.updateMany({
          where: { id: directoryEntry.id, activeClubId: null },
          data: { activeClubId: club.id, lastSeenAt: new Date() },
        })
        if (claimed.count === 0) {
          throw new ConflictException('Club directory entry is already linked')
        }
      }

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

  async updateClub(
    clubId: string,
    data: { name?: string; primaryColor?: string; badgeUrl?: string | null },
  ) {
    if (typeof data.badgeUrl === 'string' && this.r2?.enabled) {
      const objectKey = this.r2.objectKeyFromUrl(data.badgeUrl)
      if (!objectKey || !objectKey.startsWith(`${clubId}/club_badge/`)) {
        throw new BadRequestException('Badge does not belong to this club upload')
      }
      try {
        await this.r2.assertStoredObject(objectKey, {
          maxBytes: 10 * 1024 * 1024,
          allowedContentTypes: new Set([
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/heic',
          ]),
        })
      } catch {
        throw new BadRequestException('Badge upload is invalid or incomplete')
      }
    }
    return this.prisma.club.update({
      where: { id: clubId },
      data,
    })
  }

  /**
   * The caller leaves a club. Removes their membership plus every club-scoped
   * relationship in one transaction: team access, roster (TeamMember),
   * CUSTOM-channel memberships, and any pending join request. The last OWNER
   * is blocked so a club can't be orphaned — they must hand over ownership or
   * delete the club instead.
   */
  async leaveClub(userId: string, clubId: string): Promise<{ left: boolean }> {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clubId}))`

      const membership = await tx.membership.findUnique({
        where: { userId_clubId: { userId, clubId } },
        select: { role: true },
      })
      if (!membership) {
        throw new NotFoundException('You are not a member of this club')
      }
      if (membership.role === MembershipRole.OWNER) {
        const owners = await tx.membership.count({
          where: { clubId, role: MembershipRole.OWNER },
        })
        if (owners <= 1) {
          throw new ConflictException(
            'Transfer ownership or delete the club before leaving',
          )
        }
      }

      await this.purgeFromClubInTransaction(tx, userId, clubId)
    })
    this.eventEmitter?.emit('realtime.access.changed', { userId })
    return { left: true }
  }

  /**
   * An OWNER/ADMIN removes another member from the club (e.g. a player who left
   * mid-season). Mirrors leaveClub's cascade but for a target user. Owners are
   * protected (an OWNER can only be removed by transferring ownership / the
   * owner leaving themselves), and you can't remove yourself here — use leave.
   */
  async removeMemberFromClub(
    actingUserId: string,
    clubId: string,
    targetUserId: string,
  ): Promise<{ removed: boolean }> {
    const actor = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId: actingUserId, clubId } },
      select: { role: true },
    })
    if (!actor || (actor.role !== MembershipRole.OWNER && actor.role !== MembershipRole.ADMIN)) {
      throw new ForbiddenException('Only club owners or admins can remove members')
    }
    if (actingUserId === targetUserId) {
      throw new ConflictException('Use leave club to remove yourself')
    }
    const target = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId: targetUserId, clubId } },
      select: { role: true },
    })
    if (!target) {
      throw new NotFoundException('That member is not in this club')
    }
    if (target.role === MembershipRole.OWNER) {
      throw new ForbiddenException('An owner cannot be removed')
    }

    await this.purgeFromClub(targetUserId, clubId)
    this.eventEmitter?.emit('realtime.access.changed', { userId: targetUserId })
    return { removed: true }
  }

  /**
   * Delete every club-scoped relationship for a user in one transaction:
   * channel memberships (all of the club's channels), team access + roster
   * rows, pending join requests, and the membership itself. Shared by
   * leaveClub + removeMemberFromClub.
   */
  private async purgeFromClub(userId: string, clubId: string): Promise<void> {
    await this.prisma.$transaction((tx: Prisma.TransactionClient) =>
      this.purgeFromClubInTransaction(tx, userId, clubId),
    )
  }

  private async purgeFromClubInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    clubId: string,
  ): Promise<void> {
    await tx.channelMember.deleteMany({
      where: { userId, channel: { is: { clubId } } },
    })
    await tx.conversationParticipant.deleteMany({
      where: { userId, conversation: { is: { clubId } } },
    })
    await tx.teamAccess.deleteMany({ where: { userId, clubId } })
    await tx.teamMember.deleteMany({
      where: { userId, team: { is: { clubId } } },
    })
    await tx.rsvp.deleteMany({
      where: { userId, event: { is: { clubId } } },
    })
    await tx.eventReminderPreference.deleteMany({
      where: { userId, event: { is: { clubId } } },
    })
    await tx.eventCheckIn.deleteMany({
      where: { userId, clubId },
    })
    await tx.messageReaction.deleteMany({
      where: { userId, message: { is: { clubId } } },
    })
    await tx.messageReadReceipt.deleteMany({
      where: { userId, message: { is: { clubId } } },
    })
    await tx.messageReport.deleteMany({
      where: { reporterUserId: userId, message: { is: { clubId } } },
    })
    await tx.pollVote.deleteMany({
      where: {
        userId,
        poll: { is: { message: { is: { clubId } } } },
      },
    })
    await tx.notificationPreference.deleteMany({ where: { userId, clubId } })
    await tx.guardianRelationship.deleteMany({
      where: {
        clubId,
        OR: [{ parentUserId: userId }, { playerUserId: userId }],
      },
    })
    await tx.parentalConsent.deleteMany({
      where: { clubId, playerUserId: userId },
    })
    await tx.parentalConsent.updateMany({
      where: { clubId, guardianUserId: userId },
      data: { guardianUserId: null },
    })
    await tx.injuryReport.deleteMany({ where: { clubId, userId } })
    await tx.teamDutyAssignment.deleteMany({
      where: { clubId, assignedUserId: userId },
    })
    await tx.contributionAssignment.updateMany({
      where: { clubId, memberUserId: userId, endDate: null },
      data: { endDate: new Date() },
    })
    await tx.contributionReminder.deleteMany({
      where: { clubId, memberUserId: userId },
    })
    await tx.joinRequest.deleteMany({ where: { userId, clubId } })
    await tx.membership.deleteMany({ where: { userId, clubId } })
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
  options?: {
    city?: string | null
    slugBase?: string | null
    directoryEntryId?: string | null
    searchAliases?: Array<string | null>
  },
) {
  const baseSlug = options?.slugBase || slugify(clubData.name) || 'club'

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = await generateUniqueClubSlug(
      tx,
      baseSlug,
      options?.directoryEntryId ?? null,
    )

    try {
      return await tx.club.create({
        data: {
          name: clubData.name,
          slug,
          primaryColor: clubData.primaryColor,
          badgeUrl: clubData.badgeUrl ?? null,
          welcomeText: clubData.welcomeText ?? null,
          city: options?.city ?? null,
          searchText: normalizeClubSearchText(
            [clubData.name, options?.city, ...(options?.searchAliases ?? [])]
              .filter(Boolean)
              .join(' '),
          ),
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
  allowedDirectoryEntryId: string | null,
) {
  const slugWhere = {
    OR: [
      { slug: baseSlug },
      { slug: { startsWith: `${baseSlug}-` } },
    ],
  }

  const [existingClubs, existingDirectoryEntries] = await Promise.all([
    tx.club.findMany({
      where: slugWhere,
      select: { slug: true },
    }),
    tx.clubDirectoryEntry.findMany({
      where: {
        ...slugWhere,
        ...(allowedDirectoryEntryId
          ? { id: { not: allowedDirectoryEntryId } }
          : {}),
      },
      select: { slug: true },
    }),
  ])

  if (existingClubs.length === 0 && existingDirectoryEntries.length === 0) {
    return baseSlug
  }

  const usedSlugs = new Set([
    ...existingClubs.map((club) => club.slug),
    ...existingDirectoryEntries.map((entry) => entry.slug),
  ])
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

function normalizeClubSearchText(value: string) {
  const german = value
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'ae')
    .replace(/Ö/g, 'oe')
    .replace(/Ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const folded = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  return Array.from(new Set([german, folded].filter(Boolean))).join(' ')
}
