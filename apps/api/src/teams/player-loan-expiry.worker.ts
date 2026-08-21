import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { TeamAccessStatus } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'
import { activeTeamAccessWhere } from './active-team-access'

const DEFAULT_INTERVAL_MS = 30_000

@Injectable()
export class PlayerLoanExpiryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlayerLoanExpiryWorker.name)
  private timer: NodeJS.Timeout | null = null
  private isRunning = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.tick(), DEFAULT_INTERVAL_MS)
    this.timer.unref?.()
    void this.tick()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async tick(): Promise<void> {
    if (this.isRunning) return
    this.isRunning = true
    try {
      await this.runCycle()
    } catch (error) {
      this.logger.error(
        'Failed to expire player loans; the next scheduled cycle will retry.',
        error instanceof Error ? error.stack : String(error),
      )
    } finally {
      this.isRunning = false
    }
  }

  async runCycle(now = new Date()): Promise<number> {
    const expired = await this.prisma.teamAccess.findMany({
      where: {
        status: TeamAccessStatus.ACTIVE,
        loanEndDate: { lte: now },
      },
      select: {
        id: true,
        clubId: true,
        teamId: true,
        userId: true,
        role: true,
        loanedFromTeamId: true,
      },
      take: 500,
    })

    const byClub = new Map<string, typeof expired>()
    for (const row of expired) {
      const rows = byClub.get(row.clubId) ?? []
      rows.push(row)
      byClub.set(row.clubId, rows)
    }

    let revoked = 0
    for (const [clubId, rows] of byClub) {
      const disconnectedUserIds = await tenantContext.run(
        { clubId, userId: 'system' },
        async () => {
          const expiredPlayerLoans = rows.filter(
            (row) => row.role === 'PLAYER' && row.loanedFromTeamId,
          )
          const guardianLinks = expiredPlayerLoans.length
            ? await this.prisma.guardianRelationship.findMany({
                where: {
                  OR: expiredPlayerLoans.map((row) => ({
                    playerUserId: row.userId,
                    teamId: row.teamId,
                  })),
                },
                select: { parentUserId: true, teamId: true },
              })
            : []

          const result = await this.prisma.teamAccess.updateMany({
            where: {
              id: { in: rows.map((row) => row.id) },
              status: TeamAccessStatus.ACTIVE,
              loanEndDate: { lte: now },
            },
            data: { status: TeamAccessStatus.REVOKED },
          })
          revoked += result.count

          const userIds = new Set(rows.map((row) => row.userId))
          for (const link of guardianLinks) {
            if (!link.teamId) continue
            if (!(await this.guardianRetainsAccess(link.parentUserId, clubId, link.teamId))) {
              userIds.add(link.parentUserId)
            }
          }
          return userIds
        },
      )
      for (const userId of disconnectedUserIds) {
        this.eventEmitter.emit('realtime.access.changed', { userId })
      }
    }

    if (revoked > 0) this.logger.log(`Revoked ${revoked} expired player loan(s).`)
    return revoked
  }

  private async guardianRetainsAccess(
    parentUserId: string,
    clubId: string,
    teamId: string,
  ): Promise<boolean> {
    const [membership, directAccess, guardianLink] = await Promise.all([
      this.prisma.membership.findUnique({
        where: { userId_clubId: { userId: parentUserId, clubId } },
        select: { role: true },
      }),
      this.prisma.teamAccess.findFirst({
        where: { userId: parentUserId, teamId, ...activeTeamAccessWhere() },
        select: { id: true },
      }),
      this.prisma.guardianRelationship.findFirst({
        where: {
          parentUserId,
          teamId,
          OR: [
            { playerUserId: null },
            {
              player: {
                teamAccess: { some: { teamId, ...activeTeamAccessWhere() } },
              },
            },
          ],
        },
        select: { id: true },
      }),
    ])

    return (
      membership?.role === 'OWNER' ||
      membership?.role === 'ADMIN' ||
      membership?.role === 'COACH' ||
      Boolean(directAccess) ||
      Boolean(guardianLink)
    )
  }
}
