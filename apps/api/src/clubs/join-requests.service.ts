import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { PushService } from '../push/push.service'
import { CacheService } from '../cache/cache.service'
import {
  JoinRequestStatus,
  MembershipRole,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamRole,
} from '@anstoss/shared'
import type { CreateJoinRequestInput, ReviewJoinRequestInput } from '@anstoss/shared'

@Injectable()
export class JoinRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly push: PushService,
    private readonly cache: CacheService,
  ) {}

  async create(userId: string, clubId: string, input: CreateJoinRequestInput) {
    const existing = await this.prisma.joinRequest.findUnique({
      where: { clubId_userId: { clubId, userId } },
    })

    if (existing) {
      if (existing.status === JoinRequestStatus.PENDING) {
        throw new ConflictException('You already have a pending request for this club')
      }
      if (existing.status === JoinRequestStatus.APPROVED) {
        throw new ConflictException('You are already a member of this club')
      }
    }

    const club = await this.prisma.club.findUnique({ where: { id: clubId } })
    if (!club) {
      throw new NotFoundException('Club not found')
    }

    if (input.teamId) {
      const team = await this.prisma.team.findFirst({
        where: { id: input.teamId, clubId },
        select: { id: true },
      })
      if (!team) {
        throw new BadRequestException('Team does not belong to this club')
      }
    }

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

    const request = existing
      ? await this.reopenReviewedRequest(existing.id, requestData)
      : await this.createNewRequest(clubId, userId, requestData)

    await this.audit.log({
      clubId,
      type: 'join_request.created',
      actorType: 'user',
      actorId: userId,
      actorLabel: null,
      summary: `Join request created for club ${club.name}`,
    })

    // Push notification to club admins/coaches
    const admins = await this.prisma.membership.findMany({
      where: {
        clubId,
        role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.COACH] },
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

  private async createNewRequest(
    clubId: string,
    userId: string,
    data: {
      role: TeamRole
      teamId: string | null
      message: string | null
      status: JoinRequestStatus
      reviewedBy: null
      reviewedAt: null
    },
  ) {
    try {
      return await this.prisma.joinRequest.create({
        data: {
          clubId,
          userId,
          ...data,
        },
      })
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('You already have a request for this club')
      }
      throw error
    }
  }

  private async reopenReviewedRequest(
    requestId: string,
    data: {
      role: TeamRole
      teamId: string | null
      message: string | null
      status: JoinRequestStatus
      reviewedBy: null
      reviewedAt: null
    },
  ) {
    const result = await this.prisma.joinRequest.updateMany({
      where: {
        id: requestId,
        status: { notIn: [JoinRequestStatus.PENDING, JoinRequestStatus.APPROVED] },
      },
      data,
    })

    if (result.count !== 1) {
      throw new ConflictException('You already have a request for this club')
    }

    return this.prisma.joinRequest.findUniqueOrThrow({
      where: { id: requestId },
    })
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

  async approve(
    clubId: string,
    requestId: string,
    reviewerId: string,
    _input: ReviewJoinRequestInput,
  ) {
    const request = await this.prisma.joinRequest.findFirst({
      where: { id: requestId, clubId, status: 'PENDING' },
    })

    if (!request) {
      throw new NotFoundException('Join request not found or already reviewed')
    }

    const membershipRole =
      request.role === TeamRole.PARENT
        ? MembershipRole.PARENT
        : MembershipRole.PLAYER

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.joinRequest.updateMany({
        where: { id: requestId, clubId, status: 'PENDING' },
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
            phase: TeamAccessPhase.TRIAL,
            status: TeamAccessStatus.ACTIVE,
          },
          update: {},
        })

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

    })

    await this.audit.log({
      clubId,
      type: 'join_request.approved',
      actorType: 'user',
      actorId: reviewerId,
      actorLabel: null,
      summary: `Approved join request ${requestId}`,
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
    const request = await this.prisma.joinRequest.findFirst({
      where: { id: requestId, clubId, status: 'PENDING' },
    })

    if (!request) {
      throw new NotFoundException('Join request not found or already reviewed')
    }

    const claimed = await this.prisma.joinRequest.updateMany({
      where: { id: requestId, clubId, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      },
    })

    if (claimed.count !== 1) {
      throw new NotFoundException('Join request not found or already reviewed')
    }

    await this.audit.log({
      clubId,
      type: 'join_request.rejected',
      actorType: 'user',
      actorId: reviewerId,
      actorLabel: null,
      summary: `Rejected join request ${requestId}${input.reason ? `: ${input.reason}` : ''}`,
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

  async sendReminder(userId: string, clubId: string, requestId: string) {
    const request = await this.prisma.joinRequest.findFirst({
      where: { id: requestId, clubId, userId, status: JoinRequestStatus.PENDING },
      include: { club: { select: { name: true } } },
    })
    if (!request) {
      throw new NotFoundException('Join request not found')
    }

    const cooldownKey = `join-request-reminder:${requestId}`
    const existing = await this.cache.get(cooldownKey)
    if (existing) {
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

    await this.cache.set(cooldownKey, '1', 'EX', 5 * 60)
  }
}

function isUniqueConstraintError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2002'
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  )
}
