import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
import { assertLaunchBirthDate, assertLaunchParticipant, launchParticipantWhere, requireYouthParticipation } from '../auth/launch-access-policy'
import {
  FREE_AGENT_ADULT_AGE,
  FREE_AGENT_MIN_AGE,
  LAUNCH_FEATURES,
  FreeAgentVisibility,
  JoinRequestStatus,
  MembershipRole,
  RegistrationRole,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamRole,
  TrialInitiator,
  TrialInviteStatus,
  getAge,
  postalPrefixForRadius,
  postalRegion,
  trialAgeFit,
  type ClubTrialActionInput,
  type CreateFreeAgentMediaInput,
  type CreateTrialInviteInput,
  type CreateTrialRequestInput,
  type FreeAgentListQueryInput,
  type FreeAgentListResponse,
  type FreeAgentMediaEntry,
  type FreeAgentProfile,
  type FreeAgentProfileWriteInput,
  type TrialInvite,
  type TrialSession,
} from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import type { Prisma } from '@prisma/client'
import { R2Provider } from '../assets/r2.provider'
import { lockMediaObject } from '../assets/media-object-lock'
import { freeAgentMediaLimit, MEDIA_ALLOWED_CONTENT_TYPES } from './media-policy'
import { PushService } from '../push/push.service'
import { tenantContext } from '../prisma/tenant.context'
import { ClubEntitlementsService } from '../billing/club-entitlements.service'
import { AgeGateService } from '../auth/age-gate.service'
import { activeTeamAccessWhere } from '../teams/active-team-access'
import {
  assertTeamInScope,
  resolveTrialScope,
  scopeIncludesTeam,
  teamFilterForScope,
} from './trial-scope'
import {
  CAPPED_TRIAL_STATUSES,
  MAX_OPEN_TRIALS_PER_CLUB,
  TRIAL_PROFILE_GRACE_DAYS,
  TRIAL_REQUEST_COOLDOWN_MS,
  TRIAL_REQUEST_DAILY_CAP,
  closeLinkedJoinRequest,
  revokeTrialAccess,
} from './trial-access'

/** Statuses in which a trial thread is still open between club and player. */
export const OPEN_TRIAL_STATUSES = [
  TrialInviteStatus.REQUESTED,
  TrialInviteStatus.PENDING,
  TrialInviteStatus.ACCEPTED,
  TrialInviteStatus.OFFERED,
]

/** Statuses that may silently lapse when nobody answers in time. */
const EXPIRABLE_STATUSES = [TrialInviteStatus.REQUESTED, TrialInviteStatus.PENDING]

const INVITE_MAX_OPEN_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

/** Shown to a child who tries to become a free agent (lead decision). */
export const UNDER_16_FREE_AGENT_MESSAGE =
  'Free-agent profiles are for players aged 16 and over. To change clubs, talk to your parents: they contact the new club.'

type PlayerTrialAction =
  | TrialInviteStatus.ACCEPTED
  | TrialInviteStatus.DECLINED
  | TrialInviteStatus.WITHDRAWN
  | 'ACCEPT_OFFER'

/** Age facts of a free agent. Unknown DOB with the 16+ declaration counts as adult. */
type AgeFacts = { age: number | null; underSixteen: boolean; minor: boolean }

function ageFacts(user: { dateOfBirth?: Date | null } | null | undefined): AgeFacts {
  const dob = user?.dateOfBirth ?? null
  if (!dob) return { age: null, underSixteen: false, minor: false }
  const age = getAge(dob)
  return {
    age,
    underSixteen: age < FREE_AGENT_MIN_AGE,
    minor: age < FREE_AGENT_ADULT_AGE,
  }
}

