import {
  JoinRequestStatus,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamRole,
  TrialInviteStatus,
} from '@anstoss/shared'
import { activeTeamAccessWhere } from '../teams/active-team-access'

/**
 * Wechselbörse safeguards shared by the marketplace, the join-request
 * (Aufnahmeantrag) flow, the team read checks and the retention sweep.
 * Adversarial review fixes 2026-09-24.
 */

/** TRIAL access ends this many days after the last (non-cancelled) session. */
export const TRIAL_ACCESS_GRACE_DAYS = 3
/** A closed trial keeps the player's card readable for the club this long. */
export const TRIAL_PROFILE_GRACE_DAYS = 14
/** Concurrent open Probetrainings a club may run (B1). */
export const MAX_OPEN_TRIALS_PER_CLUB = 10
/** Statuses that occupy one of those slots: the club has invited the player. */
export const CAPPED_TRIAL_STATUSES = [
  TrialInviteStatus.PENDING,
  TrialInviteStatus.ACCEPTED,
  TrialInviteStatus.OFFERED,
]
/** Player-side trial requests: one per club per 24h, a few per day overall (M5). */
export const TRIAL_REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000
export const TRIAL_REQUEST_DAILY_CAP = 5
/** Aufnahmeantrag contact data is erased this long after a rejection/withdrawal (M2). */
export const JOIN_REQUEST_PII_RETENTION_DAYS = 30

/** Invite statuses in which the player holds TRIAL team access. */
export const TRIAL_ACCESS_STATUSES = [TrialInviteStatus.ACCEPTED, TrialInviteStatus.OFFERED]

const DAY_MS = 24 * 60 * 60 * 1000

/** Aufnahmeantrag copies of personal data, nulled on erasure. */
export const JOIN_REQUEST_PII_ERASURE = {
  street: null,
  postalCode: null,
  city: null,
  phone: null,
  nationality: null,
  lastMatchDate: null,
} as const

type SessionRow = { id: string; date: Date; cancelledAt: Date | null }

/**
 * TRIAL access is open while at least one session is not cancelled and the
 * last such session is less than TRIAL_ACCESS_GRACE_DAYS ago. No sessions at
 * all (legacy rows, L3) or all cancelled means closed.
 */
export function trialAccessOpen(sessions: SessionRow[], now = new Date()): boolean {
  const live = sessions.filter((session) => !session.cancelledAt)
  if (live.length === 0) return false
  const last = Math.max(...live.map((session) => new Date(session.date).getTime()))
  return last + TRIAL_ACCESS_GRACE_DAYS * DAY_MS > now.getTime()
}

export type TrialSessionScope = {
  /** The user's access to this team comes from a Wechselbörse trial. */
  wechsel: boolean
  /** Events the trialist may read; empty when the trial window is closed. */
  eventIds: string[]
}

type ScopeDb = {
  trialInvite: { findMany: (args: any) => Promise<Array<{ sessionEventIds: string[] }>> }
  event: { findMany: (args: any) => Promise<SessionRow[]> }
}

/**
 * H1: what a Probetraining player may read on a team: only the sessions of
 * their accepted/offered invite, and only while the trial window is open.
 */
export async function resolveTrialSessionScope(
  db: ScopeDb,
  userId: string,
  teamId: string,
  now = new Date(),
): Promise<TrialSessionScope> {
  const invites = await db.trialInvite.findMany({
    where: {
      teamId,
      status: { in: TRIAL_ACCESS_STATUSES },
      freeAgentProfile: { userId },
    },
    select: { sessionEventIds: true },
  })
  if (invites.length === 0) return { wechsel: false, eventIds: [] }
  const ids = Array.from(new Set(invites.flatMap((invite) => invite.sessionEventIds ?? [])))
  if (ids.length === 0) return { wechsel: true, eventIds: [] }
  const sessions = await db.event.findMany({
    where: { id: { in: ids }, teamId },
    select: { id: true, date: true, cancelledAt: true },
  })
  if (!trialAccessOpen(sessions, now)) return { wechsel: true, eventIds: [] }
  return { wechsel: true, eventIds: sessions.map((session) => session.id) }
}

/** Ends TRIAL access when a trial closes without joining. FULL rows are untouched. */
export async function revokeTrialAccess(tx: any, teamId: string, userId: string) {
  await tx.teamAccess.updateMany({
    where: {
      teamId,
      userId,
      role: TeamRole.PLAYER,
      phase: TeamAccessPhase.TRIAL,
      ...activeTeamAccessWhere(),
    },
    data: { status: TeamAccessStatus.REVOKED },
  })
}

/**
 * B2: when an invite leaves OFFERED (declined, rejected, revoked, expired,
 * withdrawn, profile deleted) its pending Aufnahmeantrag closes too. A
 * player-side close (WITHDRAWN) erases the contact data at once (M2); a club
 * rejection keeps it for the 30-day retention window.
 */
export async function closeLinkedJoinRequest(
  tx: any,
  inviteId: string,
  clubId: string,
  outcome: JoinRequestStatus.REJECTED | JoinRequestStatus.WITHDRAWN,
  actorUserId: string | null,
) {
  await tx.joinRequest.updateMany({
    where: { trialInviteId: inviteId, clubId, status: JoinRequestStatus.PENDING },
    data: {
      status: outcome,
      reviewedBy: actorUserId,
      reviewedAt: new Date(),
      ...(outcome === JoinRequestStatus.WITHDRAWN ? JOIN_REQUEST_PII_ERASURE : {}),
    },
  })
}
