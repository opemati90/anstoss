import { ParentalConsentStatus, TeamAccessStatus, TeamRole } from '@anstoss/shared'
import { Prisma } from '@prisma/client'
import { lockPlayerTeamAccess, reconcileGuardianTeamAccess } from '../teams/guardian-team-access'

/**
 * Privacy: parental consent withdrawal (GDPR Art. 7(3)).
 *
 * Shared by the guardian/admin withdraw endpoint (ConsentService) and by
 * guardian account deletion (UsersService). Must run inside a Prisma
 * transaction AND inside a tenantContext for the consent's club, because
 * ParentalConsent and TeamAccess are tenant-scoped models.
 */

export const CONSENT_WITHDRAWAL_REASON = {
  GUARDIAN: 'guardian_request',
  ADMIN_ON_GUARDIAN_REQUEST: 'admin_on_guardian_request',
  GUARDIAN_ACCOUNT_DELETED: 'guardian_account_deleted',
} as const

export type ConsentWithdrawalReason =
  (typeof CONSENT_WITHDRAWAL_REASON)[keyof typeof CONSENT_WITHDRAWAL_REASON]

/** Event name emitted after the withdrawing transaction has committed. */
export const CONSENT_WITHDRAWN_EVENT = 'consent.withdrawn'

export interface ConsentWithdrawalEffect {
  consentId: string
  clubId: string
  teamId: string
  playerUserId: string
  guardianUserId: string | null
  /** Where the guardian notice goes (email is sent for every withdrawal). */
  guardianEmail: string
  reason: ConsentWithdrawalReason
  /** Admin's documented note (admin_on_guardian_request), echoed to the guardian. */
  note: string | null
  /** True when the child's PLAYER access to the team was revoked. */
  accessRevoked: boolean
  /** Parents whose PARENT team access was disconnected as a consequence. */
  disconnectedParentUserIds: string[]
}

export interface ConsentWithdrawnEventPayload {
  effects: ConsentWithdrawalEffect[]
  /** Who performed the withdrawal (null = system, e.g. account deletion). */
  actorUserId: string | null
}

type Tx = Prisma.TransactionClient

/**
 * Withdraw one APPROVED consent and revoke the access that depended on it.
 *
 * Returns null when the consent is no longer APPROVED (lost race, already
 * withdrawn, never approved) so callers can decide between idempotent success
 * and a conflict.
 *
 * Access is only revoked when no OTHER approved consent covers the same child
 * on the same team (a second guardian's consent keeps the child on the team).
 * The age gate (auth/age-gate.service.ts) then blocks the child for this
 * team (and for the club once no APPROVED consent in it remains).
 */
export async function withdrawApprovedConsentTx(
  tx: Tx,
  input: {
    consentId: string
    clubId: string
    actorUserId: string | null
    reason: ConsentWithdrawalReason
    note?: string | null
    now?: Date
  },
): Promise<ConsentWithdrawalEffect | null> {
  const now = input.now ?? new Date()

  // M1: serialize every consent decision for this child on this team (other
  // guardians' withdrawals, approvals, re-requests, loans, invites) so the
  // "another approved consent still covers the child" check below cannot
  // write-skew. Same key as lockPlayerTeamAccess everywhere else.
  const target = await tx.parentalConsent.findFirst({
    where: { id: input.consentId, clubId: input.clubId },
    select: { teamId: true, playerUserId: true },
  })
  if (!target) return null
  await lockPlayerTeamAccess(tx, input.clubId, target.teamId, target.playerUserId)

  const claimed = await tx.parentalConsent.updateMany({
    where: {
      id: input.consentId,
      clubId: input.clubId,
      status: ParentalConsentStatus.APPROVED,
    },
    data: {
      status: ParentalConsentStatus.WITHDRAWN,
      withdrawnAt: now,
      withdrawnByUserId: input.actorUserId,
      withdrawalReason: input.reason,
      withdrawalNote: input.note?.trim() || null,
    },
  })
  if (claimed.count !== 1) return null

  const consent = await tx.parentalConsent.findFirst({
    where: { id: input.consentId, clubId: input.clubId },
    select: { teamId: true, playerUserId: true, guardianUserId: true, guardianEmail: true },
  })
  if (!consent) return null

  const otherApproved = await tx.parentalConsent.count({
    where: {
      clubId: input.clubId,
      teamId: consent.teamId,
      playerUserId: consent.playerUserId,
      status: ParentalConsentStatus.APPROVED,
      id: { not: input.consentId },
    },
  })

  let accessRevoked = false
  let disconnectedParentUserIds: string[] = []
  if (otherApproved === 0) {
    const revoked = await tx.teamAccess.updateMany({
      where: {
        clubId: input.clubId,
        teamId: consent.teamId,
        userId: consent.playerUserId,
        role: TeamRole.PLAYER,
        status: { in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING] },
      },
      data: { status: TeamAccessStatus.REVOKED },
    })
    accessRevoked = revoked.count > 0

    // Channel rows only carry mute / custom-group membership (access is
    // role-derived), but a stale custom-group row would keep the child in
    // that group's member list. Drop team channels, and club-wide channels
    // too when the child has no remaining active team in this club.
    await tx.channelMember.deleteMany({
      where: { userId: consent.playerUserId, channel: { teamId: consent.teamId } },
    })
    const remainingActive = await tx.teamAccess.count({
      where: {
        clubId: input.clubId,
        userId: consent.playerUserId,
        status: TeamAccessStatus.ACTIVE,
      },
    })
    if (remainingActive === 0) {
      await tx.channelMember.deleteMany({
        where: { userId: consent.playerUserId, channel: { clubId: input.clubId } },
      })
    }

    const disconnected = await reconcileGuardianTeamAccess(tx, {
      clubId: input.clubId,
      teamId: consent.teamId,
      affectedPlayerUserIds: [consent.playerUserId],
      now,
    })
    disconnectedParentUserIds = [...disconnected]

    if (accessRevoked) {
      await detachFromFutureTeamActivity(tx, {
        clubId: input.clubId,
        teamId: consent.teamId,
        playerUserId: consent.playerUserId,
        now,
      })
    }
  }

  await tx.auditLog.create({
    data: {
      clubId: input.clubId,
      type: 'consent.withdrawn',
      actorType: input.actorUserId ? 'user' : 'system',
      actorId: input.actorUserId,
      actorLabel: null,
      summary: `Parental consent ${input.consentId} withdrawn for player ${consent.playerUserId} (${input.reason})`,
      metadata: {
        consentId: input.consentId,
        teamId: consent.teamId,
        playerUserId: consent.playerUserId,
        reason: input.reason,
        accessRevoked,
        // L5: the admin's documentation of the guardian's written request.
        note: input.note?.trim() || null,
      },
    },
  })

  return {
    consentId: input.consentId,
    clubId: input.clubId,
    teamId: consent.teamId,
    playerUserId: consent.playerUserId,
    guardianUserId: consent.guardianUserId,
    guardianEmail: consent.guardianEmail,
    reason: input.reason,
    note: input.note?.trim() || null,
    accessRevoked,
    disconnectedParentUserIds,
  }
}

