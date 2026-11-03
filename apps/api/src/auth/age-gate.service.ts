import { Injectable } from '@nestjs/common'
import { AGE_GATE, AgeGateError, LAUNCH_FEATURES, ParentalConsentStatus, TeamAccessStatus } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'

/**
 * Privacy / safeguarding (GDPR Art. 8, Germany: 16): the single source of
 * truth for "may this user use Anstoss in this club context right now?".
 *
 * Used by
 *  - the global AgeGateGuard (every authenticated HTTP route),
 *  - push fan-out (PushService skips recipients who fail the gate),
 *  - chat gateway / services that act outside an HTTP route
 *    (`assertAllowed(userId, { clubId, teamId })`).
 *
 * Rules
 *  - No DOB: allowed only with the 16+ self-declaration (adultConfirmedAt).
 *  - Under 13: never (guardian-managed accounts only).
 *  - 16+: always.
 *  - 13-15: needs an APPROVED ParentalConsent that covers the requested scope.
 *      scope { clubId, teamId }: APPROVED consent for that team, or an active
 *        loan on that team from a team with APPROVED consent.
 *      scope { clubId }: APPROVED consent for any team of that club.
 *      no scope: APPROVED consent anywhere. Endpoints a blocked child must
 *        still reach are allow-listed with @AllowWithoutConsent().
 *    An APPROVED consent in club A never opens club B.
 */
export interface AgeGateScope {
  clubId?: string | null
  teamId?: string | null
}

export type AgeGateBlockCode =
  | 'unknown_user'
  | 'dob_required'
  | 'under_13'
  | 'adult_launch_only'
  | 'guardian_launch_disabled'
  | 'consent_required'
  | 'consent_pending'
  | 'consent_withdrawn'
  | 'consent_rejected'

export type AgeGateDecision =
  | { allowed: true; minor: boolean }
  | { allowed: false; code: AgeGateBlockCode; message: string }

type GateUser = { dateOfBirth: Date | null; adultConfirmedAt: Date | null }
type ConsentRow = { teamId: string; clubId: string; status: string }

const MESSAGES: Record<AgeGateBlockCode, string> = {
  adult_launch_only: 'Anstoss currently supports adults aged 18 and over. Youth participation is coming soon.',
  guardian_launch_disabled: 'Guardian participation is coming soon. Use an independently approved adult player or staff role.',
  unknown_user: 'Account not found',
  dob_required: 'Date of birth required',
  under_13: 'Children under 13 must use a guardian-managed account',
  consent_required: 'Parental consent is required for users under 16',
  consent_pending: 'Waiting for guardian approval',
  consent_withdrawn:
    'Parental consent was withdrawn. A guardian must approve your account again.',
  consent_rejected: 'Parental consent was rejected. A guardian must approve your account.',
}

@Injectable()
export class AgeGateService {
  constructor(private readonly prisma: PrismaService) {}

  /** Throws AgeGateError when the user may not act in this scope. */
  async assertAllowed(userId: string, scope: AgeGateScope = {}): Promise<void> {
    const decision = await this.evaluate(userId, scope)
    if (!decision.allowed) throw new AgeGateError(decision.message)
  }

  async isAllowed(userId: string, scope: AgeGateScope = {}): Promise<boolean> {
    return (await this.evaluate(userId, scope)).allowed
  }

  async evaluate(userId: string, scope: AgeGateScope = {}): Promise<AgeGateDecision> {
    const user = await this.readUsers([userId])
    return this.decide(userId, user.get(userId) ?? null, scope)
  }

  /**
   * Push fan-out: keep only recipients who pass the gate for this scope.
   * Adults cost one batched user read; minors one consent read each batch.
   */
  async filterAllowedUserIds(userIds: string[], scope: AgeGateScope = {}): Promise<string[]> {
    const unique = Array.from(new Set(userIds))
    if (unique.length === 0) return []
    const users = await this.readUsers(unique)
    const allowed = new Set<string>()
    for (const id of unique) {
      const decision = await this.decide(id, users.get(id) ?? null, scope)
      if (decision.allowed) allowed.add(id)
    }
    return userIds.filter((id) => allowed.has(id))
  }

  private async readUsers(userIds: string[]): Promise<Map<string, GateUser>> {
    const rows: Array<GateUser & { id: string }> = await this.prisma.user.findMany({
      where: { id: { in: userIds }, deletedAt: null },
      select: { id: true, dateOfBirth: true, adultConfirmedAt: true },
    })
    return new Map(rows.map((r) => [r.id, r]))
  }

