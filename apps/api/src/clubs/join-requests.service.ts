import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
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
        throw new BadRequestException('You already have a pending request for this club')
      }
      if (existing.status === JoinRequestStatus.APPROVED) {
        throw new BadRequestException('You are already a member of this club')
      }
    }

    const club = await this.prisma.club.findUnique({ where: { id: clubId } })
    if (!club) {
      throw new NotFoundException('Club not found')
    }

    const request = await this.prisma.joinRequest.upsert({
      where: { clubId_userId: { clubId, userId } },
      create: {
        clubId,
        userId,
        role: input.role === 'PARENT' ? TeamRole.PARENT : TeamRole.PLAYER,
        teamId: input.teamId || null,
        message: input.message?.trim() || null,
        status: 'PENDING',
      },
      update: {
        role: input.role === 'PARENT' ? TeamRole.PARENT : TeamRole.PLAYER,
        teamId: input.teamId || null,
        message: input.message?.trim() || null,
        status: 'PENDING',
        reviewedBy: null,
        reviewedAt: null,
      },
    })

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
      void this.push.sendToUser(
        admin.userId,
        'Neue Beitrittsanfrage',
        `${user?.name || 'Jemand'} möchte ${club.name} beitreten`,
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

      // Update join request status
      await tx.joinRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
        },
      })
    })

    await this.audit.log({
      clubId,
      type: 'join_request.approved',
      actorType: 'user',
      actorId: reviewerId,
      actorLabel: null,
      summary: `Approved join request ${requestId}`,
    })

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

    await this.prisma.joinRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      },
    })

    await this.audit.log({
      clubId,
      type: 'join_request.rejected',
      actorType: 'user',
      actorId: reviewerId,
      actorLabel: null,
      summary: `Rejected join request ${requestId}${input.reason ? `: ${input.reason}` : ''}`,
    })

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
        this.push.sendToUser(
          admin.userId,
          'Join request reminder',
          `Someone is waiting for approval to join ${request.club.name}.`,
          { type: 'JOIN_REQUEST_REMINDER', clubId, requestId },
          { clubId },
        ),
      ),
    )

    await this.cache.set(cooldownKey, '1', 'EX', 5 * 60)
  }
}
