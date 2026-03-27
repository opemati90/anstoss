import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
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
}