/** Latest DOB of a person at least `years` old today. */
function dobCutoff(years: number, now = new Date()): Date {
  const cutoff = new Date(now)
  cutoff.setFullYear(cutoff.getFullYear() - years)
  return cutoff
}

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    // Kept for DI compatibility. Seat checks live in Aufnahmeantrag approval
    // (JoinRequestsService): a Probetraining is not joining.
    @Optional() private readonly clubEntitlements?: ClubEntitlementsService,
    // H4: the player's answer is age-gated in the invite's club context.
    @Optional() private readonly ageGate?: AgeGateService,
    @Optional() private readonly r2?: R2Provider,
  ) {}

  // ─── Free-agent profile ──────────────────────────────────────────────

  async getMyFreeAgentProfile(userId: string): Promise<FreeAgentProfile | null> {
    const profile = await this.prisma.freeAgentProfile.findUnique({
      where: { userId },
      include: freeAgentProfileInclude,
    })

    return profile ? this.mapProfile(profile, 'owner') : null
  }

  async createFreeAgentProfile(
    userId: string,
    input: FreeAgentProfileWriteInput,
  ): Promise<FreeAgentProfile> {
    return this.saveFreeAgentProfile(userId, input, false)
  }

  async updateFreeAgentProfile(
    userId: string,
    input: FreeAgentProfileWriteInput,
  ): Promise<FreeAgentProfile> {
    return this.saveFreeAgentProfile(userId, input, true)
  }

  /** H2: 16–17-year-olds show no photos or videos. */
  async assertMayAddMedia(userId: string): Promise<void> {
    const facts = await this.assertFreeAgent(userId)
    if (facts.minor) {
      throw new ForbiddenException('Photos and videos are only available from 18')
    }
  }

  async addMedia(userId: string, input: CreateFreeAgentMediaInput): Promise<FreeAgentMediaEntry> {
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
      const facts = await this.assertFreeAgent(userId, tx)
      if (facts.minor) throw new ForbiddenException('Photos and videos are only available from 18')
      const profile = await tx.freeAgentProfile.findUnique({
        where: { userId },
        select: { id: true },
      })
      if (!profile) {
        throw new NotFoundException('Free agent profile not found')
      }

      // The controller's preflight HEAD is not enough: cleanup can delete a
      // queued object between that check and insertion. Serialize attachment
      // with the cleanup worker and verify storage again while locked.
      if (!this.r2?.enabled) throw new ServiceUnavailableException('Media uploads are unavailable')
      const references = [
        { url: input.url, type: input.type },
        ...(input.thumbnailUrl ? [{ url: input.thumbnailUrl, type: 'PHOTO' as const }] : []),
      ]
      const objects = new Map<string, 'PHOTO' | 'VIDEO'>()
      for (const reference of references) {
        const key = this.r2.objectKeyFromUrl(reference.url)
        if (!key?.startsWith(`users/${userId}/free-agent/${reference.type.toLowerCase()}/`)) {
          throw new BadRequestException('Media does not belong to this user upload')
        }
        objects.set(key, reference.type)
      }
      for (const [objectKey, type] of [...objects].sort(([a], [b]) => a.localeCompare(b))) {
        await lockMediaObject(tx, objectKey)
        if (await tx.accountMediaDeletion.findUnique({ where: { objectKey } })) {
          throw new BadRequestException('Media is being removed; upload it again')
        }
        try {
          await this.r2.assertStoredObject(objectKey, {
            maxBytes: freeAgentMediaLimit(type), allowedContentTypes: MEDIA_ALLOWED_CONTENT_TYPES[type],
          })
        } catch {
          throw new BadRequestException('Media upload is invalid or incomplete')
        }
      }

      const existingCount = await tx.freeAgentMedia.count({
        where: { profileId: profile.id, type: input.type },
      })
      const limit = input.type === 'PHOTO' ? 6 : 2
      if (existingCount >= limit) {
        throw new BadRequestException(
          `You can attach up to ${limit} ${input.type === 'PHOTO' ? 'photos' : 'videos'}`,
        )
      }

      return tx.freeAgentMedia.create({
        data: {
          profileId: profile.id,
          type: input.type,
          url: input.url,
          thumbnailUrl: input.thumbnailUrl ?? null,
          sortOrder: existingCount,
        },
      })
    })
    return mapMedia(created)
  }

  /** Removing own media is always allowed (also after a role change). */
  async deleteMedia(userId: string, mediaId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
      const media = await tx.freeAgentMedia.findUnique({
        where: { id: mediaId }, include: { profile: { select: { userId: true } } },
      })
      if (!media || media.profile.userId !== userId) throw new NotFoundException('Media not found')
      await this.queueFreeAgentMediaDeletion(tx, userId, [media])
      await tx.freeAgentMedia.delete({ where: { id: mediaId } })
    })
  }

  private async queueFreeAgentMediaDeletion(
    tx: Prisma.TransactionClient,
    userId: string,
    media: Array<{ url: string; thumbnailUrl: string | null }>,
  ) {
    if (media.length === 0) return
    if (!this.r2) throw new ServiceUnavailableException('Media deletion is temporarily unavailable')
    const keys = new Set<string>()
    for (const url of media.flatMap((item) => [item.url, item.thumbnailUrl]).filter((item): item is string => Boolean(item))) {
      const objectKey = this.r2.objectKeyFromUrl(url)
      if (objectKey?.startsWith(`users/${userId}/free-agent/`)) keys.add(objectKey)
      if (!objectKey) {
        // Do not drop an apparently owned reference when the configured base
        // URL cannot resolve it; that would silently strand the object.
        let path = ''
        try { path = decodeURIComponent(new URL(url).pathname) } catch { /* foreign legacy URL */ }
        if (path.includes(`/users/${userId}/free-agent/`)) {
          throw new ServiceUnavailableException('Media cleanup cannot be scheduled safely')
        }
      }
    }
    const orderedKeys = [...keys].sort()
    for (const key of orderedKeys) await lockMediaObject(tx, key)
    if (orderedKeys.length) {
      await tx.accountMediaDeletion.createMany({
        data: orderedKeys.map((objectKey) => ({ objectKey })), skipDuplicates: true,
      })
    }
  }

  /**
   * GDPR (M4): the owner can always delete their own profile, whatever their
   * role or age now. M3: open trials end with it: TRIAL access is revoked and
   * a pending Aufnahmeantrag is withdrawn (contact data erased) before the
   * cascade removes the invites.
   */
  async deleteFreeAgentProfile(userId: string): Promise<void> {
    await tenantContext.exit(async () => this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
      const existing = await tx.freeAgentProfile.findUnique({
        where: { userId }, select: { id: true, media: { select: { url: true, thumbnailUrl: true } } },
      })
      if (!existing) throw new NotFoundException('Free agent profile not found')
      const openInvites: Array<{ id: string; clubId: string; teamId: string }> =
        await tx.trialInvite.findMany({
          where: { freeAgentProfileId: existing.id, status: { in: OPEN_TRIAL_STATUSES } },
          select: { id: true, clubId: true, teamId: true },
        })
      for (const invite of openInvites.sort((a, b) => a.id.localeCompare(b.id))) {
        await tenantContext.run({ clubId: invite.clubId, userId }, async () => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trial-invite:${invite.id}`}))`
          await tx.trialInvite.updateMany({
            where: { id: invite.id, clubId: invite.clubId, status: { in: OPEN_TRIAL_STATUSES } },
            data: { status: TrialInviteStatus.WITHDRAWN, respondedAt: new Date() },
          })
          await revokeTrialAccess(tx, invite.teamId, userId)
          await closeLinkedJoinRequest(
            tx,
            invite.id,
            invite.clubId,
            JoinRequestStatus.WITHDRAWN,
            userId,
          )
        })
      }
      await this.queueFreeAgentMediaDeletion(tx, userId, existing.media)
      await tx.freeAgentExperience.deleteMany({
        where: { profileId: existing.id },
      })
      await tx.freeAgentProfile.delete({ where: { userId } })
    }))
  }

  /**
   * FREE_AGENT role + H2 age rule. Returns the caller's age facts. Under 16
   * nobody holds a free-agent profile (lead decision 2026-09-24).
   */
  private async assertFreeAgent(userId: string, client: PrismaService | Prisma.TransactionClient = this.prisma): Promise<AgeFacts> {
    await assertLaunchParticipant(client, userId)
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { registrationRole: true, dateOfBirth: true, deletedAt: true },
    })
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found')
    }
    if (user.registrationRole !== RegistrationRole.FREE_AGENT) {
      throw new ForbiddenException(
        'Only users registered as FREE_AGENT can manage a free-agent profile',
      )
    }
    const facts = ageFacts(user)
    if (facts.underSixteen) {
      throw new ForbiddenException(UNDER_16_FREE_AGENT_MESSAGE)
    }
    return facts
  }

  async updateRegistrationRole(userId: string, registrationRole: RegistrationRole) {
    if (registrationRole === RegistrationRole.PARENT) requireYouthParticipation()
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
      await assertLaunchParticipant(tx, userId)
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, dateOfBirth: true, registrationRole: true, deletedAt: true },
      })

      if (!user || user.deletedAt) {
        throw new NotFoundException('User not found')
      }

      // H2: under-16s never take the free-agent role.
      if (registrationRole === RegistrationRole.FREE_AGENT && ageFacts(user).underSixteen) {
        throw new ForbiddenException(UNDER_16_FREE_AGENT_MESSAGE)
      }

      if (registrationRole === RegistrationRole.CLUB_ADMIN) {
        const existingMembership = await tx.membership.findFirst({
          where: { userId },
          select: { id: true },
        })
        if (existingMembership) {
          throw new ForbiddenException(
            'Cannot change registration role to CLUB_ADMIN after joining a club',
          )
        }
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: { registrationRole },
        select: {
          id: true,
          registrationRole: true,
        },
      })

      // M4: leaving the free-agent role takes the card off the Wechselbörse.
      if (
        user.registrationRole === RegistrationRole.FREE_AGENT &&
        registrationRole !== RegistrationRole.FREE_AGENT
      ) {
        await tx.freeAgentProfile.updateMany({
          where: { userId },
          data: { isOnTransferList: false },
        })
      }

      return updated
    })
  }

  // ─── Spielersuche (club side) ────────────────────────────────────────

  /**
   * H3: club staff = OWNER/ADMIN of any club, or an active HEAD/ASSISTANT
   * coach. A plain club member (player, parent) is not staff.
   */
  private async isClubStaff(userId: string | null): Promise<boolean> {
    if (!userId) return false
    const [adminMembership, coachAccess] = await Promise.all([
      this.prisma.membership.findFirst({
        where: { userId, role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] } },
        select: { id: true },
      }),
      tenantContext.exit(() =>
        this.prisma.teamAccess.findFirst({
          where: {
            userId,
            role: { in: [TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH] },
            ...activeTeamAccessWhere(),
          },
          select: { id: true },
        }),
      ),
    ])
    return Boolean(adminMembership || coachAccess)
  }

  /** PUBLIC for everyone; CLUB_ONLY ("Vereine") for club staff only. Never PRIVATE. */
  private visibilitiesFor(staff: boolean): FreeAgentVisibility[] {
    return staff
      ? [FreeAgentVisibility.PUBLIC, FreeAgentVisibility.CLUB_ONLY]
      : [FreeAgentVisibility.PUBLIC]
  }

  async listFreeAgents(
    input: FreeAgentListQueryInput,
    callerUserId: string | null = null,
  ): Promise<FreeAgentListResponse> {
    const staff = await this.isClubStaff(callerUserId)
    const now = new Date()
    const postalPrefix = input.postalCode
      ? postalPrefixForRadius(input.postalCode, input.radiusKm ?? 25)
      : null
    const where = {
      isOnTransferList: true,
      visibility: { in: this.visibilitiesFor(staff) },
      user: {
        ...launchParticipantWhere(now),
        deletedAt: null,
        // M4: only people who still are free agents.
        registrationRole: RegistrationRole.FREE_AGENT,
        AND: [
          // H2: never under 16; minors (16–17) only for club staff.
          { OR: [{ dateOfBirth: null }, { dateOfBirth: { lte: dobCutoff(FREE_AGENT_MIN_AGE, now) } }] },
          ...(staff
            ? []
            : [
                {
                  OR: [
                    { dateOfBirth: null },
                    { dateOfBirth: { lte: dobCutoff(FREE_AGENT_ADULT_AGE, now) } },
                  ],
                },
              ]),
        ],
        ...(input.query
          ? { name: { contains: input.query, mode: 'insensitive' as const } }
          : {}),
      },
      ...(input.position ? { position: input.position } : {}),
      ...(input.preferredFoot ? { preferredFoot: input.preferredFoot } : {}),
      ...(input.league ? { highestLeague: input.league } : {}),
      ...(postalPrefix ? { postalCode: { startsWith: postalPrefix } } : {}),
      ...(input.city
        ? { city: { contains: input.city, mode: 'insensitive' as const } }
        : {}),
    }

    const [items, total] = await Promise.all([
      this.prisma.freeAgentProfile.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, avatarUrl: true, dateOfBirth: true },
          },
          _count: { select: { experience: true } },
        },
        orderBy: orderByForSort(input.sort),
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.freeAgentProfile.count({ where }),
    ])

    return {
      items: items.map((item: any) => {
        const facts = ageFacts(item.user)
        return {
          id: item.id,
          userId: item.userId,
          name: item.user.name,
          avatarUrl: item.user.avatarUrl,
          position: item.position,
          preferredFoot: item.preferredFoot,
          city: item.city,
          experienceCount: item._count?.experience ?? 0,
          visibility: item.visibility,
          // H2: the full PLZ is the owner's; others get the region.
          postalCode: null,
          postalRegion: postalRegion(item.postalCode),
          highestLeague: item.highestLeague ?? null,
          currentClubName: item.currentClubName ?? null,
          availableFrom: toDateOnly(item.availableFrom),
          age: facts.minor ? null : ageOrNull(item.user.dateOfBirth),
          isMinor: facts.minor,
          createdAt: item.createdAt.toISOString(),
        }
      }),
      page: input.page,
      pageSize: input.pageSize,
      total,
    }
  }

  /**
   * A profile is readable when it is listed for the caller's audience, when
   * the caller owns it, or (M1) when the caller coaches the team or runs the
   * club that has an open trial with the player, or closed one within the
   * last TRIAL_PROFILE_GRACE_DAYS.
   */
  async getPublicFreeAgentProfile(
    id: string,
    callerUserId: string | null = null,
  ): Promise<FreeAgentProfile> {
    const profile = await this.prisma.freeAgentProfile.findUnique({
      where: { id },
      include: freeAgentProfileInclude,
    })

    if (!profile || profile.user?.deletedAt) {
      throw new NotFoundException('Free agent profile not found')
    }
    if (!LAUNCH_FEATURES.youthParticipation && (!profile.user?.dateOfBirth || getAge(profile.user.dateOfBirth) < LAUNCH_FEATURES.minimumAccountAge)) {
      throw new NotFoundException('Free agent profile not found')
    }

    if (callerUserId && profile.userId === callerUserId) {
      return this.mapProfile(profile, 'owner')
    }

    const facts = ageFacts(profile.user)
    // Under-16 profiles are delisted and never shown (H2).
    if (facts.underSixteen) throw new NotFoundException('Free agent profile not found')

    const staff = await this.isClubStaff(callerUserId)
    const listed =
      profile.isOnTransferList &&
      profile.user?.registrationRole === RegistrationRole.FREE_AGENT &&
      (!facts.minor || staff)
    if (listed && this.visibilitiesFor(staff).includes(profile.visibility as FreeAgentVisibility)) {
      return this.mapProfile(profile, 'viewer')
    }

    if (callerUserId && (await this.callerSharesTrial(profile.id, callerUserId))) {
      return this.mapProfile(profile, 'viewer')
    }

    throw new NotFoundException('Free agent profile not found')
  }

  /** M1: an open trial, or one closed within the grace period, in the caller's scope. */
  private async callerSharesTrial(profileId: string, callerUserId: string): Promise<boolean> {
    const graceStart = new Date(Date.now() - TRIAL_PROFILE_GRACE_DAYS * DAY_MS)
    const threads: Array<{ clubId: string; teamId: string }> = await tenantContext.exit(() =>
      this.prisma.trialInvite.findMany({
        where: {
          freeAgentProfileId: profileId,
          OR: [{ status: { in: OPEN_TRIAL_STATUSES } }, { updatedAt: { gte: graceStart } }],
        },
        select: { clubId: true, teamId: true },
      }),
    )
    for (const thread of threads) {
      const inScope = await tenantContext
        .run({ clubId: thread.clubId, userId: callerUserId }, () =>
          resolveTrialScope(this.prisma as any, thread.clubId, callerUserId),
        )
        .then((scope) => scopeIncludesTeam(scope, thread.teamId))
        .catch(() => false)
      if (inScope) return true
    }
    return false
  }

  // ─── Probetraining: club side ────────────────────────────────────────

  /** Caller already holds all affected account locks in sorted order. */
  private async lockTrialStaff(tx: Prisma.TransactionClient, clubId: string, userId: string, teamId: string) {
    await assertLaunchParticipant(tx, userId)
    const actor = await tx.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } })
    if (!actor) throw new ForbiddenException('This account is no longer active')
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`owner:${clubId}`}))`
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`coach-assignments:${teamId}`}))`
    await tx.$queryRaw`SELECT "id" FROM "TeamAccess" WHERE "userId" = ${userId} AND "clubId" = ${clubId} AND "teamId" = ${teamId} FOR SHARE`
    await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "userId" = ${userId} AND "clubId" = ${clubId} FOR SHARE`
    const current = await resolveTrialScope(tx, clubId, userId)
    assertTeamInScope(current, teamId, 'Trial invite')
  }

  async createTrialInvite(
    clubId: string,
    senderUserId: string,
    input: CreateTrialInviteInput,
  ): Promise<TrialInvite> {
    const scope = await resolveTrialScope(this.prisma as any, clubId, senderUserId)
    assertTeamInScope(scope, input.teamId, 'Team')

    const [profile, team] = await Promise.all([
      this.prisma.freeAgentProfile.findUnique({
        where: { id: input.freeAgentProfileId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              deletedAt: true,
              dateOfBirth: true,
              registrationRole: true,
            },
          },
        },
      }),
      this.prisma.team.findFirst({
        where: { id: input.teamId, clubId },
        select: { id: true, ageGroup: true },
      }),
    ])

    if (!profile || profile.user.deletedAt) {
      throw new NotFoundException('Free agent profile not found')
    }
    if (!LAUNCH_FEATURES.youthParticipation) assertLaunchBirthDate(profile.user.dateOfBirth ?? new Date(NaN))
    const facts = ageFacts(profile.user)
    if (
      !profile.isOnTransferList ||
      profile.visibility === FreeAgentVisibility.PRIVATE ||
      profile.user.registrationRole !== RegistrationRole.FREE_AGENT ||
      facts.underSixteen
    ) {
      throw new BadRequestException('This player is not looking for a club right now')
    }
    if (!team) {
      throw new NotFoundException('Team not found')
    }
    assertAgeFitsTeam(team.ageGroup, facts.age)

    if (input.playerSearchId) {
      const search = await this.prisma.playerSearch.findFirst({
        where: { id: input.playerSearchId, clubId },
        select: { id: true },
      })
      if (!search) throw new NotFoundException('Player search not found')
    }

    // L4: an expiry in the past is refused rather than silently clamped.
    if (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException('The answer deadline must be in the future')
    }

    const sessions = await this.assertTrialSessions(clubId, input.teamId, input.sessionEventIds)

    await this.expireClubTrialInvites(clubId)

    // M7: same per-thread lock as createTrialRequest, so a club invite and a
    // player request cannot both open a thread for the same pair.
    const invite = await this.prisma.$transaction(async (tx: any) => {
      // Account erasure inventories the player's trial clubs under this same
      // lock. Do not create a thread from the preflight snapshot after erasure.
      for (const id of [...new Set([senderUserId, profile.user.id])].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`
      }
      await this.lockTrialStaff(tx, clubId, senderUserId, input.teamId)
      const currentProfile = await tx.freeAgentProfile.findUnique({
        where: { id: input.freeAgentProfileId },
        include: { user: { select: { id: true, deletedAt: true, dateOfBirth: true, registrationRole: true } } },
      })
      if (!currentProfile || currentProfile.user.id !== profile.user.id || currentProfile.user.deletedAt) {
        throw new NotFoundException('Free agent profile not found')
      }
      if (!LAUNCH_FEATURES.youthParticipation) assertLaunchBirthDate(currentProfile.user.dateOfBirth ?? new Date(NaN))
      const currentFacts = ageFacts(currentProfile.user)
      if (!currentProfile.isOnTransferList || currentProfile.visibility === FreeAgentVisibility.PRIVATE
        || currentProfile.user.registrationRole !== RegistrationRole.FREE_AGENT || currentFacts.underSixteen) {
        throw new BadRequestException('This player is not looking for a club right now')
      }
      assertAgeFitsTeam(team.ageGroup, currentFacts.age)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trial-thread:${clubId}:${input.freeAgentProfileId}`}))`
      const existingOpen = await tx.trialInvite.findFirst({
        where: {
          clubId,
          freeAgentProfileId: input.freeAgentProfileId,
          status: { in: OPEN_TRIAL_STATUSES },
        },
        select: { id: true },
      })
      if (existingOpen) {
        throw new BadRequestException('This player already has an open trial with this club')
      }
      await assertOpenTrialCapacity(tx, clubId)
      return tx.trialInvite.create({
        data: {
          clubId,
          freeAgentProfileId: input.freeAgentProfileId,
          teamId: input.teamId,
          sentByUserId: senderUserId,
          message: input.message?.trim() || null,
          expiresAt: inviteExpiry(sessions, input.expiresAt),
          status: TrialInviteStatus.PENDING,
          initiatedBy: TrialInitiator.CLUB,
          playerSearchId: input.playerSearchId ?? null,
          sessionEventIds: sessions.map((session) => session.id),
        },
        include: trialInviteInclude,
      })
    })

    this.notifyInvite(profile.user.id, invite)

    return this.mapTrialInvite(invite, sessionMap(sessions), 'club')
  }

  async listClubTrialInvites(clubId: string, userId: string): Promise<TrialInvite[]> {
    const scope = await resolveTrialScope(this.prisma as any, clubId, userId)
    await this.expireClubTrialInvites(clubId)

    const invites = await this.prisma.trialInvite.findMany({
      where: { clubId, ...teamFilterForScope(scope) },
      include: trialInviteInclude,
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
    })

    const sessions = await this.loadSessions(invites)
    return invites.map((invite: any) => this.mapTrialInvite(invite, sessions, 'club'))
  }

  /**
   * One pipeline step taken by the club: invite a requester to concrete
   * sessions, record feedback, offer a place, reject, or withdraw an invite.
   */
  async applyClubTrialAction(
    clubId: string,
    inviteId: string,
    userId: string,
    input: ClubTrialActionInput,
  ): Promise<TrialInvite> {
    const scope = await resolveTrialScope(this.prisma as any, clubId, userId)
    // L4: lapse stale invites before deciding what is still possible.
    await this.expireClubTrialInvites(clubId)
    const invite = await this.prisma.trialInvite.findFirst({
      where: { id: inviteId, clubId },
      include: trialInviteInclude,
    })
    if (!invite) throw new NotFoundException('Trial invite not found')
    if (input.action === 'invite' || input.action === 'offer') await assertLaunchParticipant(this.prisma, invite.freeAgentProfile.userId)
    assertTeamInScope(scope, invite.teamId)

    const now = new Date()
    let from: TrialInviteStatus[]
    let data: Record<string, unknown>
    let sessions: TrialSession[] | null = null
    let revokeAccess = false
    let closesOffer = false
    let takesSlot = false

    switch (input.action) {
      case 'invite': {
        from = [TrialInviteStatus.REQUESTED, TrialInviteStatus.PENDING]
        assertAgeFitsTeam(invite.team?.ageGroup, ageFacts(invite.freeAgentProfile.user).age)
        sessions = await this.assertTrialSessions(clubId, invite.teamId, input.sessionEventIds)
        data = {
          status: TrialInviteStatus.PENDING,
          sessionEventIds: sessions.map((session) => session.id),
          expiresAt: inviteExpiry(sessions),
          ...(input.message !== undefined ? { message: input.message.trim() || null } : {}),
        }
        takesSlot = invite.status === TrialInviteStatus.REQUESTED
        break
      }
      case 'feedback': {
        from = [TrialInviteStatus.ACCEPTED, TrialInviteStatus.OFFERED]
        data = {
          rating: input.rating,
          feedback: input.feedback?.trim() || null,
          ...(input.attended !== undefined ? { attended: input.attended } : {}),
        }
        break
      }
      case 'offer': {
        from = [TrialInviteStatus.ACCEPTED]
        data = {
          status: TrialInviteStatus.OFFERED,
          decidedAt: now,
          decidedByUserId: userId,
          decisionMessage: input.message?.trim() || null,
        }
        break
      }
      case 'reject': {
        from = [
          TrialInviteStatus.REQUESTED,
          TrialInviteStatus.PENDING,
          TrialInviteStatus.ACCEPTED,
          TrialInviteStatus.OFFERED,
        ]
        data = {
          status: TrialInviteStatus.REJECTED,
          decidedAt: now,
          decidedByUserId: userId,
          decisionMessage: input.message?.trim() || null,
        }
        revokeAccess = true
        closesOffer = true
        break
      }
      case 'revoke': {
        from = [TrialInviteStatus.PENDING, TrialInviteStatus.ACCEPTED]
        data = { status: TrialInviteStatus.REVOKED, decidedAt: now, decidedByUserId: userId }
        revokeAccess = true
        break
      }
      default:
        throw new BadRequestException('Unknown trial action')
    }

    if (!from.includes(invite.status as TrialInviteStatus)) {
      throw new BadRequestException('This step is not possible in the current trial stage')
    }

    const updated = await this.prisma.$transaction(async (tx: any) => {
      for (const id of [...new Set([userId, invite.freeAgentProfile.userId as string])].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`
      }
      const target = await tx.user.findFirst({
        where: { id: invite.freeAgentProfile.userId, deletedAt: null }, select: { id: true },
      })
      if (!target) throw new NotFoundException('Trial invite not found')
      if (input.action === 'invite' || input.action === 'offer') {
        await assertLaunchParticipant(tx, invite.freeAgentProfile.userId)
      }
      await this.lockTrialStaff(tx, clubId, userId, invite.teamId)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trial-invite:${invite.id}`}))`
      if (takesSlot) await assertOpenTrialCapacity(tx, clubId)
      const transition = await tx.trialInvite.updateMany({
        where: { id: invite.id, clubId, teamId: invite.teamId, freeAgentProfileId: invite.freeAgentProfile.id, status: { in: from } },
        data,
      })
      if (transition.count !== 1) {
        throw new BadRequestException('Trial invite changed. Refresh and try again')
      }
      if (revokeAccess) {
        await revokeTrialAccess(tx, invite.teamId, invite.freeAgentProfile.userId)
      }
      if (closesOffer) {
        // B2: a rejected offer closes its pending Aufnahmeantrag.
        await closeLinkedJoinRequest(tx, invite.id, clubId, JoinRequestStatus.REJECTED, userId)
      }
      return tx.trialInvite.findUniqueOrThrow({
        where: { id: invite.id },
        include: trialInviteInclude,
      })
    })

    const playerUserId = invite.freeAgentProfile.userId
    const pushData = { clubName: invite.club.name, teamName: invite.team.displayName }
    const payload = { trialInviteId: invite.id, clubId }
    if (input.action === 'invite') {
      this.notifyInvite(playerUserId, updated)
    } else if (input.action === 'offer') {
      void this.push
        .sendToUserLocalized(playerUserId, 'TRIAL_OFFER', pushData, payload, { clubId })
        .catch(() => {})
    } else if (input.action === 'reject') {
      void this.push
        .sendToUserLocalized(playerUserId, 'TRIAL_DECLINED_BY_CLUB', pushData, payload, { clubId })
        .catch(() => {})
    } else if (input.action === 'revoke') {
      // M8: the player learns their sessions are off.
      void this.push
        .sendToUserLocalized(playerUserId, 'TRIAL_REVOKED', pushData, payload, { clubId })
        .catch(() => {})
    }

    const sessionLookup = sessions ? sessionMap(sessions) : await this.loadSessions([updated])
    return this.mapTrialInvite(updated, sessionLookup, 'club')
  }

  // ─── Probetraining: player side ──────────────────────────────────────

  async listMyTrialInvites(userId: string): Promise<TrialInvite[]> {
    const expirable = await this.prisma.trialInvite.findMany({
      where: {
        freeAgentProfile: { userId },
        status: { in: EXPIRABLE_STATUSES },
      },
      select: { clubId: true },
    })

    await this.expireTrialInvitesForClubs(
      Array.from(new Set(expirable.map((invite: any) => invite.clubId))),
      userId,
    )

    const invites = await this.prisma.trialInvite.findMany({
      where: { freeAgentProfile: { userId } },
      include: trialInviteInclude,
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
    })

    const sessions = await this.loadSessions(invites)
    return invites.map((invite: any) => this.mapTrialInvite(invite, sessions, 'player'))
  }

  /** Shared trial detail: the player sees their view, club staff theirs. */
  async getTrialInvite(inviteId: string, userId: string): Promise<TrialInvite> {
    const invite = await this.prisma.trialInvite.findUnique({
      where: { id: inviteId },
      include: trialInviteInclude,
    })
    if (!invite) throw new NotFoundException('Trial invite not found')

    if (invite.freeAgentProfile.userId === userId) {
      const sessions = await this.loadSessions([invite])
      return this.mapTrialInvite(invite, sessions, 'player')
    }

    return tenantContext.run({ clubId: invite.clubId, userId }, async () => {
      const scopeOk = await resolveTrialScope(this.prisma as any, invite.clubId, userId)
        .then((scope) => scopeIncludesTeam(scope, invite.teamId))
        .catch(() => false)
      if (!scopeOk) throw new NotFoundException('Trial invite not found')
      const sessions = await this.loadSessions([invite])
      return this.mapTrialInvite(invite, sessions, 'club')
    })
  }

  /** "Probetraining anfragen" on a club's Gesuch. */
  async createTrialRequest(
    playerSearchId: string,
    userId: string,
    input: CreateTrialRequestInput,
  ): Promise<TrialInvite> {
    const facts = await this.assertFreeAgent(userId)
    const profile = await this.prisma.freeAgentProfile.findUnique({
      where: { userId },
      include: { user: { select: { id: true, name: true } } },
    })
    if (!profile) {
      throw new BadRequestException('Create your player profile before asking for a trial')
    }

    const search = await this.prisma.playerSearch.findFirst({
      where: { id: playerSearchId, status: 'OPEN' },
      include: { team: { select: { id: true, displayName: true, ageGroup: true } } },
    })
    if (!search || (search.expiresAt && search.expiresAt < new Date())) {
      throw new NotFoundException('This search is no longer open')
    }
    assertAgeFitsTeam(search.team?.ageGroup, facts.age)

    return tenantContext.run({ clubId: search.clubId, userId }, async () => {
      const invite = await this.prisma.$transaction(async (tx: any) => {
        // Erasure takes this account lock before discovering linked trials.
        const accounts = [userId, ...(search.createdByUserId ? [search.createdByUserId] : [])]
        for (const id of [...new Set(accounts)].sort()) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`
        }
        const currentFacts = await this.assertFreeAgent(userId, tx)
        const currentProfile = await tx.freeAgentProfile.findUnique({ where: { userId }, select: { id: true } })
        if (!currentProfile || currentProfile.id !== profile.id) {
          throw new BadRequestException('Create your player profile before asking for a trial')
        }
        if (search.createdByUserId) {
          await this.lockTrialStaff(tx, search.clubId, search.createdByUserId, search.teamId)
        }
        await tx.$queryRaw`SELECT "id" FROM "PlayerSearch" WHERE "id" = ${playerSearchId} AND "clubId" = ${search.clubId} FOR SHARE`
        const currentSearch = await tx.playerSearch.findFirst({
          where: { id: playerSearchId, clubId: search.clubId, status: 'OPEN' },
          include: { team: { select: { id: true, ageGroup: true } } },
        })
        if (!currentSearch || (currentSearch.expiresAt && currentSearch.expiresAt <= new Date())
          || currentSearch.teamId !== search.teamId || currentSearch.createdByUserId !== search.createdByUserId) {
          throw new NotFoundException('This search is no longer open')
        }
        if (search.createdByUserId) {
          const creator = await tx.user.findFirst({ where: { id: search.createdByUserId, deletedAt: null }, select: { id: true } })
          if (!creator) throw new NotFoundException('This search is no longer open')
          await assertLaunchParticipant(tx, search.createdByUserId)
        }
        assertAgeFitsTeam(currentSearch.team?.ageGroup, currentFacts.age)
        // M5: per-player cap lock, then the thread.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trial-requests:${profile.id}`}))`
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trial-thread:${search.clubId}:${profile.id}`}))`
        const existingOpen = await tx.trialInvite.findFirst({
          where: {
            clubId: search.clubId,
            freeAgentProfileId: profile.id,
            status: { in: OPEN_TRIAL_STATUSES },
          },
          select: { id: true },
        })
        if (existingOpen) {
          throw new BadRequestException('You already have an open trial with this club')
        }
        await assertTrialRequestQuota(tx, search.clubId, profile.id)
        return tx.trialInvite.create({
          data: {
            clubId: search.clubId,
            freeAgentProfileId: profile.id,
            teamId: search.teamId,
            // The coach who posted the Gesuch is the club's contact person
            // (null once they deleted their account, L6).
            sentByUserId: search.createdByUserId ?? null,
            message: input.message?.trim() || null,
            expiresAt: new Date(Date.now() + INVITE_MAX_OPEN_DAYS * DAY_MS),
            status: TrialInviteStatus.REQUESTED,
            initiatedBy: TrialInitiator.PLAYER,
            playerSearchId: search.id,
            sessionEventIds: [],
          },
          include: trialInviteInclude,
        })
      })

      // A post-commit push containing the player's name can race a staff
      // revocation. Keep the in-app request and omit that notification until
      // delivery has its own transactional recipient-authorization boundary.

      return this.mapTrialInvite(invite, new Map(), 'player')
    })
  }

  async respondToTrialInvite(
    inviteId: string,
    userId: string,
    action: PlayerTrialAction,
  ): Promise<TrialInvite> {
    const invite = await this.prisma.trialInvite.findUnique({
      where: { id: inviteId },
      include: trialInviteInclude,
    })

    if (!invite || invite.freeAgentProfile.userId !== userId) {
      throw new NotFoundException('Trial invite not found')
    }

    // H4: the age gate for this answer is the invite's club + team, not the
    // strictest "no club" rule the route would otherwise get.
    if (this.ageGate) {
      await this.ageGate.assertAllowed(userId, { clubId: invite.clubId, teamId: invite.teamId })
    }

    return tenantContext.run({ clubId: invite.clubId, userId }, async () => {
      // L4: expire first, then decide.
      if (
        EXPIRABLE_STATUSES.includes(invite.status as TrialInviteStatus) &&
        invite.expiresAt < new Date() &&
        action !== TrialInviteStatus.WITHDRAWN
      ) {
        await this.prisma.trialInvite.updateMany({
          where: { id: invite.id, clubId: invite.clubId, status: { in: EXPIRABLE_STATUSES } },
          data: { status: TrialInviteStatus.EXPIRED },
        })
        throw new BadRequestException('Trial invite expired')
      }

      const allowedFrom = PLAYER_TRANSITIONS[action]
      if (!allowedFrom.includes(invite.status as TrialInviteStatus)) {
        throw new BadRequestException('Trial invite has already been handled')
      }

      if (action === TrialInviteStatus.ACCEPTED) {
        const facts = ageFacts(invite.freeAgentProfile.user)
        // H4: no Probetraining for under-16s (they cannot hold a profile);
        // 16–17 may accept.
        if (facts.underSixteen) throw new ForbiddenException(UNDER_16_FREE_AGENT_MESSAGE)
        assertAgeFitsTeam(invite.team?.ageGroup, facts.age)
      }

      const updatedInvite = await this.decideTrialInvite(invite, userId, action)

      // A named post-commit push can race erasure or staff revocation. The
      // decision remains visible in-app; restore notifications only with a
      // delivery-time recipient and player lifecycle authorization boundary.

      const sessions = await this.loadSessions([updatedInvite])
      return this.mapTrialInvite(updatedInvite, sessions, 'player')
    })
  }

  /**
   * Persists a free-agent profile (create or update).
   * Role and age are revalidated under the account lifecycle lock so an
   * erasure or role change that wins the lock cannot be undone here.
   */
  private async saveFreeAgentProfile(
    userId: string,
    input: FreeAgentProfileWriteInput,
    requireExisting: boolean,
  ): Promise<FreeAgentProfile> {
    const searchFields = {
      postalCode: input.postalCode === undefined ? undefined : input.postalCode,
      searchRadiusKm: input.searchRadiusKm === undefined ? undefined : input.searchRadiusKm,
      highestLeague: input.highestLeague === undefined ? undefined : input.highestLeague,
      currentClubName:
        input.currentClubName === undefined
          ? undefined
          : normalizeNullableString(input.currentClubName),
      availableFrom:
        input.availableFrom === undefined
          ? undefined
          : input.availableFrom
            ? new Date(`${input.availableFrom}T00:00:00.000Z`)
            : null,
    }

    const profile = await this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
      const facts = await this.assertFreeAgent(userId, tx)
      const existing = await tx.freeAgentProfile.findUnique({
        where: { userId }, select: { id: true, visibility: true },
      })
      if (requireExisting && !existing) throw new NotFoundException('Free agent profile not found')
      // Recompute age-dependent visibility after acquiring the lifecycle lock.
      const requestedVisibility = input.visibility
      const visibility = facts.minor && requestedVisibility === FreeAgentVisibility.PUBLIC
        ? FreeAgentVisibility.CLUB_ONLY : requestedVisibility
      const forceMinorVisibility = facts.minor && existing?.visibility === FreeAgentVisibility.PUBLIC && visibility === undefined
      const savedProfile = existing
        ? await tx.freeAgentProfile.update({
            where: { userId },
            data: {
              position: input.position === undefined ? undefined : input.position,
              preferredFoot: input.preferredFoot === undefined ? undefined : input.preferredFoot,
              city: input.city === undefined ? undefined : normalizeNullableString(input.city),
              bio: input.bio === undefined ? undefined : normalizeNullableString(input.bio),
              isOnTransferList:
                input.isOnTransferList === undefined ? undefined : input.isOnTransferList,
              visibility: forceMinorVisibility ? FreeAgentVisibility.CLUB_ONLY : visibility,
              ...searchFields,
            },
          })
        : await tx.freeAgentProfile.create({
            data: {
              userId,
              position: input.position ?? null,
              preferredFoot: input.preferredFoot ?? null,
              city: normalizeNullableString(input.city),
              bio: normalizeNullableString(input.bio),
              isOnTransferList: input.isOnTransferList ?? false,
              visibility: visibility ?? FreeAgentVisibility.PRIVATE,
              postalCode: searchFields.postalCode ?? null,
              searchRadiusKm: searchFields.searchRadiusKm ?? null,
              highestLeague: searchFields.highestLeague ?? null,
              currentClubName: searchFields.currentClubName ?? null,
              availableFrom: searchFields.availableFrom ?? null,
            },
          })

      if (input.experience !== undefined) {
        await tx.freeAgentExperience.deleteMany({
          where: { profileId: savedProfile.id },
        })

        if (input.experience.length > 0) {
          await tx.freeAgentExperience.createMany({
            data: input.experience.map((entry, index) => ({
              profileId: savedProfile.id,
              clubName: entry.clubName.trim(),
              roleLabel: entry.roleLabel.trim(),
              fromYear: entry.fromYear ?? null,
              toYear: entry.toYear ?? null,
              sortOrder: entry.sortOrder ?? index,
            })),
          })
        }
      }

      return tx.freeAgentProfile.findUnique({
        where: { id: savedProfile.id },
        include: freeAgentProfileInclude,
      })
    })

    if (!profile) {
      throw new NotFoundException('Free agent profile not found')
    }

    return this.mapProfile(profile, 'owner')
  }

  /**
   * Player decision under the account-lifecycle lock. Accepting a
   * Probetraining grants TRIAL team access only (see the listed sessions,
   * answer them), never a Membership: joining happens through the
   * Aufnahmeantrag, where the seat check also lives.
   */
  private async decideTrialInvite(invite: any, userId: string, action: PlayerTrialAction) {
    const allowedFrom = PLAYER_TRANSITIONS[action]
    return this.prisma.$transaction(async (tx: any) => {
      // Account deletion uses this same lifecycle lock. Re-read both the user
      // and invitation after acquiring it so acceptance cannot recreate access
      // after deletion cleanup or redeem stale/revoked state.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
      const activeUser = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { id: true },
      })
      if (!activeUser) {
        throw new ForbiddenException('This account is no longer active')
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trial-invite:${invite.id}`}))`
      const expiryGuard =
        action === TrialInviteStatus.ACCEPTED ? { expiresAt: { gt: new Date() } } : {}
      const currentInvite = await tx.trialInvite.findFirst({
        where: {
          id: invite.id,
          clubId: invite.clubId,
          teamId: invite.teamId,
          status: { in: allowedFrom },
          ...expiryGuard,
          freeAgentProfile: { userId },
        },
        select: { id: true, clubId: true, teamId: true, status: true, sessionEventIds: true },
      })
      if (!currentInvite) {
        throw new BadRequestException('Trial invite is no longer available')
      }
      if (
        action === TrialInviteStatus.ACCEPTED &&
        (currentInvite.sessionEventIds ?? []).length === 0
      ) {
        throw new BadRequestException('This invitation has no training sessions')
      }

      const now = new Date()
      let data: Record<string, unknown>
      if (action === 'ACCEPT_OFFER') {
        // The offer stays OFFERED until the Aufnahmeantrag is approved;
        // respondedAt tells the club the player said yes.
        data = { respondedAt: now }
      } else {
        data = { status: action, respondedAt: now }
      }

      if (action === TrialInviteStatus.ACCEPTED) {
        await grantTrialAccess(tx, currentInvite.clubId, currentInvite.teamId, userId)
      } else if (action === TrialInviteStatus.DECLINED || action === TrialInviteStatus.WITHDRAWN) {
        await revokeTrialAccess(tx, currentInvite.teamId, userId)
        // B2: declining an offer closes the Aufnahmeantrag; the player's
        // contact data goes with it (M2).
        await closeLinkedJoinRequest(
          tx,
          currentInvite.id,
          currentInvite.clubId,
          JoinRequestStatus.WITHDRAWN,
          userId,
        )
      }

      const transition = await tx.trialInvite.updateMany({
        where: {
          id: currentInvite.id,
          status: { in: allowedFrom },
          ...expiryGuard,
        },
        data,
      })
      if (transition.count !== 1) {
        throw new BadRequestException('Trial invite has already been handled')
      }

      return tx.trialInvite.findUniqueOrThrow({
        where: { id: currentInvite.id },
        include: trialInviteInclude,
      })
    })
  }

  /**
   * Sessions must be the team's own upcoming, non-cancelled TRAINING events.
   * Returned in date order.
   */
  private async assertTrialSessions(
    clubId: string,
    teamId: string,
    eventIds: string[],
  ): Promise<TrialSession[]> {
    const unique = Array.from(new Set(eventIds))
    const events = await this.prisma.event.findMany({
      where: {
        id: { in: unique },
        clubId,
        teamId,
        type: 'TRAINING',
        cancelledAt: null,
        date: { gt: new Date() },
      },
      select: { id: true, title: true, date: true, location: true, cancelledAt: true },
      orderBy: [{ date: 'asc' }],
    })
    if (events.length !== unique.length) {
      throw new BadRequestException(
        'Pick upcoming training sessions of this team for the trial',
      )
    }
    return events.map(mapSession)
  }

  private async loadSessions(invites: any[]): Promise<Map<string, TrialSession>> {
    const ids = Array.from(
      new Set(invites.flatMap((invite: any) => (invite.sessionEventIds as string[]) ?? [])),
    )
    if (ids.length === 0) return new Map()
    const events = await this.prisma.event.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, date: true, location: true, cancelledAt: true },
    })
    return sessionMap(events.map(mapSession))
  }

  private notifyInvite(playerUserId: string, invite: any) {
    void this.push
      .sendToUserLocalized(
        playerUserId,
        'TRIAL_INVITE',
        { clubName: invite.club.name, teamName: invite.team.displayName },
        { trialInviteId: invite.id, clubId: invite.clubId, teamId: invite.teamId },
        { clubId: invite.clubId },
      )
      .catch(() => {})
  }

  private async expireClubTrialInvites(clubId: string) {
    await this.prisma.trialInvite.updateMany({
      where: {
        clubId,
        status: { in: EXPIRABLE_STATUSES },
        expiresAt: { lt: new Date() },
      },
      data: { status: TrialInviteStatus.EXPIRED },
    })
  }

  private async expireTrialInvitesForClubs(clubIds: string[], userId: string) {
    for (const clubId of clubIds) {
      await tenantContext.run({ clubId, userId }, async () => {
        await this.expireClubTrialInvites(clubId)
      })
    }
  }

  /**
   * `owner` sees their own card in full. `viewer` (clubs, other players)
   * gets the region instead of the PLZ (H2); a minor shows no exact age and
   * no media to anyone.
   */
  private mapProfile(profile: any, view: 'owner' | 'viewer'): FreeAgentProfile {
    const facts = ageFacts(profile.user)
    return {
      id: profile.id,
      userId: profile.userId,
      position: profile.position,
      preferredFoot: profile.preferredFoot,
      city: profile.city,
      bio: profile.bio,
      avatarUrl: profile.user.avatarUrl,
      isOnTransferList: profile.isOnTransferList,
      visibility: profile.visibility,
      postalCode: view === 'owner' ? (profile.postalCode ?? null) : null,
      postalRegion: postalRegion(profile.postalCode),
      searchRadiusKm: view === 'owner' ? (profile.searchRadiusKm ?? null) : null,
      highestLeague: profile.highestLeague ?? null,
      currentClubName: profile.currentClubName ?? null,
      availableFrom: toDateOnly(profile.availableFrom),
      age: view === 'owner' || !facts.minor ? ageOrNull(profile.user.dateOfBirth) : null,
      isMinor: facts.minor,
      experience: (profile.experience ?? []).map((entry: any) => ({
        id: entry.id,
        clubName: entry.clubName,
        roleLabel: entry.roleLabel,
        fromYear: entry.fromYear,
        toYear: entry.toYear,
        sortOrder: entry.sortOrder,
      })),
      media: facts.minor ? [] : (profile.media || []).map(mapMedia),
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
      user: {
        id: profile.user.id,
        name: profile.user.name,
        avatarUrl: profile.user.avatarUrl,
      },
    }
  }

  private mapTrialInvite(
    invite: any,
    sessions: Map<string, TrialSession>,
    view: 'club' | 'player',
  ): TrialInvite {
    const sessionList = ((invite.sessionEventIds as string[]) ?? [])
      .map((id) => sessions.get(id))
      .filter((session): session is TrialSession => Boolean(session))
      .sort((a, b) => a.date.localeCompare(b.date))
    const profile = invite.freeAgentProfile
    const joinRequest = invite.joinRequest ?? null
    const facts = ageFacts(profile.user)

    return {
      id: invite.id,
      clubId: invite.clubId,
      freeAgentProfileId: invite.freeAgentProfileId,
      teamId: invite.teamId,
      sentByUserId: invite.sentByUserId ?? null,
      message: invite.message,
      expiresAt: invite.expiresAt.toISOString(),
      status: invite.status,
      respondedAt: invite.respondedAt ? invite.respondedAt.toISOString() : null,
      createdAt: invite.createdAt.toISOString(),
      initiatedBy: invite.initiatedBy ?? TrialInitiator.CLUB,
      playerSearchId: invite.playerSearchId ?? null,
      sessionEventIds: invite.sessionEventIds ?? [],
      sessions: sessionList,
      // Coach notes are internal to the club.
      ...(view === 'club'
        ? {
            feedback: invite.feedback ?? null,
            rating: invite.rating ?? null,
            attended: invite.attended ?? null,
          }
        : {}),
      decisionMessage: invite.decisionMessage ?? null,
      decidedAt: invite.decidedAt ? invite.decidedAt.toISOString() : null,
      club: {
        id: invite.club.id,
        name: invite.club.name,
        badgeUrl: invite.club.badgeUrl,
        primaryColor: invite.club.primaryColor,
      },
      team: {
        id: invite.team.id,
        displayName: invite.team.displayName,
        groupName: invite.team.group?.displayName || null,
        leagueName: invite.team.leagueName ?? null,
      },
      sender: invite.sender ? { id: invite.sender.id, name: invite.sender.name } : null,
      player: {
        profileId: profile.id ?? invite.freeAgentProfileId,
        userId: profile.userId,
        name: profile.user.name,
        avatarUrl: profile.user.avatarUrl ?? null,
        position: profile.position ?? null,
        preferredFoot: profile.preferredFoot ?? null,
        highestLeague: profile.highestLeague ?? null,
        age: facts.minor && view === 'club' ? null : ageOrNull(profile.user.dateOfBirth),
        isMinor: facts.minor,
      },
      joinRequest: joinRequest
        ? {
            id: joinRequest.id,
            status: joinRequest.status,
            revision: joinRequest.revision,
            createdAt: joinRequest.createdAt.toISOString(),
            previousClubName: joinRequest.previousClubName ?? null,
            releaseStatus: joinRequest.releaseStatus ?? null,
            passApplicationAt: toDateOnly(joinRequest.passApplicationAt),
            eligibleFrom: toDateOnly(joinRequest.eligibleFrom),
          }
        : null,
    }
  }
}

