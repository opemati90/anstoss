import { TeamAccessStatus } from '@anstoss/shared'
import { Prisma } from '@prisma/client'

/** A dated loan stops granting access at its end time, even before cleanup runs. */
export function activeTeamAccessWhere(now = new Date()): Prisma.TeamAccessWhereInput {
  return {
    status: TeamAccessStatus.ACTIVE,
    OR: [{ loanEndDate: null }, { loanEndDate: { gt: now } }],
  }
}
