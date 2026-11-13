import { ClubOperationalRole } from '@anstoss/shared'

/**
 * Vorschau und Vertretung: who may act as a team's coach, and the lookup the
 * team permission checks use to honour a running session.
 */

/** Club roles that may start a stand-in session ("Vorstand und Teammanager"). */
const ACTING_MEMBERSHIP_ROLES = new Set(['OWNER', 'ADMIN'])
const ACTING_OPERATIONAL_ROLES = new Set<string>([
  ClubOperationalRole.BOARD_MEMBER,
  ClubOperationalRole.TEAM_COORDINATOR,
])

export function canStartActingSession(
  membership: { role: string; operationalRoles?: readonly string[] | null } | null | undefined,
): boolean {
  if (!membership) return false
  if (ACTING_MEMBERSHIP_ROLES.has(membership.role)) return true
  return (membership.operationalRoles ?? []).some((role) => ACTING_OPERATIONAL_ROLES.has(role))
}

/** Prisma `where` for the actor's running (not ended, not expired) sessions. */
export function activeActingSessionWhere(actorUserId: string, now = new Date()) {
  return { actorUserId, endedAt: null, expiresAt: { gt: now } }
}

type ActingLookupClient = {
  actingSession: {
    findFirst(args: {
      where: Record<string, unknown>
      select: { id: true }
    }): Promise<{ id: string } | null>
  }
}

/**
 * True when `userId` has a running coach session for `teamId` in `clubId`.
 * Server-enforced: callers must also require a current club membership, so
 * leaving the club ends the grant even before the session expires.
 */
export async function hasActiveCoachActingSession(
  prisma: ActingLookupClient,
  input: { userId: string; teamId: string; clubId: string },
  now = new Date(),
): Promise<boolean> {
  const session = await prisma.actingSession.findFirst({
    where: {
      ...activeActingSessionWhere(input.userId, now),
      teamId: input.teamId,
      clubId: input.clubId,
      role: 'COACH',
    },
    select: { id: true },
  })
  return Boolean(session)
}
