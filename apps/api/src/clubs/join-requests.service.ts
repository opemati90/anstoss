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
import type {
  CreateJoinRequestInput,
  ReviewJoinRequestInput,
  UpdateJoinRequestWechselInput,
} from '@anstoss/shared'
import { ClubEntitlementsService } from '../billing/club-entitlements.service'
import { assertTeamInScope, resolveTrialScope } from '../marketplace/trial-scope'
import { JOIN_REQUEST_PII_ERASURE } from '../marketplace/trial-access'
import { lockPlayerTeamAccess } from '../teams/guardian-team-access'
import { tenantContext } from '../prisma/tenant.context'
import { resolveLocale } from '../i18n/translations'
import { sendEmail } from '../email/mailer'
import { buildAufnahmeGuardianEmail } from './aufnahme-guardian-email'

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
    // Club-search join requests are PLAYER or PARENT. Coaches go through staff
    // access requests. A parent request was previously stored as PLAYER, so an
    // approval turned the parent into a squad player; the role is now kept.
    const requestedRole =
      input.role === 'PARENT' && !input.trialInviteId ? TeamRole.PARENT : TeamRole.PLAYER
    const requestData: Record<string, unknown> = {
      role: requestedRole,
      teamId: input.teamId || null,
      message: input.message?.trim() || null,
      status: JoinRequestStatus.PENDING,
      reviewedBy: null,
      reviewedAt: null,
      ...aufnahmeantragData(input),
    }

    let created: {
      request: any
      club: { id: string; name: string }
      guardianConsent: { id: string; teamId: string; guardianEmail: string } | null
    }
    try {
      created = await this.prisma.$transaction(async (tx) => {
        await this.lockActiveUser(tx, userId)
        await this.lockJoinRequestUser(tx, clubId, userId)
        // Players always join with a date of birth (age gate, youth teams,
        // consent), like invite and team-code joins. The 16+ self-declaration
        // is for parents, coaches and admins only.
        const applicant = await tx.user.findUnique({
          where: { id: userId },
          select: { dateOfBirth: true },
        })
        if (!applicant?.dateOfBirth) {
          throw new BadRequestException(
            requestedRole === TeamRole.PARENT
              ? 'Add your date of birth in your profile before asking to join a club as a parent'
              : 'Add your date of birth in your profile before asking to join a club as a player',
          )
        }
        // Guardians must be adults (B2): a child cannot join as their own parent.
        if (requestedRole === TeamRole.PARENT && getAge(applicant.dateOfBirth) < 18) {
          throw new BadRequestException({
            code: 'GUARDIAN_UNDER_18',
            message: 'Parents and guardians must be at least 18',
          })
        }
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
        let guardianConsent: { id: string; teamId: string; guardianEmail: string } | null = null
        if (input.trialInviteId) {
          // Aufnahmeantrag after a Probetraining offer: bound to the offered
          // team, and the offer must still stand and belong to the caller.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trial-invite:${input.trialInviteId}`}))`
          const offer = await tx.trialInvite.findFirst({
            where: {
              id: input.trialInviteId,
              clubId,
              status: 'OFFERED',
              freeAgentProfile: { userId },
            },
            select: { id: true, teamId: true },
          })
          if (!offer) throw new BadRequestException('This offer is no longer open')
          const { minor } = await assertAufnahmeantragComplete(tx, clubId, userId, input)
          requestData.teamId = offer.teamId
          if (minor) {
            // H4: a child's own ticks never count. The guardian approves the
            // membership + SEPA consent through the parental-consent flow,
            // scoped to this club and team; approval stamps the dates.
            requestData.sepaConsentAt = null
            requestData.parentalConsentAt = null
            guardianConsent = await openGuardianConsent(
              tx,
              clubId,
              offer.teamId,
              userId,
              input.guardianEmail!,
            )
          }
        } else if (input.teamId) {
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
        return { request, club, guardianConsent }
      })
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('You already have a request for this club')
      }
      throw error
    }
    const { request, club, guardianConsent } = created
    if (guardianConsent) {
      await this.notifyGuardian(clubId, userId, guardianConsent).catch(() => undefined)
    }

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
        { type: 'join_request', clubId, requestId: request.id, actorName: user?.name || '' },
        { clubId },
      )
    }

    return request
  }

  /**
   * M2: only what the admin review screen shows (the Aufnahmeantrag facts,
   * address/phone behind its "Details" disclosure). No account email and no
   * exact date of birth: an "under 18" flag stands in for the DOB.
   */
  async listPending(clubId: string) {
    const rows = await this.prisma.joinRequest.findMany({
      where: { clubId, status: 'PENDING' },
      select: {
        id: true,
        clubId: true,
        teamId: true,
        role: true,
        message: true,
        status: true,
        revision: true,
        createdAt: true,
        trialInviteId: true,
        street: true,
        postalCode: true,
        city: true,
        phone: true,
        nationality: true,
        previousClubName: true,
        lastMatchDate: true,
        sepaConsentAt: true,
        parentalConsentAt: true,
        releaseStatus: true,
        passApplicationAt: true,
        eligibleFrom: true,
        user: { select: { id: true, name: true, dateOfBirth: true } },
        trialInvite: {
          select: { id: true, team: { select: { id: true, displayName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((row: any) => ({
      id: row.id,
      clubId: row.clubId,
      teamId: row.teamId ?? null,
      role: row.role,
      message: row.message ?? null,
      status: row.status,
      revision: row.revision,
      createdAt: row.createdAt,
      trialInviteId: row.trialInviteId ?? null,
      street: row.street ?? null,
      postalCode: row.postalCode ?? null,
      city: row.city ?? null,
      phone: row.phone ?? null,
      nationality: row.nationality ?? null,
      previousClubName: row.previousClubName ?? null,
      lastMatchDate: row.lastMatchDate ? row.lastMatchDate.toISOString().slice(0, 10) : null,
      sepaConsentAt: row.sepaConsentAt ?? null,
      parentalConsentAt: row.parentalConsentAt ?? null,
      releaseStatus: row.releaseStatus ?? null,
      passApplicationAt: row.passApplicationAt ? row.passApplicationAt.toISOString().slice(0, 10) : null,
      eligibleFrom: row.eligibleFrom ? row.eligibleFrom.toISOString().slice(0, 10) : null,
      trialInvite: row.trialInvite
        ? {
            id: row.trialInvite.id,
            team: row.trialInvite.team
              ? { id: row.trialInvite.team.id, displayName: row.trialInvite.team.displayName }
              : null,
          }
        : null,
      user: {
        id: row.user.id,
        name: row.user.name,
        isMinor: row.user.dateOfBirth ? getAge(row.user.dateOfBirth) < 18 : false,
      },
    }))
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
          // M2: withdrawing erases the Aufnahmeantrag contact data at once.
          ...JOIN_REQUEST_PII_ERASURE,
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
        const playerAge = getAge(player.dateOfBirth)
        if (request.trialInviteId) {
          // B2: the offer must still stand, inside this transaction.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trial-invite:${request.trialInviteId}`}))`
          const offer = await tx.trialInvite.findFirst({
            where: { id: request.trialInviteId, clubId, status: 'OFFERED' },
            select: { id: true, teamId: true },
          })
          if (!offer || offer.teamId !== request.teamId) {
            throw new ConflictException('The Probetraining offer is no longer open')
          }
          if (playerAge < 18) {
            // H4: membership + SEPA consent of a minor come from a guardian.
            const guardianConsent = await tx.parentalConsent.findFirst({
              where: {
                playerUserId: request.userId,
                clubId,
                teamId: offer.teamId,
                status: ParentalConsentStatus.APPROVED,
              },
              select: { approvedAt: true },
            })
            if (!guardianConsent) {
              throw new BadRequestException(
                'Guardian approval is required before approving this player',
              )
            }
            const consentedAt = guardianConsent.approvedAt ?? new Date()
            await tx.joinRequest.updateMany({
              where: { id: requestId, clubId, status: JoinRequestStatus.PENDING },
              data: { sepaConsentAt: consentedAt, parentalConsentAt: consentedAt },
            })
          }
        }
        if (playerAge < 16) {
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
            phase:
              request.role === TeamRole.PLAYER && !request.trialInviteId
                ? TeamAccessPhase.TRIAL
                : TeamAccessPhase.FULL,
            status: TeamAccessStatus.ACTIVE,
          },
          // After a Probetraining the player already holds TRIAL access; the
          // approved Aufnahmeantrag is the trial decision (TRIAL → FULL).
          update: request.trialInviteId
            ? { phase: TeamAccessPhase.FULL, status: TeamAccessStatus.ACTIVE }
            : {},
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
      if (request.trialInviteId) {
        const joined = await tx.trialInvite.updateMany({
          where: { id: request.trialInviteId, clubId, status: 'OFFERED' },
          data: { status: 'JOINED', decidedAt: new Date(), decidedByUserId: reviewerId },
        })
        if (joined.count !== 1) {
          throw new ConflictException('The Probetraining offer is no longer open')
        }
        // M4: a player who joined is no longer on the Wechselbörse.
        await tx.freeAgentProfile.updateMany({
          where: { userId: request.userId },
          data: { isOnTransferList: false },
        })
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
      if (request.trialInviteId) {
        // Rejecting the Aufnahmeantrag closes the trial and its access.
        const invite = await tx.trialInvite.findFirst({
          where: { id: request.trialInviteId, clubId },
          select: { teamId: true },
        })
        await tx.trialInvite.updateMany({
          where: { id: request.trialInviteId, clubId, status: 'OFFERED' },
          data: { status: 'REJECTED', decidedAt: new Date(), decidedByUserId: reviewerId },
        })
        if (invite) {
          await tx.teamAccess.updateMany({
            where: {
              teamId: invite.teamId,
              userId: request.userId,
              role: TeamRole.PLAYER,
              phase: TeamAccessPhase.TRIAL,
            },
            data: { status: TeamAccessStatus.REVOKED },
          })
        }
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

  /**
   * Vereinswechsel checklist: Freigabe of the previous club, Passantrag filed
   * in DFBnet, Spielberechtigt ab. Coaches of the team or club admins.
   */
  async updateWechsel(
    clubId: string,
    requestId: string,
    userId: string,
    input: UpdateJoinRequestWechselInput,
  ) {
    const request = await this.prisma.joinRequest.findFirst({
      where: {
        id: requestId,
        clubId,
        status: { in: [JoinRequestStatus.PENDING, JoinRequestStatus.APPROVED] },
      },
      select: { id: true, teamId: true },
    })
    if (!request) throw new NotFoundException('Join request not found')
    const scope = await resolveTrialScope(this.prisma as any, clubId, userId)
    if (!scope.all) {
      if (!request.teamId) throw new NotFoundException('Join request not found')
      assertTeamInScope(scope, request.teamId, 'Join request')
    }

    const toDate = (value: string | null | undefined) =>
      value === undefined ? undefined : value ? new Date(`${value}T00:00:00.000Z`) : null
    const updated = await this.prisma.joinRequest.update({
      where: { id: request.id },
      data: {
        ...(input.releaseStatus ? { releaseStatus: input.releaseStatus } : {}),
        passApplicationAt: toDate(input.passApplicationAt),
        eligibleFrom: toDate(input.eligibleFrom),
      },
    })
    await this.audit.log({
      clubId,
      type: 'join_request.wechsel_updated',
      actorType: 'user',
      actorId: userId,
      actorLabel: null,
      summary: `Vereinswechsel updated for join request ${requestId}`,
      metadata: { requestId, ...input },
    })
    return {
      id: updated.id,
      status: updated.status,
      revision: updated.revision,
      createdAt: updated.createdAt.toISOString(),
      previousClubName: updated.previousClubName ?? null,
      releaseStatus: updated.releaseStatus ?? null,
      passApplicationAt: updated.passApplicationAt
        ? updated.passApplicationAt.toISOString().slice(0, 10)
        : null,
      eligibleFrom: updated.eligibleFrom ? updated.eligibleFrom.toISOString().slice(0, 10) : null,
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

  /** Email (always) + push (when the guardian has an account) for an under-18 Aufnahmeantrag. */
  private async notifyGuardian(
    clubId: string,
    playerUserId: string,
    consent: { id: string; teamId: string; guardianEmail: string },
  ) {
    const [club, team, player, guardian] = await Promise.all([
      this.prisma.club.findUnique({
        where: { id: clubId },
        select: { name: true, primaryColor: true, badgeUrl: true },
      }),
      tenantContext.run({ clubId, userId: playerUserId }, () =>
        this.prisma.team.findFirst({
          where: { id: consent.teamId, clubId },
          select: { displayName: true, name: true },
        }),
      ),
      this.prisma.user.findUnique({ where: { id: playerUserId }, select: { name: true } }),
      this.prisma.user.findFirst({
        where: { email: { equals: consent.guardianEmail, mode: 'insensitive' }, deletedAt: null },
        select: { id: true, preferredLanguage: true },
      }),
    ])
    const clubName = club?.name ?? ''
    const teamName = team?.displayName || team?.name || ''
    const childName = player?.name ?? ''
    const email = buildAufnahmeGuardianEmail({
      locale: resolveLocale(guardian?.preferredLanguage),
      clubName,
      teamName,
      childName,
      primaryColor: club?.primaryColor,
      badgeUrl: club?.badgeUrl,
    })
    await sendEmail({ to: consent.guardianEmail, ...email })
    if (guardian) {
      await this.push.sendToUserLocalized(
        guardian.id,
        'CONSENT_REQUESTED',
        { clubName, childName, teamName },
        { type: 'consent_requested', clubId },
      )
    }
  }

  private requireEntitlements() {
    if (!this.clubEntitlements) {
      throw new ServiceUnavailableException('Player-seat enforcement is unavailable')
    }
    return this.clubEntitlements
  }
}

/** Aufnahmeantrag fields, normalised. Plain join requests store nulls. */
function aufnahmeantragData(input: CreateJoinRequestInput) {
  const now = new Date()
  const previousClubName = input.previousClubName?.trim() || null
  return {
    trialInviteId: input.trialInviteId ?? null,
    street: input.street?.trim() || null,
    postalCode: input.postalCode?.trim() || null,
    city: input.city?.trim() || null,
    phone: input.phone?.trim() || null,
    nationality: input.nationality?.trim() || null,
    previousClubName,
    lastMatchDate: input.lastMatchDate ? new Date(`${input.lastMatchDate}T00:00:00.000Z`) : null,
    // SEPA: consent only. The Kassenwart sends the mandate; no IBAN here.
    sepaConsentAt: input.sepaConsent ? now : null,
    // H4: set only when a guardian approved through the consent flow.
    parentalConsentAt: null,
    releaseStatus: input.trialInviteId ? (previousClubName ? 'PENDING' : 'NOT_NEEDED') : null,
    passApplicationAt: null,
    eligibleFrom: null,
  } as const
}

/**
 * Aufnahmeantrag completeness. Adults consent to SEPA themselves; a player
 * under 18 names a guardian instead (H4), who consents in the app. Nationality
 * is optional (only needed for an international transfer).
 */
async function assertAufnahmeantragComplete(
  tx: Prisma.TransactionClient,
  clubId: string,
  userId: string,
  input: CreateJoinRequestInput,
): Promise<{ minor: boolean }> {
  if (!input.street || !input.postalCode || !input.city) {
    throw new BadRequestException('Address is required for the membership application')
  }
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { dateOfBirth: true, email: true },
  })
  const minor = Boolean(user?.dateOfBirth && getAge(user.dateOfBirth) < 18)
  if (!minor) {
    if (!input.sepaConsent) {
      throw new BadRequestException('Consent to the SEPA direct debit is required')
    }
    return { minor }
  }
  const guardianEmail = input.guardianEmail?.trim().toLowerCase()
  if (!guardianEmail) {
    throw new BadRequestException(
      'Players under 18 need a parent or guardian to approve the membership',
    )
  }
  if (user?.email && user.email.trim().toLowerCase() === guardianEmail) {
    throw new BadRequestException("The guardian email cannot be the player's own email")
  }
  // Club staff cannot consent on a child's behalf.
  const staff = await tx.membership.findFirst({
    where: {
      clubId,
      role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.COACH] },
      user: { email: { equals: guardianEmail, mode: 'insensitive' }, deletedAt: null },
    },
    select: { id: true },
  })
  if (staff) {
    throw new BadRequestException(
      'The guardian email belongs to club staff. Enter the email of a parent or guardian.',
    )
  }
  return { minor }
}

/**
 * H4: opens (or re-opens) the guardian consent for this club + team, using
 * the parental-consent records and the per-child-per-team lock the consent
 * flow uses. The guardian approves it under "Einwilligungen"
 * (POST /consent/:id/approve); approval of the Aufnahmeantrag requires it.
 */
async function openGuardianConsent(
  tx: Prisma.TransactionClient,
  clubId: string,
  teamId: string,
  playerUserId: string,
  guardianEmail: string,
) {
  await lockPlayerTeamAccess(tx, clubId, teamId, playerUserId)
  const existing = await tx.parentalConsent.findUnique({
    where: {
      teamId_playerUserId_guardianEmail: { teamId, playerUserId, guardianEmail },
    },
    select: { id: true, status: true },
  })
  if (!existing) {
    const created = await tx.parentalConsent.create({
      data: {
        clubId,
        teamId,
        playerUserId,
        guardianEmail,
        status: ParentalConsentStatus.PENDING,
      },
      select: { id: true },
    })
    return { id: created.id, teamId, guardianEmail }
  }
  if (
    existing.status === ParentalConsentStatus.REJECTED ||
    existing.status === ParentalConsentStatus.WITHDRAWN ||
    existing.status === ParentalConsentStatus.REQUIRED
  ) {
    await tx.parentalConsent.updateMany({
      where: { id: existing.id, status: existing.status },
      data: {
        status: ParentalConsentStatus.PENDING,
        guardianUserId: null,
        approvedAt: null,
        requestedAt: new Date(),
        withdrawnAt: null,
        withdrawnByUserId: null,
        withdrawalReason: null,
        withdrawalNote: null,
      },
    })
  }
  return { id: existing.id, teamId, guardianEmail }
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