/**
 * M4: a child whose team access was revoked must not stay live on the team.
 * Future (not yet started, not cancelled) team activity only; history stays:
 *  - RSVPs (and with them the Kader nomination) for future events,
 *  - carpool seats on future events,
 *  - lineup entries of future events (and the mirrored fixture overlay),
 *  - open duty assignments (Trikotwäsche, Kabinendienst, ...) not yet due.
 * The TeamMember row and past records are kept (see docs/compliance/RELEASE_GATE.md).
 */
export async function detachFromFutureTeamActivity(
  tx: Tx,
  input: { clubId: string; teamId: string; playerUserId: string; now: Date },
): Promise<void> {
  const futureEvent = { teamId: input.teamId, date: { gte: input.now } }

  await tx.rsvp.deleteMany({
    where: { userId: input.playerUserId, event: { is: futureEvent } },
  })
  await tx.carpoolSeat.deleteMany({
    where: {
      clubId: input.clubId,
      userId: input.playerUserId,
      ride: { is: { event: { is: futureEvent } } },
    },
  })
  await tx.teamDutyAssignment.deleteMany({
    where: {
      clubId: input.clubId,
      teamId: input.teamId,
      assignedUserId: input.playerUserId,
      status: 'PENDING',
      OR: [{ dueDate: null }, { dueDate: { gte: input.now } }],
    },
  })

  const events = await tx.event.findMany({
    where: { clubId: input.clubId, ...futureEvent, lineup: { not: Prisma.DbNull } },
    select: { id: true, fixtureId: true, lineup: true },
  })
  for (const event of events) {
    const cleaned = withoutPlayer(event.lineup, input.playerUserId)
    if (!cleaned) continue
    await tx.event.update({
      where: { id: event.id },
      data: { lineup: cleaned as Prisma.InputJsonValue },
    })
    if (event.fixtureId) {
      await tx.fixtureOverlay.updateMany({
        where: { clubId: input.clubId, fixtureId: event.fixtureId },
        data: {
          lineup: {
            formation: cleaned.formation,
            starters: cleaned.starters.map(publicLineupEntry),
            bench: cleaned.bench.map(publicLineupEntry),
          } as Prisma.InputJsonValue,
        },
      })
    }
  }
}

type LineupEntry = Record<string, unknown>
type Lineup = { formation: unknown; starters: LineupEntry[]; bench: LineupEntry[] } & Record<string, unknown>

/** Returns the lineup without the player, or null when nothing changed. */
export function withoutPlayer(raw: unknown, playerUserId: string): Lineup | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const starters = Array.isArray(value.starters) ? (value.starters as LineupEntry[]) : []
  const bench = Array.isArray(value.bench) ? (value.bench as LineupEntry[]) : []
  const keep = (p: LineupEntry) => !(p && typeof p === 'object' && p.userId === playerUserId)
  const nextStarters = starters.filter(keep)
  const nextBench = bench.filter(keep)
  if (nextStarters.length === starters.length && nextBench.length === bench.length) return null
  return { ...value, formation: value.formation, starters: nextStarters, bench: nextBench }
}

function publicLineupEntry(p: LineupEntry) {
  return { number: p.number ?? null, name: p.name ?? '', position: p.position ?? null }
}
