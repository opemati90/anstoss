import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { MembershipRole, TeamRole } from '@anstoss/shared'
import { activeTeamAccessWhere } from '../teams/active-team-access'

/**
 * Who may run the Wechselbörse for a club:
 *   - OWNER / ADMIN: every team of the club.
 *   - Coaches (active HEAD_COACH / ASSISTANT_COACH access): the teams they
 *     coach. Probetraining is run by the Trainer, so this is deliberately
 *     not admin-only.
 */
export type TrialScope = { all: boolean; teamIds: string[] }

type ScopeClient = {
  membership: { findUnique: (args: any) => Promise<{ role: string } | null> }
  teamAccess: { findMany: (args: any) => Promise<Array<{ teamId: string }>> }
}

export async function resolveTrialScope(
  prisma: ScopeClient,
  clubId: string,
  userId: string,
): Promise<TrialScope> {
  const membership = await prisma.membership.findUnique({
    where: { userId_clubId: { userId, clubId } },
    select: { role: true },
  })
  if (!membership) {
    throw new ForbiddenException('Not a member of this club')
  }
  if (membership.role === MembershipRole.OWNER || membership.role === MembershipRole.ADMIN) {
    return { all: true, teamIds: [] }
  }
  const coached = await prisma.teamAccess.findMany({
    where: {
      clubId,
      userId,
      role: { in: [TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH] },
      ...activeTeamAccessWhere(),
      phase: 'FULL',
    },
    select: { teamId: true },
  })
  if (coached.length === 0) {
    throw new ForbiddenException('Only coaches and club admins can manage trials')
  }
  return { all: false, teamIds: Array.from(new Set(coached.map((row) => row.teamId))) }
}

export function scopeIncludesTeam(scope: TrialScope, teamId: string): boolean {
  return scope.all || scope.teamIds.includes(teamId)
}

/** 404 rather than 403 so a coach cannot probe other teams' records. */
export function assertTeamInScope(scope: TrialScope, teamId: string, what = 'Trial invite') {
  if (!scopeIncludesTeam(scope, teamId)) {
    throw new NotFoundException(`${what} not found`)
  }
}

export function teamFilterForScope(scope: TrialScope): { teamId?: { in: string[] } } {
  return scope.all ? {} : { teamId: { in: scope.teamIds } }
}
