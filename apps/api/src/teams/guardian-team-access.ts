import { MembershipRole, TeamAccessStatus, TeamRole } from '@anstoss/shared'
import { Prisma } from '@prisma/client'
import { activeTeamAccessWhere } from './active-team-access'

type ReconcileGuardianAccessInput = {
  clubId: string
  teamId: string
  affectedPlayerUserIds?: string[]
  affectedParentUserIds?: string[]
  now?: Date
}

/**
 * Recomputes target-team access that a guardian derives from linked players.
 * GuardianRelationship.teamId is deliberately not used to discover parents:
 * existing relationships are commonly anchored to a player's primary team.
 */
export async function reconcileGuardianTeamAccess(
  prisma: Prisma.TransactionClient,
  input: ReconcileGuardianAccessInput,
): Promise<Set<string>> {
  const now = input.now ?? new Date()
  const parentUserIds = new Set(input.affectedParentUserIds ?? [])

  if (input.affectedPlayerUserIds?.length) {
    const affectedLinks = await prisma.guardianRelationship.findMany({
      where: {
        clubId: input.clubId,
        playerUserId: { in: input.affectedPlayerUserIds },
      },
      select: { parentUserId: true },
    })
    for (const link of affectedLinks) parentUserIds.add(link.parentUserId)
  }

  const disconnect = new Set<string>()
  for (const parentUserId of [...parentUserIds].sort()) {
    await lockGuardianTeamAccess(prisma, input.clubId, input.teamId, parentUserId)
    const [membership, independentAccess, unregisteredChild, linkedPlayers, parentAccess] =
      await Promise.all([
        prisma.membership.findUnique({
          where: { userId_clubId: { userId: parentUserId, clubId: input.clubId } },
          select: { role: true },
        }),
        prisma.teamAccess.findFirst({
          where: {
            userId: parentUserId,
            teamId: input.teamId,
            role: { not: TeamRole.PARENT },
            ...activeTeamAccessWhere(now),
          },
          select: { id: true },
        }),
        prisma.guardianRelationship.findFirst({
          where: {
            clubId: input.clubId,
            parentUserId,
            teamId: input.teamId,
            playerUserId: null,
          },
          select: { id: true },
        }),
        prisma.guardianRelationship.findMany({
          where: {
            clubId: input.clubId,
            parentUserId,
            playerUserId: { not: null },
          },
          select: { playerUserId: true },
        }),
        prisma.teamAccess.findUnique({
          where: {
            teamId_userId_role: {
              teamId: input.teamId,
              userId: parentUserId,
              role: TeamRole.PARENT,
            },
          },
          select: { id: true, status: true },
        }),
      ])

    const isClubManager =
      membership?.role === MembershipRole.OWNER ||
      membership?.role === MembershipRole.ADMIN ||
      membership?.role === MembershipRole.COACH
    if (isClubManager || independentAccess || unregisteredChild) continue

    const linkedPlayerIds = linkedPlayers
      .map((link) => link.playerUserId)
      .filter((id): id is string => Boolean(id))
    const livePlayerAccess = linkedPlayerIds.length
      ? await prisma.teamAccess.findMany({
          where: {
            teamId: input.teamId,
            userId: { in: linkedPlayerIds },
            role: TeamRole.PLAYER,
            ...activeTeamAccessWhere(now),
          },
          select: { loanEndDate: true },
        })
      : []

    if (livePlayerAccess.length > 0) {
      if (parentAccess) {
        const loanEndDate = livePlayerAccess.some((access) => access.loanEndDate === null)
          ? null
          : new Date(Math.max(...livePlayerAccess.map((access) => access.loanEndDate!.getTime())))
        await prisma.teamAccess.updateMany({
          where: { id: parentAccess.id },
          data: { status: TeamAccessStatus.ACTIVE, loanEndDate },
        })
      }
      continue
    }

    if (parentAccess?.status === TeamAccessStatus.ACTIVE) {
      await prisma.teamAccess.updateMany({
        where: { id: parentAccess.id, status: TeamAccessStatus.ACTIVE },
        data: { status: TeamAccessStatus.REVOKED },
      })
    }
    disconnect.add(parentUserId)
  }

  return disconnect
}

export async function lockGuardianTeamAccess(
  prisma: Pick<Prisma.TransactionClient, '$executeRaw'>,
  clubId: string,
  teamId: string,
  parentUserId: string,
): Promise<void> {
  const lockKey = `${clubId}:${teamId}:${parentUserId}:parent-access`
  await prisma.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
  )
}

export async function lockPlayerTeamAccess(
  prisma: Pick<Prisma.TransactionClient, '$executeRaw'>,
  clubId: string,
  teamId: string,
  playerUserId: string,
): Promise<void> {
  const lockKey = `${clubId}:${teamId}:${playerUserId}:player-access`
  await prisma.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
  )
}