/** Which invite statuses each player action may start from. */
const PLAYER_TRANSITIONS: Record<PlayerTrialAction, TrialInviteStatus[]> = {
  [TrialInviteStatus.ACCEPTED]: [TrialInviteStatus.PENDING],
  [TrialInviteStatus.DECLINED]: [TrialInviteStatus.PENDING, TrialInviteStatus.OFFERED],
  [TrialInviteStatus.WITHDRAWN]: [
    TrialInviteStatus.REQUESTED,
    TrialInviteStatus.PENDING,
    TrialInviteStatus.ACCEPTED,
  ],
  ACCEPT_OFFER: [TrialInviteStatus.OFFERED],
}

/** H1: adults never trial with a youth team; youth players must fit the team's age class. */
function assertAgeFitsTeam(ageGroup: string | null | undefined, age: number | null) {
  const fit = trialAgeFit(ageGroup, age)
  if (fit === 'ADULT_ON_YOUTH_TEAM') {
    throw new BadRequestException(
      'Probetraining with a youth team is only possible for players of that age group',
    )
  }
  if (fit === 'TOO_OLD_FOR_TEAM') {
    throw new BadRequestException('This player is too old for this youth team')
  }
}

/** B1: a club runs at most MAX_OPEN_TRIALS_PER_CLUB invited trials at a time. */
async function assertOpenTrialCapacity(tx: any, clubId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trial-cap:${clubId}`}))`
  const open = await tx.trialInvite.count({
    where: { clubId, status: { in: CAPPED_TRIAL_STATUSES } },
  })
  if (open >= MAX_OPEN_TRIALS_PER_CLUB) {
    throw new ConflictException(
      `Your club already runs ${MAX_OPEN_TRIALS_PER_CLUB} open Probetrainings. Close one before inviting another player.`,
    )
  }
}

