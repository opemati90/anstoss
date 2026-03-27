import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { ParentalConsentStatus } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'

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
    const existing = await this.prisma.parentalConsent.findUnique({
      where: {
        teamId_playerUserId_guardianEmail: {
          teamId: data.teamId,
          playerUserId: data.playerUserId,
          guardianEmail: data.guardianEmail,
        },
      },
    })

    if (existing) {
      throw new ConflictException('Consent request already exists for this team')
    }

    const consent = await this.prisma.parentalConsent.create({
      data: {
        clubId: data.clubId,
        teamId: data.teamId,
        playerUserId: data.playerUserId,
        guardianEmail: data.guardianEmail,
        status: ParentalConsentStatus.PENDING,
      },
    })

    await this.auditService.log({
      clubId: data.clubId,
      type: 'membership.created',
      actorType: 'system',
      actorId: null,
      actorLabel: null,
      summary: `Parental consent requested for player ${data.playerUserId} from ${data.guardianEmail}`,
      metadata: { consentId: consent.id, guardianEmail: data.guardianEmail },
    })

    return consent
  }

  /** Approve a consent request (called by guardian). */
  async approveConsent(consentId: string, guardianUserId: string) {
    const consent = await this.prisma.parentalConsent.findUnique({
      where: { id: consentId },
    })

    if (!consent) throw new NotFoundException('Consent record not found')
    if (consent.status === ParentalConsentStatus.APPROVED) {
      return consent
    }

    const updated = await this.prisma.parentalConsent.update({
      where: { id: consentId },
      data: {
        status: ParentalConsentStatus.APPROVED,
        guardianUserId,
        approvedAt: new Date(),
      },
    })

    // Activate the player's team access if it was gated
    await this.prisma.teamAccess.updateMany({
      where: {
        teamId: consent.teamId,
        userId: consent.playerUserId,
        status: 'PENDING',
      },
      data: { status: 'ACTIVE' },
    })

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
    const consent = await this.prisma.parentalConsent.findUnique({
      where: { id: consentId },
    })

    if (!consent) throw new NotFoundException('Consent record not found')

    const updated = await this.prisma.parentalConsent.update({
      where: { id: consentId },
      data: {
        status: ParentalConsentStatus.REJECTED,
        guardianUserId,
      },
    })

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
