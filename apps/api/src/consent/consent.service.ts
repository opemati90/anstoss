import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ParentalConsentStatus } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { tenantContext } from '../prisma/tenant.context'

@Injectable()
export class ConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Check if a user requires parental consent (under 16). */
  async requiresConsent(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dateOfBirth: true },
    })

    if (!user?.dateOfBirth) return false

    const age = this.getAge(user.dateOfBirth)
    return age < 16
  }

  /** Get all consent records for a player. */
  async getPlayerConsents(userId: string) {
    return this.prisma.parentalConsent.findMany({
      where: { playerUserId: userId },
      include: {
        club: { select: { id: true, name: true } },
        team: { select: { id: true, displayName: true } },
        guardian: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /** Get consent status for a specific team membership. */
  async getConsentForTeam(
    playerUserId: string,
    teamId: string,
  ) {
    return this.prisma.parentalConsent.findFirst({
      where: { playerUserId, teamId },
      include: {
        guardian: { select: { id: true, name: true, email: true } },
      },
    })
  }

  /** Create a consent request for an under-16 player. */
  async createConsentRequest(data: {
    clubId: string
    teamId: string
    playerUserId: string
    guardianEmail: string
  }) {
    const guardianEmail = data.guardianEmail.trim().toLowerCase()
    const [team, player, membership, playerAccess] = await Promise.all([
      this.prisma.team.findFirst({
        where: { id: data.teamId, clubId: data.clubId },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { id: data.playerUserId },
        select: { id: true, dateOfBirth: true },
      }),
      this.prisma.membership.findUnique({
        where: {
          userId_clubId: {
            userId: data.playerUserId,
            clubId: data.clubId,
          },
        },
        select: { userId: true },
      }),
      this.prisma.teamAccess.findFirst({
        where: {
          clubId: data.clubId,
          teamId: data.teamId,
          userId: data.playerUserId,
          role: 'PLAYER',
          status: { in: ['PENDING', 'ACTIVE'] },
        },
        select: { id: true },
      }),
    ])

    if (!team || !player || !membership || !playerAccess) {
      throw new NotFoundException('Player is not attached to this club and team')
    }
    if (!player.dateOfBirth || this.getAge(player.dateOfBirth) >= 16) {
      throw new ConflictException('Parental consent is only valid for under-16 players')
    }

    const existing = await this.prisma.parentalConsent.findUnique({
      where: {
        teamId_playerUserId_guardianEmail: {
          teamId: data.teamId,
          playerUserId: data.playerUserId,
          guardianEmail,
        },
      },
    })

    if (existing) {
      throw new ConflictException('Consent request already exists for this team')
    }

    return tenantContext.run(
      { clubId: data.clubId, userId: data.playerUserId },
      async () => {
        const consent = await this.prisma.parentalConsent.create({
          data: {
            clubId: data.clubId,
            teamId: data.teamId,
            playerUserId: data.playerUserId,
            guardianEmail,
            status: ParentalConsentStatus.PENDING,
          },
        })

        await this.auditService.log({
          clubId: data.clubId,
          type: 'membership.created',
          actorType: 'system',
          actorId: null,
          actorLabel: null,
          summary: `Parental consent requested for player ${data.playerUserId} from ${guardianEmail}`,
          metadata: { consentId: consent.id, guardianEmail },
        })

        return consent
      },
    )
  }

  /** Approve a consent request (called by guardian). */
  async approveConsent(consentId: string, guardianUserId: string) {
    const { consent, updated } = await this.claimConsentDecision(
      consentId,
      guardianUserId,
      ParentalConsentStatus.APPROVED,
    )

    await this.auditService.log({
      clubId: consent.clubId,
      type: 'membership.created',
      actorType: 'user',
      actorId: guardianUserId,
      actorLabel: null,
      summary: `Guardian approved parental consent for player ${consent.playerUserId}`,
      metadata: { consentId },
    })

    return updated
  }

  /** Reject a consent request. */
  async rejectConsent(consentId: string, guardianUserId: string) {
    const { consent, updated } = await this.claimConsentDecision(
      consentId,
      guardianUserId,
      ParentalConsentStatus.REJECTED,
    )

    await this.auditService.log({
      clubId: consent.clubId,
      type: 'membership.created',
      actorType: 'user',
      actorId: guardianUserId,
      actorLabel: null,
      summary: `Guardian rejected parental consent for player ${consent.playerUserId}`,
      metadata: { consentId },
    })

    return updated
  }

  private async claimConsentDecision(
    consentId: string,
    guardianUserId: string,
    decision: ParentalConsentStatus.APPROVED | ParentalConsentStatus.REJECTED,
  ) {
    const guardian = await this.prisma.user.findFirst({
      where: { id: guardianUserId, deletedAt: null },
      select: { id: true, email: true, dateOfBirth: true },
    })
    if (!guardian?.email) throw new ForbiddenException('Guardian account email required')
    if (!guardian.dateOfBirth || this.getAge(guardian.dateOfBirth) < 16) {
      throw new ForbiddenException('A guardian must be at least 16')
    }
    const guardianEmail = guardian.email.trim().toLowerCase()

    const scopedConsent = await this.prisma.parentalConsent.findUnique({
      where: { id: consentId },
      select: { clubId: true },
    })
    if (!scopedConsent) throw new NotFoundException('Consent record not found')

    return tenantContext.run(
      { clubId: scopedConsent.clubId, userId: guardianUserId },
      () => this.prisma.$transaction(async (tx) => {
      const consent = await tx.parentalConsent.findUnique({ where: { id: consentId } })
      if (!consent) throw new NotFoundException('Consent record not found')
      if (consent.guardianEmail.trim().toLowerCase() !== guardianEmail) {
        throw new ForbiddenException('This consent request belongs to another guardian')
      }

      if (
        consent.status === decision &&
        consent.guardianUserId === guardianUserId
      ) {
        return { consent, updated: consent }
      }
      if (consent.status !== ParentalConsentStatus.PENDING) {
        throw new ConflictException('Consent request has already been decided')
      }

      const claimed = await tx.parentalConsent.updateMany({
        where: {
          id: consentId,
          status: ParentalConsentStatus.PENDING,
          guardianUserId: null,
        },
        data: {
          status: decision,
          guardianUserId,
          approvedAt: decision === ParentalConsentStatus.APPROVED ? new Date() : null,
        },
      })
      if (claimed.count !== 1) {
        throw new ConflictException('Consent request has already been decided')
      }

      if (decision === ParentalConsentStatus.APPROVED) {
        await tx.teamAccess.updateMany({
          where: {
            clubId: consent.clubId,
            teamId: consent.teamId,
            userId: consent.playerUserId,
            role: 'PLAYER',
            status: 'PENDING',
          },
          data: { status: 'ACTIVE' },
        })
      }

      const updated = await tx.parentalConsent.findUnique({ where: { id: consentId } })
      if (!updated) throw new NotFoundException('Consent record not found')
      return { consent, updated }
      }),
    )
  }

  /** Get pending consent requests for a guardian (by email). */
  async getPendingForGuardian(guardianEmail: string) {
    return this.prisma.parentalConsent.findMany({
      where: {
        guardianEmail,
        status: ParentalConsentStatus.PENDING,
      },
      include: {
        club: { select: { id: true, name: true, badgeUrl: true } },
        team: { select: { id: true, displayName: true } },
        player: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /** Admin: inspect consent status for a user. */
  async inspectConsentStatus(userId: string) {
    const [user, consents] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, dateOfBirth: true },
      }),
      this.prisma.parentalConsent.findMany({
        where: { playerUserId: userId },
        include: {
          club: { select: { id: true, name: true } },
          team: { select: { id: true, displayName: true } },
          guardian: { select: { id: true, name: true, email: true } },
        },
      }),
    ])

    if (!user) throw new NotFoundException('User not found')

    return {
      user: {
        ...user,
        age: user.dateOfBirth ? this.getAge(user.dateOfBirth) : null,
        requiresConsent: user.dateOfBirth ? this.getAge(user.dateOfBirth) < 16 : false,
      },
      consents: consents.map((c) => ({
        id: c.id,
        status: c.status,
        guardianEmail: c.guardianEmail,
        guardian: c.guardian,
        club: c.club,
        team: c.team,
        requestedAt: c.requestedAt,
        approvedAt: c.approvedAt,
      })),
    }
  }

  private getAge(dateOfBirth: Date): number {
    const today = new Date()
    let age = today.getFullYear() - dateOfBirth.getFullYear()
    const monthDiff = today.getMonth() - dateOfBirth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
      age--
    }
    return age
  }
}