/** M5: one request per club per 24h, TRIAL_REQUEST_DAILY_CAP per player per 24h. */
async function assertTrialRequestQuota(tx: any, clubId: string, profileId: string) {
  const since = new Date(Date.now() - TRIAL_REQUEST_COOLDOWN_MS)
  const [sameClub, today] = await Promise.all([
    tx.trialInvite.count({
      where: {
        clubId,
        freeAgentProfileId: profileId,
        initiatedBy: TrialInitiator.PLAYER,
        createdAt: { gte: since },
      },
    }),
    tenantContext.exit(() =>
      tx.trialInvite.count({
        where: {
          freeAgentProfileId: profileId,
          initiatedBy: TrialInitiator.PLAYER,
          createdAt: { gte: since },
        },
      }),
    ),
  ])
  if (sameClub > 0) {
    throw new HttpException(
      'You already asked this club for a trial in the last 24 hours',
      HttpStatus.TOO_MANY_REQUESTS,
    )
  }
  if ((today as number) >= TRIAL_REQUEST_DAILY_CAP) {
    throw new HttpException(
      `You can ask for up to ${TRIAL_REQUEST_DAILY_CAP} trials per day`,
      HttpStatus.TOO_MANY_REQUESTS,
    )
  }
}

/** TRIAL access so the player sees and answers the team's sessions. */
async function grantTrialAccess(tx: any, clubId: string, teamId: string, userId: string) {
  const existing = await tx.teamAccess.findFirst({
    where: { teamId, userId, role: TeamRole.PLAYER },
    select: { id: true, phase: true, status: true },
  })
  // Never downgrade a player who already belongs to the team.
  if (existing?.phase === TeamAccessPhase.FULL && existing.status === TeamAccessStatus.ACTIVE) {
    return
  }
  await tx.teamAccess.upsert({
    where: { teamId_userId_role: { teamId, userId, role: TeamRole.PLAYER } },
    update: { phase: TeamAccessPhase.TRIAL, status: TeamAccessStatus.ACTIVE },
    create: {
      clubId,
      teamId,
      userId,
      role: TeamRole.PLAYER,
      phase: TeamAccessPhase.TRIAL,
      status: TeamAccessStatus.ACTIVE,
    },
  })
}

