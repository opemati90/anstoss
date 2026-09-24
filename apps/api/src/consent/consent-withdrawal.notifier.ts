import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { MembershipRole, TeamAccessStatus } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { tenantContext } from '../prisma/tenant.context'
import { sendEmail } from '../email/mailer'
import { resolveLocale } from '../i18n/translations'
import { buildConsentEmail } from './consent-email'
import {
  CONSENT_WITHDRAWN_EVENT,
  CONSENT_WITHDRAWAL_REASON,
  type ConsentWithdrawalEffect,
  type ConsentWithdrawnEventPayload,
} from './consent-withdrawal'

/**
 * Privacy: after a withdrawing transaction has committed, tell
 *  - the club's OWNER/ADMINs,
 *  - the team's coaches when the child lost team access (M4),
 *  - the guardian, by email ALWAYS (M2: an admin-recorded withdrawal the
 *    guardian did not ask for is visible to them) and by push when they have
 *    an account.
 * Delivery failures never roll back the withdrawal; the AuditLog row is the
 * durable record.
 */
@Injectable()
export class ConsentWithdrawalNotifier {
  private readonly logger = new Logger(ConsentWithdrawalNotifier.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  @OnEvent(CONSENT_WITHDRAWN_EVENT)
  async handle(payload: ConsentWithdrawnEventPayload): Promise<void> {
    for (const effect of payload.effects) {
      try {
        await tenantContext.run(
          { clubId: effect.clubId, userId: payload.actorUserId ?? 'system' },
          () => this.notify(effect, payload.actorUserId),
        )
      } catch (err) {
        this.logger.warn(
          `consent withdrawal notification failed for ${effect.consentId}: ${(err as Error).message}`,
        )
      }
    }
  }

  private async notify(effect: ConsentWithdrawalEffect, actorUserId: string | null) {
    const [club, team, child, admins, coaches] = await Promise.all([
      this.prisma.club.findUnique({
        where: { id: effect.clubId },
        select: { name: true, primaryColor: true, badgeUrl: true },
      }),
      this.prisma.team.findFirst({
        where: { id: effect.teamId, clubId: effect.clubId },
        select: { displayName: true, name: true },
      }),
      this.prisma.user.findUnique({ where: { id: effect.playerUserId }, select: { name: true } }),
      this.prisma.membership.findMany({
        where: {
          clubId: effect.clubId,
          role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] },
          user: { deletedAt: null },
        },
        select: { userId: true },
      }),
      effect.accessRevoked
        ? this.prisma.teamAccess.findMany({
            where: {
              clubId: effect.clubId,
              teamId: effect.teamId,
              role: { in: ['HEAD_COACH', 'ASSISTANT_COACH'] },
              status: TeamAccessStatus.ACTIVE,
            },
            select: { userId: true },
          })
        : Promise.resolve([] as Array<{ userId: string }>),
    ])
    const clubName = club?.name ?? ''
    const teamName = team?.displayName || team?.name || ''
    const childName = child?.name ?? ''
    const data = { clubName, childName, teamName, accessRevoked: effect.accessRevoked }

    const recipients = new Set([...admins, ...coaches].map((a) => a.userId))
    const guardianAccountAlive =
      effect.reason !== CONSENT_WITHDRAWAL_REASON.GUARDIAN_ACCOUNT_DELETED
    if (effect.guardianUserId && guardianAccountAlive) recipients.add(effect.guardianUserId)
    if (actorUserId) recipients.delete(actorUserId)
    for (const userId of recipients) {
      await this.push.sendToUserLocalized(
        userId,
        'CONSENT_WITHDRAWN',
        data,
        { type: 'consent_withdrawn', clubId: effect.clubId },
        { clubId: effect.clubId },
      )
    }

    // A deleted guardian has no mailbox we may still write to.
    if (!guardianAccountAlive || !effect.guardianEmail) return
    const guardian = effect.guardianUserId
      ? await this.prisma.user.findUnique({
          where: { id: effect.guardianUserId },
          select: { preferredLanguage: true },
        })
      : null
    const email = buildConsentEmail({
      kind:
        effect.reason === CONSENT_WITHDRAWAL_REASON.ADMIN_ON_GUARDIAN_REQUEST
          ? 'withdrawn_by_club'
          : 'withdrawn_by_guardian',
      locale: resolveLocale(guardian?.preferredLanguage),
      clubName,
      teamName,
      childName,
      primaryColor: club?.primaryColor,
      badgeUrl: club?.badgeUrl,
      note: effect.note,
    })
    const sent = await sendEmail({ to: effect.guardianEmail, ...email })
    if (!sent) {
      this.logger.warn(`guardian withdrawal email not delivered for ${effect.consentId}`)
    }
  }
}
