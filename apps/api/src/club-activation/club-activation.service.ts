import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  ClubClaimKind,
  ClubClaimStatus,
  MembershipRole,
  Prisma,
  RegistrationRole,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamGroupType,
  TeamRole,
} from '@prisma/client'
import type {
  ReviewClubClaimInput,
  RespondClubClaimInput,
  SubmitFirstClubClaimInput,
  SubmitStaffAccessRequestInput,
  CreateOwnershipTransferInput,
  OpenClubDisputeInput,
  ResolveClubDisputeInput,
} from '@anstoss/shared'
import { createHash } from 'node:crypto'
import { AuditService } from '../audit/audit.service'
import { ClubEntitlementsService } from '../billing/club-entitlements.service'
import { ChannelsService } from '../channels/channels.service'
import { buildTeamDisplayName, createClubWithUniqueSlug } from '../clubs/clubs.service'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'

const CLAIM_TTL_DAYS = 14
const OWNERSHIP_TRANSFER_TTL_HOURS = 72
const STEP_UP_MAX_AGE_SECONDS = 10 * 60

@Injectable()
export class ClubActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly channels: ChannelsService,
    private readonly entitlements: ClubEntitlementsService,
  ) {}

  async submitFirstClaim(
    userId: string,
    userEmail: string | null,
    input: SubmitFirstClubClaimInput,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { registrationRole: true },
    })
    if (!user) throw new NotFoundException('User not found')
    if (user.registrationRole !== RegistrationRole.CLUB_ADMIN) {
      throw new ForbiddenException('Only registered club administrators can claim a club')
    }
    const directoryEntry = await this.resolveDirectoryEntry(input)
    if (directoryEntry.activeClubId) {
      throw new ConflictException(
        'This club is already active. Ask its administrator for an invitation.',
      )
    }

    const existing = await this.prisma.clubClaim.findFirst({
      where: {
        directoryEntryId: directoryEntry.id,
        claimantUserId: userId,
        status: { in: [ClubClaimStatus.SUBMITTED, ClubClaimStatus.NEEDS_INFO] },
        expiresAt: { gt: new Date() },
      },
    })
    if (existing) return existing

    const expiresAt = addDays(new Date(), CLAIM_TTL_DAYS)
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`claim:${directoryEntry.id}:${userId}`}))`
      const staleClaims = await tx.clubClaim.findMany({
        where: {
          directoryEntryId: directoryEntry.id,
          claimantUserId: userId,
          status: { in: [ClubClaimStatus.SUBMITTED, ClubClaimStatus.NEEDS_INFO] },
          expiresAt: { lte: new Date() },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
      for (const stale of staleClaims) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`claim:${stale.id}`}))`
      }
      const currentDirectory = await tx.clubDirectoryEntry.findUnique({
        where: { id: directoryEntry.id },
        select: { activeClubId: true },
      })
      if (currentDirectory?.activeClubId) {
        throw new ConflictException(
          'This club is already active. Ask its administrator for an invitation.',
        )
      }
      await tx.clubClaim.updateMany({
        where: {
          directoryEntryId: directoryEntry.id,
          claimantUserId: userId,
          status: { in: [ClubClaimStatus.SUBMITTED, ClubClaimStatus.NEEDS_INFO] },
          expiresAt: { lte: new Date() },
        },
        data: { status: ClubClaimStatus.EXPIRED },
      })
      const raced = await tx.clubClaim.findFirst({
        where: {
          directoryEntryId: directoryEntry.id,
          claimantUserId: userId,
          status: { in: [ClubClaimStatus.SUBMITTED, ClubClaimStatus.NEEDS_INFO] },
          expiresAt: { gt: new Date() },
        },
      })
      if (raced) return raced
      const claim = await tx.clubClaim.create({
        data: {
          directoryEntryId: directoryEntry.id,
          claimantUserId: userId,
          kind: ClubClaimKind.FIRST_CLAIM,
          desiredRole: MembershipRole.OWNER,
          requestedTeamRoles: input.teamRoles as TeamRole[],
          teamName: input.teamName,
          teamGroupType: input.teamGroupType as TeamGroupType,
          requestedPrimaryColor: input.primaryColor ?? null,
          externalTeamUrl: input.externalTeamUrl ?? null,
          expiresAt,
        },
      })
      const officialEmail = input.officialEmail?.trim().toLowerCase()
      if (officialEmail) {
        if (!userEmail || officialEmail !== userEmail.trim().toLowerCase()) {
          throw new BadRequestException(
            'Official email evidence must match the authenticated account email',
          )
        }
        await tx.clubClaimEvidence.create({
          data: {
            claimId: claim.id,
            submittedById: userId,
            type: 'OFFICIAL_EMAIL',
            value: officialEmail,
          },
        })
      }
      return claim
    })
  }

  async submitStaffRequest(userId: string, clubId: string, input: SubmitStaffAccessRequestInput) {
    const directoryEntry = await this.prisma.clubDirectoryEntry.findFirst({
      where: { activeClubId: clubId },
      select: { id: true },
    })
    if (!directoryEntry) throw new NotFoundException('Active club not found')
    const existingMembership = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    })
    if (existingMembership && ['OWNER', 'ADMIN', 'COACH'].includes(existingMembership.role)) {
      throw new ConflictException('You already have staff access to this club')
    }
    if (input.requestedTeamIds.length > 0) {
      const count = await this.prisma.team.count({
        where: { clubId, id: { in: input.requestedTeamIds } },
      })
      if (count !== new Set(input.requestedTeamIds).size) {
        throw new BadRequestException('One or more requested teams do not belong to this club')
      }
    }
    if (input.desiredRole === 'COACH' && input.requestedTeamIds.length === 0) {
      throw new BadRequestException('Coach access must be requested for at least one team')
    }

    const active = await this.prisma.clubClaim.findFirst({
      where: {
        clubId,
        claimantUserId: userId,
        status: { in: [ClubClaimStatus.SUBMITTED, ClubClaimStatus.NEEDS_INFO] },
        expiresAt: { gt: new Date() },
      },
    })
    if (active) return active

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`staff-claim:${clubId}:${userId}`}))`
      const staleClaims = await tx.clubClaim.findMany({
        where: {
          clubId,
          claimantUserId: userId,
          status: { in: [ClubClaimStatus.SUBMITTED, ClubClaimStatus.NEEDS_INFO] },
          expiresAt: { lte: new Date() },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
      for (const stale of staleClaims) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`claim:${stale.id}`}))`
      }
      const currentMembership = await tx.membership.findUnique({
        where: { userId_clubId: { userId, clubId } },
        select: { role: true },
      })
      if (currentMembership && ['OWNER', 'ADMIN', 'COACH'].includes(currentMembership.role)) {
        throw new ConflictException('You already have staff access to this club')
      }
      await tx.clubClaim.updateMany({
        where: {
          clubId,
          claimantUserId: userId,
          status: { in: [ClubClaimStatus.SUBMITTED, ClubClaimStatus.NEEDS_INFO] },
          expiresAt: { lte: new Date() },
        },
        data: { status: ClubClaimStatus.EXPIRED },
      })
      const raced = await tx.clubClaim.findFirst({
        where: {
          clubId,
          claimantUserId: userId,
          status: { in: [ClubClaimStatus.SUBMITTED, ClubClaimStatus.NEEDS_INFO] },
          expiresAt: { gt: new Date() },
        },
      })
      if (raced) return raced
      return tx.clubClaim.create({
        data: {
          directoryEntryId: directoryEntry.id,
          clubId,
          claimantUserId: userId,
          kind: ClubClaimKind.STAFF_CLAIM,
          desiredRole: input.desiredRole as MembershipRole,
          requestedTeamIds: [...new Set(input.requestedTeamIds)],
          requestedTeamRoles: input.teamRoles as TeamRole[],
          reviewNote: input.message ?? null,
          expiresAt: addDays(new Date(), CLAIM_TTL_DAYS),
        },
      })
    })
  }

  async listMine(userId: string) {
    const claims = await this.prisma.clubClaim.findMany({
      where: { claimantUserId: userId },
      include: {
        directoryEntry: { select: { name: true, badgeUrl: true, city: true } },
        club: { select: { id: true, name: true, badgeUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return claims.map(withEffectiveClaimStatus)
  }

  async listClubRequests(clubId: string) {
    const claims = await this.prisma.clubClaim.findMany({
      where: { clubId, kind: ClubClaimKind.STAFF_CLAIM },
      include: { claimant: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return claims.map(withEffectiveClaimStatus)
  }

  async listPlatformClaims() {
    const claims = await this.prisma.clubClaim.findMany({
      where: { kind: ClubClaimKind.FIRST_CLAIM },
      include: {
        directoryEntry: true,
        claimant: { select: { id: true, name: true, email: true, createdAt: true } },
        evidence: true,
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    })
    return claims.map(withEffectiveClaimStatus)
  }

  async reviewFirstClaim(reviewerId: string, claimId: string, input: ReviewClubClaimInput) {
    if (input.decision !== 'APPROVE') {
      return this.updateReviewState(reviewerId, claimId, input)
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`claim:${claimId}`}))`
      const claim = await tx.clubClaim.findUnique({
        where: { id: claimId },
        include: { directoryEntry: true },
      })
      this.assertReviewableClaim(claim, ClubClaimKind.FIRST_CLAIM)
      if (claim.directoryEntry.activeClubId) {
        throw new ConflictException('This directory club has already been activated')
      }
      if (!claim.teamName || !claim.teamGroupType) {
        throw new ConflictException('Claim is missing its initial team setup')
      }

      const club = await createClubWithUniqueSlug(
        tx,
        {
          name: claim.directoryEntry.name,
          primaryColor: claim.requestedPrimaryColor ?? claim.directoryEntry.primaryColor,
        },
        {
          city: claim.directoryEntry.city,
          slugBase: claim.directoryEntry.slug,
          directoryEntryId: claim.directoryEntry.id,
          searchAliases: [claim.directoryEntry.normalizedName, claim.directoryEntry.association],
        },
      )
      const claimed = await tx.clubDirectoryEntry.updateMany({
        where: { id: claim.directoryEntry.id, activeClubId: null },
        data: { activeClubId: club.id, lastSeenAt: new Date() },
      })
      if (claimed.count !== 1) throw new ConflictException('Club was activated concurrently')

      await tx.membership.create({
        data: { clubId: club.id, userId: claim.claimantUserId, role: MembershipRole.OWNER },
      })

      const team = await tenantContext.run(
        { clubId: club.id, userId: claim.claimantUserId },
        async () => {
          const group = await tx.teamGroup.create({
            data: {
              clubId: club.id,
              type: claim.teamGroupType!,
              displayName: groupNameFor(claim.teamGroupType!),
              sortOrder: 0,
            },
          })
          const createdTeam = await tx.team.create({
            data: {
              clubId: club.id,
              groupId: group.id,
              name: claim.teamName!,
              displayName: buildTeamDisplayName(group.displayName, null, claim.teamName!),
              ageGroup: group.displayName,
            },
          })
          await this.applyTeamRoles(
            tx,
            club.id,
            createdTeam.id,
            claim.claimantUserId,
            claim.requestedTeamRoles,
          )
          if (claim.externalTeamUrl) {
            await tx.externalTeamLink.create({
              data: {
                clubId: club.id,
                teamId: createdTeam.id,
                provider: 'FUSSBALL_PUBLIC_PAGE',
                externalTeamId: createHash('sha256').update(claim.externalTeamUrl).digest('hex'),
                externalUrl: claim.externalTeamUrl,
                label: claim.teamName!,
                status: 'NEEDS_REVIEW',
              },
            })
          }
          return createdTeam
        },
      )

      const trialDefinition = await tx.planDefinition.findFirst({
        where: { tier: 'PRO', interval: 'TWELVE_MONTHS', publishedAt: { not: null } },
        orderBy: [{ version: 'desc' }, { publishedAt: 'desc' }],
      })
      if (!trialDefinition) {
        throw new ConflictException('No published PRO plan is available for the trial')
      }
      await tx.entitlementGrant.create({
        data: {
          clubId: club.id,
          tier: 'PRO',
          source: 'TRIAL',
          status: 'ACTIVE',
          startsAt: new Date(),
          expiresAt: addDays(new Date(), 30),
          reason: 'First verified club trial',
          createdById: reviewerId,
          planDefinitionId: trialDefinition.id,
        },
      })
      const updatedClaim = await tx.clubClaim.update({
        where: { id: claim.id },
        data: {
          clubId: club.id,
          status: ClubClaimStatus.APPROVED,
          reviewerId,
          reviewNote: input.note ?? null,
          reviewedAt: new Date(),
        },
      })
      await tx.auditLog.create({
        data: {
          clubId: club.id,
          type: 'club.claim_approved',
          actorType: 'admin',
          actorId: reviewerId,
          actorLabel: null,
          summary: `First club claim approved for ${club.name}`,
        },
      })
      return { claim: updatedClaim, club, team }
    })

    // Activation is already durable. Provisioning is idempotent and must not
    // turn a successful authority decision into a misleading 500 response.
    await Promise.allSettled([
      this.channels.ensureClubChannels(result.club.id),
      this.channels.ensureTeamChannels(result.club.id, result.team.id),
    ])
    return result
  }

  async reviewStaffRequest(
    reviewerId: string,
    clubId: string,
    claimId: string,
    input: ReviewClubClaimInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`claim:${claimId}`}))`
      // Lock the reviewer's membership row so a concurrent demotion/removal or
      // ownership transfer is ordered before or after this decision—not between
      // authorization and mutation.
      await tx.$queryRaw`
        SELECT "id" FROM "Membership"
        WHERE "userId" = ${reviewerId} AND "clubId" = ${clubId}
        FOR UPDATE
      `
      const reviewer = await tx.membership.findUnique({
        where: { userId_clubId: { userId: reviewerId, clubId } },
        select: { role: true },
      })
      if (!reviewer || !['OWNER', 'ADMIN'].includes(reviewer.role)) {
        throw new ForbiddenException(
          'Only club owners and administrators can review staff access',
        )
      }
      const claim = await tx.clubClaim.findUnique({ where: { id: claimId } })
      this.assertReviewableClaim(claim, ClubClaimKind.STAFF_CLAIM, clubId)
      if (claim.claimantUserId === reviewerId) {
        throw new ForbiddenException('You cannot approve your own staff request')
      }
      if (claim.desiredRole === MembershipRole.ADMIN && reviewer.role !== MembershipRole.OWNER) {
        throw new ForbiddenException('Only the club owner can approve another administrator')
      }

      if (input.decision !== 'APPROVE') {
        const updatedClaim = await tx.clubClaim.update({
          where: { id: claim.id },
          data: {
            status:
              input.decision === 'REJECT'
                ? ClubClaimStatus.REJECTED
                : ClubClaimStatus.NEEDS_INFO,
            reviewerId,
            reviewNote: input.note ?? null,
            reviewedAt: new Date(),
          },
        })
        await tx.auditLog.create({
          data: {
            clubId,
            type: 'club.claim_reviewed',
            actorType: 'user',
            actorId: reviewerId,
            actorLabel: null,
            summary:
              input.decision === 'REJECT'
                ? 'Staff access claim rejected.'
                : 'More information requested for staff access claim.',
            metadata: { claimId, decision: input.decision },
          },
        })
        return updatedClaim
      }

      const requestedTeams = await tx.team.findMany({
        where: { clubId, id: { in: claim.requestedTeamIds } },
        select: { id: true },
      })
      if (requestedTeams.length !== new Set(claim.requestedTeamIds).size) {
        throw new ConflictException('One or more requested teams no longer exist')
      }

      if (claim.requestedTeamRoles.includes(TeamRole.PLAYER)) {
        await this.entitlements.assertCanActivatePlayer(clubId, claim.claimantUserId, tx)
      }

      await tx.membership.upsert({
        where: { userId_clubId: { userId: claim.claimantUserId, clubId } },
        create: { userId: claim.claimantUserId, clubId, role: claim.desiredRole },
        update: { role: claim.desiredRole },
      })
      await tenantContext.run({ clubId, userId: reviewerId }, async () => {
        for (const team of requestedTeams) {
          await this.applyTeamRoles(
            tx,
            clubId,
            team.id,
            claim.claimantUserId,
            claim.requestedTeamRoles.length > 0
              ? claim.requestedTeamRoles
              : claim.desiredRole === MembershipRole.COACH
                ? [TeamRole.ASSISTANT_COACH]
                : [],
          )
        }
      })
      const updatedClaim = await tx.clubClaim.update({
        where: { id: claim.id },
        data: {
          status: ClubClaimStatus.APPROVED,
          reviewerId,
          reviewNote: input.note ?? null,
          reviewedAt: new Date(),
        },
      })
      await tx.auditLog.create({
        data: {
          clubId,
          type: 'club.staff_access_approved',
          actorType: 'user',
          actorId: reviewerId,
          actorLabel: null,
          summary: `Staff access approved for ${claim.claimantUserId}`,
          metadata: { claimId, claimantUserId: claim.claimantUserId },
        },
      })
      return updatedClaim
    })
  }

  async withdraw(userId: string, claimId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`claim:${claimId}`}))`
      const result = await tx.clubClaim.updateMany({
        where: {
          id: claimId,
          claimantUserId: userId,
          status: { in: [ClubClaimStatus.SUBMITTED, ClubClaimStatus.NEEDS_INFO] },
        },
        data: { status: ClubClaimStatus.WITHDRAWN },
      })
      if (result.count !== 1) throw new NotFoundException('Active claim not found')
      const claim = await tx.clubClaim.findUniqueOrThrow({ where: { id: claimId } })
      await tx.auditLog.create({
        data: {
          clubId: claim.clubId,
          type: 'club.claim_withdrawn',
          actorType: 'user',
          actorId: userId,
          actorLabel: null,
          summary: 'Club authority claim withdrawn.',
          metadata: { claimId },
        },
      })
      return { withdrawn: true }
    })
  }

  async respondToInformationRequest(
    actor: { id: string; email: string | null },
    claimId: string,
    input: RespondClubClaimInput,
  ) {
    const officialEmail = input.officialEmail?.toLowerCase()
    if (officialEmail && (!actor.email || actor.email.trim().toLowerCase() !== officialEmail)) {
      throw new BadRequestException(
        'Official email evidence must match the authenticated account email',
      )
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`claim:${claimId}`}))`
      const claim = await tx.clubClaim.findUnique({ where: { id: claimId } })
      if (
        !claim ||
        claim.claimantUserId !== actor.id ||
        claim.status !== ClubClaimStatus.NEEDS_INFO ||
        claim.expiresAt <= new Date()
      ) {
        throw new NotFoundException('Information request is no longer available')
      }
      if (input.note) {
        await tx.clubClaimEvidence.create({
          data: {
            claimId,
            submittedById: actor.id,
            type: 'PUBLIC_CLUB_CONTACT',
            value: input.note,
          },
        })
      }
      if (officialEmail) {
        await tx.clubClaimEvidence.create({
          data: {
            claimId,
            submittedById: actor.id,
            type: 'OFFICIAL_EMAIL',
            value: officialEmail,
          },
        })
      }
      const updatedClaim = await tx.clubClaim.update({
        where: { id: claimId },
        data: {
          status: ClubClaimStatus.SUBMITTED,
          reviewerId: null,
          reviewedAt: null,
        },
      })
      await tx.auditLog.create({
        data: {
          clubId: claim.clubId,
          type: 'club.claim_information_submitted',
          actorType: 'user',
          actorId: actor.id,
          actorLabel: null,
          summary: 'Additional club authority evidence submitted.',
          metadata: { claimId },
        },
      })
      return updatedClaim
    })
  }

  async startOwnershipTransfer(
    actor: { id: string; authenticatedAt?: number },
    clubId: string,
    input: CreateOwnershipTransferInput,
  ) {
    this.assertRecentSession(actor)
    if (actor.id === input.toUserId) throw new BadRequestException('Choose another club member')
    const owner = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId: actor.id, clubId } },
      select: { role: true },
    })
    if (owner?.role !== MembershipRole.OWNER) {
      throw new ForbiddenException('Only the current club owner can transfer ownership')
    }
    const target = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId: input.toUserId, clubId } },
    })
    if (!target) throw new BadRequestException('New owner must already belong to the club')
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`owner:${clubId}`}))`
      const currentOwner = await tx.membership.findFirst({
        where: { clubId, role: MembershipRole.OWNER },
        select: { userId: true },
      })
      if (currentOwner?.userId !== actor.id) {
        throw new ConflictException('Club ownership changed before this transfer was created')
      }
      const frozen = await tx.clubDispute.findFirst({
        where: { clubId, status: { in: ['OPEN', 'FROZEN'] } },
        select: { id: true },
      })
      if (frozen) throw new ConflictException('Ownership changes are frozen during an open dispute')
      await tx.ownershipTransfer.updateMany({
        where: { clubId, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      })
      const transfer = await tx.ownershipTransfer.create({
        data: {
          clubId,
          fromUserId: actor.id,
          toUserId: input.toUserId,
          expiresAt: new Date(Date.now() + OWNERSHIP_TRANSFER_TTL_HOURS * 60 * 60 * 1000),
        },
      })
      await tx.auditLog.create({
        data: {
          clubId,
          type: 'club.ownership_transfer_started',
          actorType: 'user',
          actorId: actor.id,
          actorLabel: null,
          summary: 'Club ownership transfer started.',
          metadata: { transferId: transfer.id, toUserId: input.toUserId },
        },
      })
      return transfer
    })
  }

  async acceptOwnershipTransfer(
    actor: { id: string; authenticatedAt?: number },
    transferId: string,
  ) {
    this.assertRecentSession(actor)
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.ownershipTransfer.findUnique({ where: { id: transferId } })
      if (!initial || initial.toUserId !== actor.id || initial.status !== 'PENDING') {
        throw new NotFoundException('Pending ownership transfer not found')
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`owner:${initial.clubId}`}))`
      const transfer = await tx.ownershipTransfer.findUnique({ where: { id: transferId } })
      if (!transfer || transfer.status !== 'PENDING' || transfer.expiresAt <= new Date()) {
        throw new ConflictException('Ownership transfer has expired or changed')
      }
      const frozen = await tx.clubDispute.findFirst({
        where: { clubId: transfer.clubId, status: { in: ['OPEN', 'FROZEN'] } },
        select: { id: true },
      })
      if (frozen) {
        throw new ConflictException('Ownership changes are frozen during an open dispute')
      }
      const currentOwner = await tx.membership.findFirst({
        where: { clubId: transfer.clubId, role: MembershipRole.OWNER },
      })
      if (!currentOwner || currentOwner.userId !== transfer.fromUserId) {
        throw new ConflictException('Club ownership changed before this transfer was accepted')
      }
      await tx.membership.update({
        where: { id: currentOwner.id },
        data: { role: MembershipRole.ADMIN },
      })
      await tx.membership.update({
        where: { userId_clubId: { userId: actor.id, clubId: transfer.clubId } },
        data: { role: MembershipRole.OWNER },
      })
      const accepted = await tx.ownershipTransfer.update({
        where: { id: transfer.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      })
      await tx.auditLog.create({
        data: {
          clubId: transfer.clubId,
          type: 'club.ownership_transfer_accepted',
          actorType: 'user',
          actorId: actor.id,
          actorLabel: null,
          summary: 'Club ownership transfer accepted.',
          metadata: { transferId: transfer.id, fromUserId: transfer.fromUserId },
        },
      })
      return accepted
    })
  }

  async listOwnershipTransfersForUser(userId: string) {
    return this.prisma.ownershipTransfer.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { gt: new Date() },
        OR: [{ fromUserId: userId }, { toUserId: userId }],
      },
      include: {
        club: { select: { id: true, name: true, badgeUrl: true } },
        fromUser: { select: { id: true, name: true, email: true } },
        toUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async cancelOwnershipTransfer(
    actor: { id: string; authenticatedAt?: number },
    transferId: string,
  ) {
    this.assertRecentSession(actor)
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.ownershipTransfer.findFirst({
        where: { id: transferId, fromUserId: actor.id, status: 'PENDING' },
      })
      if (!transfer) throw new NotFoundException('Pending ownership transfer not found')
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`owner:${transfer.clubId}`}))`
      const result = await tx.ownershipTransfer.updateMany({
        where: { id: transferId, fromUserId: actor.id, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      })
      if (result.count !== 1) throw new NotFoundException('Pending ownership transfer not found')
      await tx.auditLog.create({
        data: {
          clubId: transfer.clubId,
          type: 'club.ownership_transfer_cancelled',
          actorType: 'user',
          actorId: actor.id,
          actorLabel: null,
          summary: 'Club ownership transfer cancelled.',
          metadata: { transferId },
        },
      })
      return { cancelled: true }
    })
  }

  listPlatformDisputes() {
    return this.prisma.clubDispute.findMany({
      include: { club: { select: { id: true, name: true, slug: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    })
  }

  async openPlatformDispute(actorId: string, input: OpenClubDisputeInput) {
    const club = await this.prisma.club.findUnique({ where: { id: input.clubId } })
    if (!club) throw new NotFoundException('Club not found')
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`owner:${input.clubId}`}))`
      const existing = await tx.clubDispute.findFirst({
        where: { clubId: input.clubId, status: { in: ['OPEN', 'FROZEN'] } },
      })
      if (existing) throw new ConflictException('This club already has an open dispute')
      const dispute = await tx.clubDispute.create({
        data: {
          clubId: input.clubId,
          openedById: actorId,
          reason: input.reason,
          status: input.freezeOwnership ? 'FROZEN' : 'OPEN',
        },
      })
      await tx.auditLog.create({
        data: {
          clubId: input.clubId,
          type: 'club.ownership_dispute_opened',
          actorType: 'admin',
          actorId,
          actorLabel: null,
          summary: 'Ownership dispute opened.',
          metadata: { disputeId: dispute.id, frozen: input.freezeOwnership },
        },
      })
      return dispute
    })
  }

  async resolvePlatformDispute(actorId: string, disputeId: string, input: ResolveClubDisputeInput) {
    return this.prisma.$transaction(async (tx) => {
      const dispute = await tx.clubDispute.findUnique({ where: { id: disputeId } })
      if (!dispute) throw new NotFoundException('Open dispute not found')
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`owner:${dispute.clubId}`}))`
      const result = await tx.clubDispute.updateMany({
        where: { id: disputeId, status: { in: ['OPEN', 'FROZEN'] } },
        data: {
          status: 'RESOLVED',
          resolution: input.resolution,
          resolvedById: actorId,
          resolvedAt: new Date(),
        },
      })
      if (result.count !== 1) throw new NotFoundException('Open dispute not found')
      await tx.auditLog.create({
        data: {
          clubId: dispute.clubId,
          type: 'club.ownership_dispute_resolved',
          actorType: 'admin',
          actorId,
          actorLabel: null,
          summary: 'Ownership dispute resolved.',
          metadata: { disputeId },
        },
      })
      return tx.clubDispute.findUniqueOrThrow({ where: { id: disputeId } })
    })
  }

  private async updateReviewState(
    reviewerId: string,
    claimId: string,
    input: ReviewClubClaimInput,
    clubId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`claim:${claimId}`}))`
      const claim = await tx.clubClaim.findFirst({
        where: { id: claimId, ...(clubId ? { clubId } : {}) },
      })
      if (
        !claim ||
        (claim.status !== ClubClaimStatus.SUBMITTED &&
          claim.status !== ClubClaimStatus.NEEDS_INFO) ||
        claim.expiresAt <= new Date()
      ) {
        throw new NotFoundException('Reviewable claim not found')
      }
      const updatedClaim = await tx.clubClaim.update({
        where: { id: claim.id },
        data: {
          status:
            input.decision === 'REJECT'
              ? ClubClaimStatus.REJECTED
              : ClubClaimStatus.NEEDS_INFO,
          reviewerId,
          reviewNote: input.note ?? null,
          reviewedAt: new Date(),
        },
      })
      await tx.auditLog.create({
        data: {
          clubId: claim.clubId,
          type: 'club.claim_reviewed',
          actorType: 'admin',
          actorId: reviewerId,
          actorLabel: null,
          summary:
            input.decision === 'REJECT'
              ? 'Club authority claim rejected.'
              : 'More information requested for club authority claim.',
          metadata: { claimId, decision: input.decision },
        },
      })
      return updatedClaim
    })
  }

  private assertReviewableClaim<
    T extends {
      kind: ClubClaimKind
      clubId: string | null
      status: ClubClaimStatus
      expiresAt: Date
    },
  >(claim: T | null, kind: ClubClaimKind, clubId?: string): asserts claim is T {
    if (
      !claim ||
      claim.kind !== kind ||
      (clubId && claim.clubId !== clubId) ||
      (claim.status !== ClubClaimStatus.SUBMITTED && claim.status !== ClubClaimStatus.NEEDS_INFO) ||
      claim.expiresAt <= new Date()
    ) {
      throw new NotFoundException('Reviewable claim not found')
    }
  }

  private async applyTeamRoles(
    tx: Prisma.TransactionClient,
    clubId: string,
    teamId: string,
    userId: string,
    roles: TeamRole[],
  ) {
    for (const role of [...new Set(roles)]) {
      await tx.teamAccess.upsert({
        where: { teamId_userId_role: { teamId, userId, role } },
        create: {
          clubId,
          teamId,
          userId,
          role,
          phase: TeamAccessPhase.FULL,
          status: TeamAccessStatus.ACTIVE,
        },
        update: {
          phase: TeamAccessPhase.FULL,
          status: TeamAccessStatus.ACTIVE,
          loanedFromTeamId: null,
          loanStartDate: null,
          loanEndDate: null,
        },
      })
      if (role === TeamRole.PLAYER) {
        await tx.teamMember.upsert({
          where: { teamId_userId: { teamId, userId } },
          create: { teamId, userId },
          update: { operationalStatus: 'ACTIVE' },
        })
      }
    }
  }

  private assertRecentSession(actor: { authenticatedAt?: number }) {
    const issuedAt = actor.authenticatedAt
    if (!issuedAt || Math.floor(Date.now() / 1000) - issuedAt > STEP_UP_MAX_AGE_SECONDS) {
      throw new ForbiddenException('Please sign in again before changing club ownership')
    }
  }

  private async resolveDirectoryEntry(input: SubmitFirstClubClaimInput) {
    const entry = await this.prisma.clubDirectoryEntry.findUnique({
      where: { id: input.directoryEntryId },
    })
    if (!entry) throw new NotFoundException('Verified club directory entry not found')
    return entry
  }
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

function withEffectiveClaimStatus<
  T extends { status: ClubClaimStatus; expiresAt: Date },
>(claim: T): T {
  if (
    claim.expiresAt <= new Date() &&
    (claim.status === ClubClaimStatus.SUBMITTED || claim.status === ClubClaimStatus.NEEDS_INFO)
  ) {
    return { ...claim, status: ClubClaimStatus.EXPIRED }
  }
  return claim
}

function groupNameFor(type: TeamGroupType) {
  if (type === TeamGroupType.YOUTH) return 'Jugend'
  if (type === TeamGroupType.MINI) return 'Bambini'
  if (type === TeamGroupType.CUSTOM) return 'Team'
  return 'Herren'
}
