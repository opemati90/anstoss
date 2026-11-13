import { ClubOperationalRole } from '@anstoss/shared'

/**
 * Vorschau und Vertretung: who may stand in for a coach, and the lookup the
 * team permission checks use to honour a running session.
 *
 * Scope (docs/redesign/handoff/REVAMP_HANDOFF.md): Vorstand (club OWNER or
 * ADMIN) in any team; a Teammanager only in their own team. Until the
 * per-team TEAM_MANAGER role lands, a Teammanager is a member holding the
 * club-level TEAM_COORDINATOR operational role.
 */
export type ActingScope = 'BOARD' | 'TEAM_MANAGER'

export function actingScopeFor(
  membership: { role: string; operationalRoles?: readonly string[] | null } | null | undefined,
): ActingScope | null {
  if (!membership) return null
  if (membership.role === 'OWNER' || membership.role === 'ADMIN') return 'BOARD'
  if ((membership.operationalRoles ?? []).includes(ClubOperationalRole.TEAM_COORDINATOR)) {
    return 'TEAM_MANAGER'
  }
  return null
}

/** Attribution label: "Yemi (Vorstand) als Trainer". */
export function actingAttribution(actorName: string, scope: ActingScope): string {
  return `${actorName} (${scope === 'BOARD' ? 'Vorstand' : 'Teammanager'}) als Trainer`
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
 * The id of `userId`'s running coach session for `teamId` in `clubId`, or
 * null. Server-enforced: callers must also require a current club membership,
 * so leaving the club ends the grant even before the session expires.
 */
export async function findActiveCoachActingSessionId(
  prisma: ActingLookupClient,
  input: { userId: string; teamId: string; clubId: string },
  now = new Date(),
): Promise<string | null> {
  const session = await prisma.actingSession.findFirst({
    where: {
      ...activeActingSessionWhere(input.userId, now),
      teamId: input.teamId,
      clubId: input.clubId,
      role: 'COACH',
    },
    select: { id: true },
  })
  return session?.id ?? null
}
