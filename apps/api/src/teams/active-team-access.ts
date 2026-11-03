import { LAUNCH_FEATURES, TeamAccessStatus } from '@anstoss/shared'
import { Prisma } from '@prisma/client'

/** A dated loan stops granting access at its end time, even before cleanup runs. */
export function activeTeamAccessWhere(now = new Date()): Prisma.TeamAccessWhereInput {
  return {
    status: TeamAccessStatus.ACTIVE,
    OR: [{ loanEndDate: null }, { loanEndDate: { gt: now } }],
  }
}

/** Disabled guardian roles must not expand adult-only navigation or audiences. */
export function activeLaunchTeamAccessWhere(now = new Date()): Prisma.TeamAccessWhereInput {
  return { ...activeTeamAccessWhere(now),
    ...(!LAUNCH_FEATURES.youthParticipation ? { role: { not: 'PARENT' } } : {}),
  }
}
