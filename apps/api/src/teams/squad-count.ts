import { TeamAccessPhase, TeamAccessStatus, TeamRole } from '@anstoss/shared'
import { Prisma } from '@prisma/client'
import { activeTeamAccessWhere } from './active-team-access'
import { launchParticipantWhere } from '../auth/launch-access-policy'

/**
 * The one definition of "squad" used for every squad number in the app
 * (Kader header, home cards, event squadSize / readiness):
 *
 *   role PLAYER, phase FULL, access ACTIVE (loan not expired),
 *   TeamMember.operationalStatus not INACTIVE, and not currently loaned out
 *   to another team (Kader fix L5: a player on an active loan counts for the
 *   borrowing team only).
 *
 * Coaches, trialists (phase TRIAL) and inactive players are excluded; new
 * players (NEW_PLAYER) count.
 *
 * SQUAD_ACCESS_COUNT_WHERE is the static half, safe to embed in module-level
 * Prisma includes (`team._count.access`). The time-dependent loan rule and
 * operationalStatus (which lives on TeamMember and cannot be correlated
 * inside a relation count) are applied by countSquadExclusionsByTeam, which
 * returns how many counted rows to subtract per team.
 */
export const SQUAD_ACCESS_COUNT_WHERE = {
  status: TeamAccessStatus.ACTIVE,
  role: TeamRole.PLAYER,
  phase: TeamAccessPhase.FULL,
  get user() { return launchParticipantWhere() },
} satisfies Prisma.TeamAccessWhereInput

export type SquadCandidate = {
  role: string
  phase: string
  status: string
  operationalStatus: string | null | undefined
  loanEndDate?: Date | string | null
  /** True while an active loan places this player in another team (L5). */
  loanedOut?: boolean
}

/** In-memory twin of the squad rule, for code that already holds the rows. */
export function isSquadMember(entry: SquadCandidate, now = new Date()): boolean {
  if (entry.role !== TeamRole.PLAYER) return false
  if (entry.phase !== TeamAccessPhase.FULL) return false
  if (entry.status !== TeamAccessStatus.ACTIVE) return false
  if (entry.loanEndDate && new Date(entry.loanEndDate).getTime() <= now.getTime()) return false
  if (entry.loanedOut) return false
  return (entry.operationalStatus ?? 'ACTIVE') !== 'INACTIVE'
}

type SquadCountClient = {
  teamAccess: {
    findMany: (args: any) => Promise<Array<{ teamId: string; userId: string }>>
  }
  teamMember: {
    findMany: (args: any) => Promise<Array<{ teamId: string; userId: string }>>
  }
}

/**
 * Players currently loaned OUT of each source team: an active PLAYER access
 * row in another team whose loanedFromTeamId is the source team. Keyed by
 * source team id. Shared by roster-ops, event squad counts and the duty rota.
 */
export async function loanedOutByTeam(
  prisma: { teamAccess: { findMany: (args: any) => Promise<any[]> } },
  teamIds: string[],
  now = new Date(),
): Promise<Map<string, Map<string, { teamId: string; loanEndDate: Date | null }>>> {
  const unique = Array.from(new Set(teamIds.filter(Boolean)))
  const result = new Map<string, Map<string, { teamId: string; loanEndDate: Date | null }>>()
  if (unique.length === 0) return result
  const rows = await prisma.teamAccess.findMany({
    where: {
      loanedFromTeamId: { in: unique },
      role: TeamRole.PLAYER,
      ...activeTeamAccessWhere(now),
    },
    select: { teamId: true, userId: true, loanedFromTeamId: true, loanEndDate: true },
  })
  for (const row of (rows ?? []) as Array<{
    teamId: string
    userId: string
    loanedFromTeamId: string | null
    loanEndDate?: Date | null
  }>) {
    if (!row.loanedFromTeamId) continue
    const perTeam = result.get(row.loanedFromTeamId) ?? new Map()
    perTeam.set(row.userId, { teamId: row.teamId, loanEndDate: row.loanEndDate ?? null })
    result.set(row.loanedFromTeamId, perTeam)
  }
  return result
}

/**
 * Rows matched by SQUAD_ACCESS_COUNT_WHERE that are not squad members: the
 * player is INACTIVE in that team, their loan has already ended, or they are
 * loaned out to another team right now. Three batched queries regardless of
 * how many teams are asked about.
 */
export async function countSquadExclusionsByTeam(
  prisma: SquadCountClient,
  teamIds: string[],
  now = new Date(),
): Promise<Map<string, number>> {
  const unique = Array.from(new Set(teamIds.filter(Boolean)))
  const exclusions = new Map<string, number>()
  if (unique.length === 0) return exclusions

  const [inactive, loanedOut] = await Promise.all([
    prisma.teamMember.findMany({
      where: { teamId: { in: unique }, operationalStatus: 'INACTIVE' },
      select: { teamId: true, userId: true },
    }),
    loanedOutByTeam(prisma, unique, now),
  ])
  const inactiveKeys = new Set(inactive.map((m) => `${m.teamId}:${m.userId}`))
  const loanedOutKeys = new Set<string>()
  for (const [teamId, users] of loanedOut) {
    for (const userId of users.keys()) loanedOutKeys.add(`${teamId}:${userId}`)
  }
  const candidateUserIds = Array.from(
    new Set([
      ...inactive.map((m) => m.userId),
      ...Array.from(loanedOutKeys, (key) => key.slice(key.indexOf(':') + 1)),
    ]),
  )

  const excluded = await prisma.teamAccess.findMany({
    where: {
      teamId: { in: unique },
      ...SQUAD_ACCESS_COUNT_WHERE,
      OR: [
        { loanEndDate: { lte: now } },
        ...(candidateUserIds.length > 0 ? [{ userId: { in: candidateUserIds } }] : []),
      ],
    },
    select: { teamId: true, userId: true, loanEndDate: true },
  })

  for (const row of excluded as Array<{ teamId: string; userId: string; loanEndDate?: Date | null }>) {
    const key = `${row.teamId}:${row.userId}`
    const loanEnded = row.loanEndDate != null && new Date(row.loanEndDate).getTime() <= now.getTime()
    if (!loanEnded && !inactiveKeys.has(key) && !loanedOutKeys.has(key)) continue
    exclusions.set(row.teamId, (exclusions.get(row.teamId) ?? 0) + 1)
  }
  return exclusions
}

/** An absence whose end date has passed reads as NONE. */
export function effectiveAbsence(
  absence: string | null | undefined,
  absenceUntil: Date | null | undefined,
  now = new Date(),
): { absence: 'NONE' | 'SUSPENDED' | 'AWAY'; absenceUntil: string | null } {
  if (absence !== 'SUSPENDED' && absence !== 'AWAY') {
    return { absence: 'NONE', absenceUntil: null }
  }
  if (absenceUntil && absenceUntil.getTime() < now.getTime()) {
    return { absence: 'NONE', absenceUntil: null }
  }
  return { absence, absenceUntil: absenceUntil ? absenceUntil.toISOString() : null }
}
