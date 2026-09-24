import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import {
  MembershipRole,
  ParentalConsentStatus,
  TeamAccessStatus,
} from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { tenantContext } from '../prisma/tenant.context'
import { PushService } from '../push/push.service'
import { lockPlayerTeamAccess } from '../teams/guardian-team-access'
import { sendEmail } from '../email/mailer'
import { resolveLocale } from '../i18n/translations'
import { buildConsentEmail } from './consent-email'
import { assertAcceptableGuardianEmail } from './guardian-email'
import {
  CONSENT_WITHDRAWAL_REASON,
  CONSENT_WITHDRAWN_EVENT,
  withdrawApprovedConsentTx,
  type ConsentWithdrawalEffect,
  type ConsentWithdrawnEventPayload,
} from './consent-withdrawal'

/** Minimum length of the admin's note documenting the guardian's request. */
const ADMIN_WITHDRAWAL_NOTE_MIN = 10

@Injectable()
export class ConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
    @Optional() private readonly push?: PushService,
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

  /**
   * Create a consent request for an under-16 player (coach/admin).
   *
   * Privacy fixes (2026-09-24 review):
   *  - H4: after a withdrawal the child's PLAYER access is REVOKED. Any new
   *    request (same or a different guardian, incl. after the previous
   *    guardian deleted their account) reopens that access as PENDING.
   *  - M3: the guardian email may not belong to the player or to club staff
   *    (a coach cannot consent for a child in their own club), and the
   *    guardian is always notified by email (+ push when they have an account).
   *  - M1: runs under the per-child-per-team lock shared with withdrawals,
   *    approvals, loans and invites.
   */
  async createConsentRequest(data: {
    clubId: string
    teamId: string
    playerUserId: string
    guardianEmail: string
    requestedByUserId?: string | null
  }) {
    const guardianEmail = data.guardianEmail.trim().toLowerCase()
    const [team, player, membership, playerAccess] = await Promise.all([
      this.prisma.team.findFirst({
        where: { id: data.teamId, clubId: data.clubId },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { id: data.playerUserId },
        select: { id: true, dateOfBirth: true, email: true },
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

    if (!team || !player || !membership) {
      throw new NotFoundException('Player is not attached to this club and team')
    }

    // H4: a REVOKED row is re-openable when it was revoked by a consent
    // withdrawal on this team, whoever the new guardian is.
    const revokedAccess = playerAccess
      ? null
      : await this.findWithdrawalRevokedAccess(data.clubId, data.teamId, data.playerUserId)

    if (!playerAccess && !revokedAccess) {
      throw new NotFoundException('Player is not attached to this club and team')
    }
    if (!player.dateOfBirth || this.getAge(player.dateOfBirth) >= 16) {
      throw new ConflictException('Parental consent is only valid for under-16 players')
    }
    await this.assertAcceptableGuardianEmail(data.clubId, guardianEmail, {
      playerEmail: player.email,
      requestedByUserId: data.requestedByUserId ?? null,
    })

    const existing = await this.prisma.parentalConsent.findUnique({
      where: {
        teamId_playerUserId_guardianEmail: {
          teamId: data.teamId,
          playerUserId: data.playerUserId,
          guardianEmail,
        },
      },
    })
    const isReRequest = existing?.status === ParentalConsentStatus.WITHDRAWN
    if (existing && !isReRequest) {
      throw new ConflictException('Consent request already exists for this team')
    }

    const consent = await tenantContext.run(
      { clubId: data.clubId, userId: data.requestedByUserId ?? data.playerUserId },
      () =>
        this.prisma.$transaction(async (tx) => {
          await lockPlayerTeamAccess(tx, data.clubId, data.teamId, data.playerUserId)
          let row
          if (existing) {
            const reopened = await tx.parentalConsent.updateMany({
              where: { id: existing.id, status: ParentalConsentStatus.WITHDRAWN },
              data: {
                status: ParentalConsentStatus.PENDING,
                guardianUserId: null,
                approvedAt: null,
                requestedAt: new Date(),
                // The withdrawal itself stays in the audit log.
                withdrawnAt: null,
                withdrawnByUserId: null,
                withdrawalReason: null,
                withdrawalNote: null,
              },
            })
            if (reopened.count !== 1) {
              throw new ConflictException('Consent request already exists for this team')
            }
            row = await tx.parentalConsent.findUniqueOrThrow({ where: { id: existing.id } })
          } else {
            row = await tx.parentalConsent.create({
              data: {
                clubId: data.clubId,
                teamId: data.teamId,
                playerUserId: data.playerUserId,
                guardianEmail,
                status: ParentalConsentStatus.PENDING,
              },
            })
          }
          if (revokedAccess) {
            await tx.teamAccess.updateMany({
              where: { id: revokedAccess.id, status: TeamAccessStatus.REVOKED },
              data: { status: TeamAccessStatus.PENDING },
            })
          }
          await tx.auditLog.create({
            data: {
              clubId: data.clubId,
              type: 'membership.created',
              actorType: data.requestedByUserId ? 'user' : 'system',
              actorId: data.requestedByUserId ?? null,
              actorLabel: null,
              summary: existing
                ? `Parental consent re-requested for player ${data.playerUserId} after withdrawal`
                : `Parental consent requested for player ${data.playerUserId} from ${guardianEmail}`,
              metadata: {
                consentId: row.id,
                guardianEmail,
                reRequest: Boolean(existing),
                reopenedRevokedAccess: Boolean(revokedAccess),
              },
            },
          })
          return row
        }),
    )

    await this.notifyGuardianOfRequest(consent.id).catch((err: unknown) => {
      this.logger.warn(`consent request notice failed for ${consent.id}: ${(err as Error).message}`)
    })
    return consent
  }

  /** REVOKED PLAYER access on this team that a consent withdrawal caused. */
  private async findWithdrawalRevokedAccess(clubId: string, teamId: string, playerUserId: string) {
    const [revoked, withdrawn] = await Promise.all([
      this.prisma.teamAccess.findFirst({
        where: {
          clubId,
          teamId,
          userId: playerUserId,
          role: 'PLAYER',
          status: TeamAccessStatus.REVOKED,
        },
        select: { id: true },
      }),
      this.prisma.parentalConsent.count({
        where: { clubId, teamId, playerUserId, status: ParentalConsentStatus.WITHDRAWN },
      }),
    ])
    return revoked && withdrawn > 0 ? revoked : null
  }

  /** M3: the guardian must be a third party (see guardian-email.ts). */
  private assertAcceptableGuardianEmail(
    clubId: string,
    guardianEmail: string,
    ctx: { playerEmail: string | null; requestedByUserId: string | null },
  ) {
    return assertAcceptableGuardianEmail(this.prisma, clubId, guardianEmail, ctx)
  }

  /** M3: email (always) + push (when the guardian has an account). */
  private async notifyGuardianOfRequest(consentId: string) {
    const consent = await this.prisma.parentalConsent.findUnique({
      where: { id: consentId },
      select: {
        clubId: true,
        guardianEmail: true,
        club: { select: { name: true, primaryColor: true, badgeUrl: true } },
        team: { select: { displayName: true, name: true } },
        player: { select: { name: true } },
      },
    })
    if (!consent) return
    const guardian = await this.prisma.user.findFirst({
      where: { email: { equals: consent.guardianEmail, mode: 'insensitive' }, deletedAt: null },
      select: { id: true, preferredLanguage: true },
    })
    const clubName = consent.club?.name ?? ''
    const teamName = consent.team?.displayName || consent.team?.name || ''
    const childName = consent.player?.name ?? ''
    const email = buildConsentEmail({
      kind: 'request',
      locale: resolveLocale(guardian?.preferredLanguage),
      clubName,
      teamName,
      childName,
      primaryColor: consent.club?.primaryColor,
      badgeUrl: consent.club?.badgeUrl,
    })
    await sendEmail({ to: consent.guardianEmail, ...email })
    if (guardian && this.push) {
      await this.push.sendToUserLocalized(
        guardian.id,
        'CONSENT_REQUESTED',
        { clubName, childName, teamName },
        { type: 'consent_requested', clubId: consent.clubId },
      )
    }
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
    // Onboarding review fix (B2): consenting for a child needs an adult: a
    // DOB on file showing 18+. The legacy 16+ self-declaration
    // (adultConfirmedAt) is not enough to act as a guardian.
    const guardianIsAdult = !!guardian.dateOfBirth && this.getAge(guardian.dateOfBirth) >= 18
    if (!guardianIsAdult) {
      throw new ForbiddenException({
        message: 'A guardian must be at least 18',
        code: 'GUARDIAN_UNDER_18',
      })
    }
    const guardianEmail = guardian.email.trim().toLowerCase()

    const scopedConsent = await this.prisma.parentalConsent.findUnique({
      where: { id: consentId },
      select: { clubId: true, teamId: true, playerUserId: true },
    })
    if (!scopedConsent) throw new NotFoundException('Consent record not found')

    return tenantContext.run(
      { clubId: scopedConsent.clubId, userId: guardianUserId },
      () => this.prisma.$transaction(async (tx) => {
      // M1: same lock as withdrawals, re-requests, loans and invites.
      await lockPlayerTeamAccess(
        tx,
        scopedConsent.clubId,
        scopedConsent.teamId,
        scopedConsent.playerUserId,
      )
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
        // H4: any guardian's approval re-admits a child whose access was
        // REVOKED by a consent withdrawal on this team (not a coach removal:
        // the child must still be a club member and a WITHDRAWN consent must
        // exist for this team).
        const [withdrawnOnTeam, clubMembership] = await Promise.all([
          tx.parentalConsent.count({
            where: {
              clubId: consent.clubId,
              teamId: consent.teamId,
              playerUserId: consent.playerUserId,
              status: ParentalConsentStatus.WITHDRAWN,
            },
          }),
          tx.membership.findUnique({
            where: {
              userId_clubId: { userId: consent.playerUserId, clubId: consent.clubId },
            },
            select: { userId: true },
          }),
        ])
        if (withdrawnOnTeam > 0 && clubMembership) {
          await tx.teamAccess.updateMany({
            where: {
              clubId: consent.clubId,
              teamId: consent.teamId,
              userId: consent.playerUserId,
              role: 'PLAYER',
              status: TeamAccessStatus.REVOKED,
            },
            data: { status: TeamAccessStatus.ACTIVE },
          })
        }
      }

      const updated = await tx.parentalConsent.findUnique({ where: { id: consentId } })
      if (!updated) throw new NotFoundException('Consent record not found')
      return { consent, updated }
      }),
    )
  }

  /** Get pending consent requests for a guardian (by email). */
  async getPendingForGuardian(guardianEmail: string) {
    // L3: consent rows store the email lowercased; account emails may not be.
    const email = guardianEmail?.trim().toLowerCase()
    if (!email) return []
    return this.prisma.parentalConsent.findMany({
      where: {
        guardianEmail: email,
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

  /**
   * Privacy: every consent the caller gave or was asked for, per child, so a
   * guardian can review and withdraw it (GDPR Art. 7(3)).
   */
  async listForGuardian(user: { id: string; email?: string | null }) {
    const email = user.email?.trim().toLowerCase()
    const rows = await this.prisma.parentalConsent.findMany({
      where: {
        OR: [
          { guardianUserId: user.id },
          ...(email ? [{ guardianEmail: email, guardianUserId: null }] : []),
        ],
        status: {
          in: [
            ParentalConsentStatus.APPROVED,
            ParentalConsentStatus.PENDING,
            ParentalConsentStatus.WITHDRAWN,
          ],
        },
      },
      include: {
        club: { select: { id: true, name: true, badgeUrl: true } },
        team: { select: { id: true, displayName: true } },
        player: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: [{ requestedAt: 'desc' }],
    })
    return rows.map((c) => ({
      id: c.id,
      status: c.status,
      requestedAt: c.requestedAt,
      approvedAt: c.approvedAt,
      withdrawnAt: c.withdrawnAt,
      // M2: the guardian sees who withdrew (they or a club admin) and the
      // club's documented note, so an unrequested withdrawal is visible.
      withdrawalReason: c.withdrawalReason,
      withdrawnBy:
        c.status !== ParentalConsentStatus.WITHDRAWN
          ? null
          : c.withdrawalReason === CONSENT_WITHDRAWAL_REASON.ADMIN_ON_GUARDIAN_REQUEST
            ? ('club_admin' as const)
            : c.withdrawalReason === CONSENT_WITHDRAWAL_REASON.GUARDIAN_ACCOUNT_DELETED
              ? ('system' as const)
              : ('guardian' as const),
      withdrawalNote:
        c.withdrawalReason === CONSENT_WITHDRAWAL_REASON.ADMIN_ON_GUARDIAN_REQUEST
          ? c.withdrawalNote
          : null,
      club: c.club,
      team: c.team,
      player: c.player,
    }))
  }

  /**
   * Privacy: withdraw an APPROVED parental consent (GDPR Art. 7(3)).
   *
   * Allowed for the guardian who holds the consent, or for an OWNER/ADMIN of
   * the consent's club acting on the guardian's written request (a note
   * documenting that request is mandatory). Anyone else gets 404 so the
   * endpoint cannot be used to probe consent ids across clubs.
   *
   * In one transaction: consent → WITHDRAWN, dependent team access → REVOKED,
   * stale channel rows removed, audit log written. Club admins are notified
   * after commit.
   */
  async withdrawConsent(
    consentId: string,
    actorUserId: string,
    input: { note?: string | null } = {},
  ) {
    const consent = await this.prisma.parentalConsent.findUnique({
      where: { id: consentId },
      select: {
        id: true,
        clubId: true,
        status: true,
        guardianUserId: true,
        guardianEmail: true,
      },
    })
    if (!consent) throw new NotFoundException('Consent record not found')

    const actor = await this.prisma.user.findFirst({
      where: { id: actorUserId, deletedAt: null },
      select: { id: true, email: true },
    })
    if (!actor) throw new NotFoundException('Consent record not found')

    const actorEmail = actor.email?.trim().toLowerCase() || null
    const isGuardian =
      consent.guardianUserId === actorUserId ||
      (consent.guardianUserId === null &&
        actorEmail !== null &&
        consent.guardianEmail.trim().toLowerCase() === actorEmail)

    const note = input.note?.trim() || null
    let reason: (typeof CONSENT_WITHDRAWAL_REASON)[keyof typeof CONSENT_WITHDRAWAL_REASON] =
      CONSENT_WITHDRAWAL_REASON.GUARDIAN
    if (!isGuardian) {
      const membership = await this.prisma.membership.findUnique({
        where: { userId_clubId: { userId: actorUserId, clubId: consent.clubId } },
        select: { role: true },
      })
      if (!membership) throw new NotFoundException('Consent record not found')
      if (
        membership.role !== MembershipRole.OWNER &&
        membership.role !== MembershipRole.ADMIN
      ) {
        throw new ForbiddenException('Only the guardian or a club admin can withdraw consent')
      }
      if (!note || note.length < ADMIN_WITHDRAWAL_NOTE_MIN || !isDescriptiveNote(note)) {
        throw new BadRequestException(
          "A note documenting the guardian's written request is required",
        )
      }
      reason = CONSENT_WITHDRAWAL_REASON.ADMIN_ON_GUARDIAN_REQUEST
    }

    if (consent.status === ParentalConsentStatus.WITHDRAWN) {
      return this.readWithdrawnConsent(consentId)
    }
    if (consent.status !== ParentalConsentStatus.APPROVED) {
      throw new ConflictException('Only an approved consent can be withdrawn')
    }

    const effect = await tenantContext.run(
      { clubId: consent.clubId, userId: actorUserId },
      () =>
        this.prisma.$transaction((tx) =>
          withdrawApprovedConsentTx(tx, {
            consentId,
            clubId: consent.clubId,
            actorUserId,
            reason,
            note,
          }),
        ),
    )

    if (!effect) {
      // Lost a race: another request already withdrew (idempotent) or the
      // consent changed state underneath us.
      const current = await this.readWithdrawnConsent(consentId)
      if (current.status === ParentalConsentStatus.WITHDRAWN) return current
      throw new ConflictException('Consent changed. Refresh and try again')
    }

    this.emitWithdrawal([effect], actorUserId)
    return this.readWithdrawnConsent(consentId)
  }

  /** Post-commit side effects shared with account deletion. */
  emitWithdrawal(effects: ConsentWithdrawalEffect[], actorUserId: string | null) {
    if (!this.eventEmitter || effects.length === 0) return
    const payload: ConsentWithdrawnEventPayload = { effects, actorUserId }
    this.eventEmitter.emit(CONSENT_WITHDRAWN_EVENT, payload)
    const affected = new Set<string>()
    for (const e of effects) {
      if (e.accessRevoked) affected.add(e.playerUserId)
      for (const p of e.disconnectedParentUserIds) affected.add(p)
    }
    for (const userId of affected) {
      this.eventEmitter.emit('realtime.access.changed', { userId })
    }
  }

  private async readWithdrawnConsent(consentId: string) {
    const row = await this.prisma.parentalConsent.findUnique({
      where: { id: consentId },
      select: {
        id: true,
        clubId: true,
        teamId: true,
        playerUserId: true,
        status: true,
        approvedAt: true,
        withdrawnAt: true,
        withdrawalReason: true,
      },
    })
    if (!row) throw new NotFoundException('Consent record not found')
    return row
  }

  /** Admin: inspect consent status for a user. */
  async inspectConsentStatus(clubId: string, userId: string) {
    // Only users with a membership in this club are visible. A user from
    // another tenant gets the same 404 as a non-existent id, so the endpoint
    // cannot be used to probe other clubs' members.
    const [user, consents] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, memberships: { some: { clubId } } },
        select: { id: true, name: true, email: true, dateOfBirth: true },
      }),
      this.prisma.parentalConsent.findMany({
        where: { playerUserId: userId, clubId },
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

  private readonly logger = new Logger(ConsentService.name)

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

/**
 * M2: an admin's note must actually document the guardian's request (at least
 * two words with letters), not "xxxxxxxxxx". The guardian is emailed the note.
 */
function isDescriptiveNote(note: string): boolean {
  const words = note.split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w))
  return words.length >= 2 && new Set(note.replace(/\s/g, '').toLowerCase()).size >= 4
}
