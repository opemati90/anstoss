import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { PushService } from '../push/push.service'
import { CacheService } from '../cache/cache.service'
import {
  getAge,
  JoinRequestStatus,
  MembershipRole,
  ParentalConsentStatus,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamRole,
} from '@anstoss/shared'
import type { CreateJoinRequestInput, ReviewJoinRequestInput } from '@anstoss/shared'
import { ClubEntitlementsService } from '../billing/club-entitlements.service'

@Injectable()
export class JoinRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly push: PushService,
    private readonly cache: CacheService,
    private readonly clubEntitlements?: ClubEntitlementsService,
  ) {}

  async create(userId: string, clubId: string, input: CreateJoinRequestInput) {
    const requestData = {
      // Club-search join requests are PLAYER-only. Coaches use team codes;
      // parents use the child setup handoff. Prevents silent role downgrades.
      role: TeamRole.PLAYER,
      teamId: input.teamId || null,
      message: input.message?.trim() || null,
      status: JoinRequestStatus.PENDING,
      reviewedBy: null,
      reviewedAt: null,
    }

    let created: { request: any; club: { id: string; name: string } }
    try {
      created = await this.prisma.$transaction(async (tx) => {
        await this.lockActiveUser(tx, userId)
        await this.lockJoinRequestUser(tx, clubId, userId)
        let existing = await tx.joinRequest.findUnique({
          where: { clubId_userId: { clubId, userId } },
        })
        if (existing) {
          await this.lockJoinRequest(tx, existing.id)
          existing = await tx.joinRequest.findUnique({
            where: { clubId_userId: { clubId, userId } },
          })
          if (!existing) throw new ConflictException('Join request changed. Try again')
          if (existing.status === JoinRequestStatus.PENDING) {
            throw new ConflictException('You already have a pending request for this club')
          }
          if (existing.status === JoinRequestStatus.APPROVED) {
            throw new ConflictException('You are already a member of this club')
          }
        }

        const club = await tx.club.findUnique({ where: { id: clubId } })
        if (!club) throw new NotFoundException('Club not found')
        if (input.teamId) {
          const team = await tx.team.findFirst({
            where: { id: input.teamId, clubId },
            select: { id: true },
          })
          if (!team) throw new BadRequestException('Team does not belong to this club')
        }

        const request = existing
          ? await tx.joinRequest.update({
              where: { id: existing.id },
              data: { ...requestData, revision: { increment: 1 } },
            })
          : await tx.joinRequest.create({ data: { clubId, userId, ...requestData } })
        await tx.auditLog.create({
          data: {
            clubId,
            type: 'join_request.created',
            actorType: 'user',
            actorId: userId,
            actorLabel: null,
            summary: `Join request created for club ${club.name}`,
            metadata: { requestId: request.id, teamId: request.teamId },
          },
        })
        return { request, club }
      })
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('You already have a request for this club')
      }
      throw error
    }
    const { request, club } = created

    // Push notification only to the club authorities who can decide it.
    const admins = await this.prisma.membership.findMany({
      where: {
        clubId,
        role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] },
      },
      select: { userId: true },
    })

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    })

    for (const admin of admins) {
      void this.push.sendToUserLocalized(
        admin.userId,
        'JOIN_REQUEST',
        { userName: user?.name || 'Jemand', clubName: club.name },
        { type: 'join_request', clubId, requestId: request.id },
        { clubId },
      )
    }

    return request
  }

  async listPending(clubId: string) {
    return this.prisma.joinRequest.findMany({
      where: { clubId, status: 'PENDING' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findMyActive(userId: string) {
    return this.prisma.joinRequest.findFirst({
      where: { userId, status: 'PENDING' },
      include: {
        club: {
          select: {
            id: true,
            name: true,
            slug: true,
            badgeUrl: true,
            primaryColor: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async withdraw(userId: string, clubId: string, requestId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockJoinRequest(tx, requestId)
      const request = await tx.joinRequest.findFirst({
        where: { id: requestId, clubId, userId, status: JoinRequestStatus.PENDING },
        select: { id: true },
      })
      if (!request) throw new NotFoundException('Pending join request not found')
      const updated = await tx.joinRequest.updateMany({
        where: { id: requestId, clubId, userId, status: JoinRequestStatus.PENDING },
        data: {
          status: JoinRequestStatus.WITHDRAWN,
          reviewedBy: userId,
          reviewedAt: new Date(),
        },
      })
      if (updated.count !== 1) throw new ConflictException('Join request already changed')
      await tx.auditLog.create({
        data: {
          clubId,
          type: 'join_request.withdrawn',
          actorType: 'user',
          actorId: userId,
          actorLabel: null,
          summary: 'Member withdrew a pending join request.',
          metadata: { requestId },
        },
      })
      return { withdrawn: true }
    })
  }

  async approve(
    clubId: string,
    requestId: string,
    reviewerId: string,
    _input: ReviewJoinRequestInput,
  ) {
    const request = await this.prisma.$transaction(async (tx) => {
      let request = await tx.joinRequest.findFirst({
        where: {
          id: requestId,
          clubId,
          status: JoinRequestStatus.PENDING,
          revision: _input.revision,
        },
      })
      if (!request) throw new NotFoundException('Join request not found or already reviewed')
      await this.lockActiveUser(tx, request.userId)
      await this.lockJoinRequest(tx, requestId)
      request = await tx.joinRequest.findFirst({
        where: {
          id: requestId,
          clubId,
          status: JoinRequestStatus.PENDING,
          revision: _input.revision,
        },
      })
      if (!request) throw new NotFoundException('Join request not found or already reviewed')
      const membershipRole =
        request.role === TeamRole.PARENT
          ? MembershipRole.PARENT
          : request.role === TeamRole.HEAD_COACH || request.role === TeamRole.ASSISTANT_COACH
            ? MembershipRole.COACH
            : MembershipRole.PLAYER
      if (request.role === TeamRole.PLAYER) {
        const player = await tx.user.findUnique({
          where: { id: request.userId },
          select: { dateOfBirth: true },
        })
        if (!player?.dateOfBirth) {
          throw new BadRequestException('Player date of birth is required before approval')
        }
        if (getAge(player.dateOfBirth) < 16) {
          if (!request.teamId) {
            throw new BadRequestException('Players under 16 must request access to a specific team')
          }
          const approvedConsent = await tx.parentalConsent.findFirst({
            where: {
              playerUserId: request.userId,
              clubId,
              teamId: request.teamId,
              status: ParentalConsentStatus.APPROVED,
            },
            select: { id: true },
          })
          if (!approvedConsent) {
            throw new BadRequestException(
              'Guardian approval is required before approving this player',
            )
          }
        }
        await this.requireEntitlements().assertCanActivatePlayer(clubId, request.userId, tx)
      }
      // All player-activation paths acquire the club quota lock before
      // Membership rows. Preserve that global order to avoid a quota ↔
      // membership deadlock with invite redemption.
      await this.assertReviewerCanDecide(tx, clubId, reviewerId, request.userId)
      const claimed = await tx.joinRequest.updateMany({
        where: {
          id: requestId,
          clubId,
          status: 'PENDING',
          revision: _input.revision,
        },
        data: {
          status: 'APPROVED',
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
        },
      })

      if (claimed.count !== 1) {
        throw new NotFoundException('Join request not found or already reviewed')
      }

      // Create membership
      await tx.membership.upsert({
        where: {
          userId_clubId: { userId: request.userId, clubId },
        },
        create: {
          userId: request.userId,
          clubId,
          role: membershipRole,
        },
        update: {},
      })

      // Create team access if team was specified
      if (request.teamId) {
        const team = await tx.team.findFirst({
          where: { id: request.teamId, clubId },
          select: { id: true },
        })
        if (!team) {
          throw new BadRequestException('Join request team does not belong to this club')
        }

        await tx.teamAccess.upsert({
          where: {
            teamId_userId_role: {
              teamId: request.teamId,
              userId: request.userId,
              role: request.role,
            },
          },
          create: {
            clubId,
            teamId: request.teamId,
            userId: request.userId,
            role: request.role,
            phase: request.role === TeamRole.PLAYER ? TeamAccessPhase.TRIAL : TeamAccessPhase.FULL,
            status: TeamAccessStatus.ACTIVE,
          },
          update: {},
        })

        if (request.role === TeamRole.PLAYER) {
          await tx.teamMember.upsert({
            where: {
              teamId_userId: {
                teamId: request.teamId,
                userId: request.userId,
              },
            },
            create: {
              teamId: request.teamId,
              userId: request.userId,
            },
            update: {},
          })
        }
      }
      await tx.auditLog.create({
        data: {
          clubId,
          type: 'join_request.approved',
          actorType: 'user',
          actorId: reviewerId,
          actorLabel: null,
          summary: `Approved join request ${requestId}`,
          metadata: { requestId, userId: request.userId, teamId: request.teamId },
        },
      })
      return request
    })

    // Welcome the approved user with a localized push.
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { name: true },
    })
    void this.push.sendToUserLocalized(
      request.userId,
      'JOIN_APPROVED',
      { clubName: club?.name ?? '' },
      { type: 'join_approved', clubId },
      { clubId },
    )

    return { status: 'APPROVED' }
  }

  async reject(
    clubId: string,
    requestId: string,
    reviewerId: string,
    input: ReviewJoinRequestInput,
  ) {
    const request = await this.prisma.$transaction(async (tx) => {
      await this.lockJoinRequest(tx, requestId)
      const request = await tx.joinRequest.findFirst({
        where: {
          id: requestId,
          clubId,
          status: JoinRequestStatus.PENDING,
          revision: input.revision,
        },
      })
      if (!request) throw new NotFoundException('Join request not found or already reviewed')
      await this.assertReviewerCanDecide(tx, clubId, reviewerId)
      const updated = await tx.joinRequest.updateMany({
        where: {
          id: request.id,
          clubId,
          status: JoinRequestStatus.PENDING,
          revision: input.revision,
        },
        data: {
          status: JoinRequestStatus.REJECTED,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
        },
      })
      if (updated.count !== 1) {
        throw new ConflictException('Join request changed. Refresh and review it again')
      }
      await tx.auditLog.create({
        data: {
          clubId,
          type: 'join_request.rejected',
          actorType: 'user',
          actorId: reviewerId,
          actorLabel: null,
          summary: `Rejected join request ${requestId}${input.reason ? `: ${input.reason}` : ''}`,
          metadata: { requestId, userId: request.userId, reason: input.reason ?? null },
        },
      })
      return request
    })

    // Notify the requester that their request was not accepted.
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { name: true },
    })
    void this.push.sendToUserLocalized(
      request.userId,
      'JOIN_REJECTED',
      { clubName: club?.name ?? '' },
      { type: 'join_rejected', clubId },
      { clubId },
    )

    return { status: 'REJECTED' }
  }

  private lockJoinRequest(tx: Prisma.TransactionClient, requestId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`join-request:${requestId}`}))`
  }

  private lockJoinRequestUser(tx: Prisma.TransactionClient, clubId: string, userId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`join-request-user:${clubId}:${userId}`}))`
  }

  private async lockActiveUser(tx: Prisma.TransactionClient, userId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
    const user = await tx.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    })
    if (!user) {
      throw new ConflictException('This account is no longer active')
    }
  }

  private async assertReviewerCanDecide(
    tx: Prisma.TransactionClient,
    clubId: string,
    reviewerId: string,
    targetUserId?: string,
  ) {
    const userIds = Array.from(
      new Set([reviewerId, targetUserId].filter(Boolean) as string[]),
    ).sort()
    const rows = await tx.$queryRaw<Array<{ userId: string; role: MembershipRole }>>`
      SELECT "userId", "role"::text AS "role"
      FROM "Membership"
      WHERE "clubId" = ${clubId} AND "userId" IN (${Prisma.join(userIds)})
      ORDER BY "userId"
      FOR UPDATE
    `
    const role = rows.find((row) => row.userId === reviewerId)?.role
    if (role !== MembershipRole.OWNER && role !== MembershipRole.ADMIN) {
      throw new NotFoundException('Join request not found or reviewer access changed')
    }
  }

  async sendReminder(userId: string, clubId: string, requestId: string) {
    const request = await this.prisma.joinRequest.findFirst({
      where: { id: requestId, clubId, userId, status: JoinRequestStatus.PENDING },
      include: { club: { select: { name: true } } },
    })
    if (!request) {
      throw new NotFoundException('Join request not found')
    }

    const cooldownKey = `join-request-reminder:${requestId}`
    const reserved = await this.cache.reserve(cooldownKey, userId, 5 * 60)
    if (!reserved) {
      throw new BadRequestException('You already sent a reminder in the last 5 minutes')
    }

    const admins = await this.prisma.membership.findMany({
      where: {
        clubId,
        role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] },
      },
      select: { userId: true },
    })

    await Promise.all(
      admins.map((admin) =>
        this.push.sendToUserLocalized(
          admin.userId,
          'JOIN_REQUEST_REMINDER',
          { clubName: request.club.name },
          { type: 'JOIN_REQUEST_REMINDER', clubId, requestId },
          { clubId },
        ),
      ),
    )
    await this.audit.log({
      clubId,
      type: 'join_request.reminder_sent',
      actorType: 'user',
      actorId: userId,
      actorLabel: null,
      summary: `Reminder sent for join request ${requestId}`,
      metadata: { requestId },
    })
  }

  private requireEntitlements() {
    if (!this.clubEntitlements) {
      throw new ServiceUnavailableException('Player-seat enforcement is unavailable')
    }
    return this.clubEntitlements
  }
}

function isUniqueConstraintError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === 'P2002'
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  )
}