  private async decide(
    userId: string,
    user: GateUser | null,
    scope: AgeGateScope,
  ): Promise<AgeGateDecision> {
    if (!user) return block('unknown_user')
    if (!LAUNCH_FEATURES.youthParticipation) {
      if (!user.dateOfBirth || !Number.isFinite(user.dateOfBirth.getTime())) return block('dob_required')
      if (getAge(user.dateOfBirth) < LAUNCH_FEATURES.minimumAccountAge) return block('adult_launch_only')
      if (scope.clubId) {
        const clubId = scope.clubId
        const membership = await this.inClub(clubId, () => this.prisma.membership.findUnique({
          where: { userId_clubId: { userId, clubId } }, select: { role: true },
        }))
        if (membership?.role === 'PARENT') {
          const independent = await this.inClub(clubId, () => this.prisma.teamAccess.findFirst({
            where: { userId, clubId, ...(scope.teamId ? { teamId: scope.teamId } : {}),
              role: { not: 'PARENT' }, status: 'ACTIVE', phase: 'FULL',
              OR: [{ loanEndDate: null }, { loanEndDate: { gt: new Date() } }] }, select: { id: true },
          }))
          if (!independent) return block('guardian_launch_disabled')
        }
      }
      return { allowed: true, minor: false }
    }
    if (!user.dateOfBirth) {
      // Legacy accounts only: the 16+ declaration can no longer be made
      // (onboarding review fix B1, UsersService.updateProfile refuses it), so
      // every new account reaches this gate with a real DOB. A DOB, when
      // present, always wins.
      return user.adultConfirmedAt ? { allowed: true, minor: false } : block('dob_required')
    }
    const age = getAge(user.dateOfBirth)
    if (age < AGE_GATE.MIN_DIRECT_ACCOUNT_AGE) return block('under_13')
    if (age >= AGE_GATE.MIN_AGE) return { allowed: true, minor: false }

    const clubId = scope.clubId || null
    const teamId = scope.teamId || null
    const consents = await this.readConsents(userId, clubId)
    const approved = consents.filter((c) => c.status === ParentalConsentStatus.APPROVED)

    if (teamId && clubId) {
      if (approved.some((c) => c.teamId === teamId)) return { allowed: true, minor: true }
      // A loan keeps the child covered by the lending team's consent.
      const approvedTeamIds = approved.map((c) => c.teamId)
      if (approvedTeamIds.length > 0) {
        const loan = await this.inClub(clubId, () =>
          this.prisma.teamAccess.findFirst({
            where: {
              clubId,
              teamId,
              userId,
              role: 'PLAYER',
              status: TeamAccessStatus.ACTIVE,
              loanedFromTeamId: { in: approvedTeamIds },
            },
            select: { id: true },
          }),
        )
        if (loan) return { allowed: true, minor: true }
      }
      return blockFor(consents.filter((c) => c.teamId === teamId))
    }

    if (approved.length > 0) return { allowed: true, minor: true }
    return blockFor(consents)
  }

  private async readConsents(userId: string, clubId: string | null): Promise<ConsentRow[]> {
    if (clubId) {
      return this.inClub(clubId, () =>
        this.prisma.parentalConsent.findMany({
          where: { playerUserId: userId, clubId },
          select: { teamId: true, clubId: true, status: true },
        }),
      )
    }
    // No club context: read across clubs even when a caller's tenant context
    // is set, otherwise the tenant middleware would narrow the lookup.
    return tenantContext.exit(() =>
      this.prisma.parentalConsent.findMany({
        where: { playerUserId: userId },
        select: { teamId: true, clubId: true, status: true },
      }),
    )
  }

  /** Run tenant-scoped reads for exactly this club, whatever the caller's context. */
  private inClub<T>(clubId: string, fn: () => Promise<T>): Promise<T> {
    return tenantContext.run({ clubId, userId: 'system:age-gate' }, fn)
  }
}

function block(code: AgeGateBlockCode): AgeGateDecision {
  return { allowed: false, code, message: MESSAGES[code] }
}

function blockFor(relevant: ConsentRow[]): AgeGateDecision {
  if (relevant.some((c) => c.status === ParentalConsentStatus.PENDING)) {
    return block('consent_pending')
  }
  if (relevant.some((c) => c.status === ParentalConsentStatus.WITHDRAWN)) {
    return block('consent_withdrawn')
  }
  if (relevant.some((c) => c.status === ParentalConsentStatus.REJECTED)) {
    return block('consent_rejected')
  }
  return block('consent_required')
}

export function getAge(dateOfBirth: Date, today = new Date()): number {
  let age = today.getFullYear() - dateOfBirth.getFullYear()
  const monthDiff = today.getMonth() - dateOfBirth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age--
  }
  return age
}