function inviteExpiry(sessions: TrialSession[], requested?: string): Date {
  const cap = new Date(Date.now() + INVITE_MAX_OPEN_DAYS * DAY_MS)
  const firstSession = sessions[0] ? new Date(sessions[0].date) : cap
  const candidates = [cap, firstSession]
  if (requested) candidates.push(new Date(requested))
  return new Date(Math.min(...candidates.map((date) => date.getTime())))
}

function mapSession(event: any): TrialSession {
  return {
    id: event.id,
    title: event.title,
    date: event.date instanceof Date ? event.date.toISOString() : String(event.date),
    location: event.location ?? null,
    cancelledAt: event.cancelledAt
      ? event.cancelledAt instanceof Date
        ? event.cancelledAt.toISOString()
        : String(event.cancelledAt)
      : null,
  }
}

function sessionMap(sessions: TrialSession[]): Map<string, TrialSession> {
  return new Map(sessions.map((session) => [session.id, session]))
}

function ageOrNull(dateOfBirth: Date | null | undefined): number | null {
  if (!dateOfBirth) return null
  const age = getAge(dateOfBirth)
  return age > 0 && age < 100 ? age : null
}

function toDateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

const freeAgentProfileInclude = {
  user: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      dateOfBirth: true,
      registrationRole: true,
      deletedAt: true,
    },
  },
  experience: {
    orderBy: [{ sortOrder: 'asc' as const }],
  },
  media: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
}

function orderByForSort(sort: string): any[] {
  switch (sort) {
    case 'city':
      return [{ city: 'asc' }, { createdAt: 'desc' }]
    case 'name':
      // Sort by display name via the user relation. createdAt tiebreaker
      // keeps results stable across pagination.
      return [{ user: { name: 'asc' } }, { createdAt: 'desc' }]
    case 'experience':
      return [{ experience: { _count: 'desc' } }, { createdAt: 'desc' }]
    case 'recent':
    case 'newest':
    default:
      return [{ updatedAt: 'desc' }]
  }
}

function mapMedia(entry: any): FreeAgentMediaEntry {
  return {
    id: entry.id,
    type: entry.type,
    url: entry.url,
    thumbnailUrl: entry.thumbnailUrl ?? null,
    sortOrder: entry.sortOrder,
    createdAt:
      entry.createdAt instanceof Date ? entry.createdAt.toISOString() : String(entry.createdAt),
  }
}

export const trialInviteInclude = {
  club: {
    select: {
      id: true,
      name: true,
      badgeUrl: true,
      primaryColor: true,
    },
  },
  team: {
    include: {
      group: {
        select: {
          displayName: true,
        },
      },
    },
  },
  sender: {
    select: {
      id: true,
      name: true,
    },
  },
  freeAgentProfile: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          dateOfBirth: true,
        },
      },
    },
  },
  joinRequest: {
    select: {
      id: true,
      status: true,
      revision: true,
      createdAt: true,
      previousClubName: true,
      releaseStatus: true,
      passApplicationAt: true,
      eligibleFrom: true,
    },
  },
}

function normalizeNullableString(value: string | null | undefined) {
  if (value === undefined) {
    return undefined
  }

  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
