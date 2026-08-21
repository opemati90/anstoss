import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { TeamAccessStatus } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'
import { lockPlayerTeamAccess, reconcileGuardianTeamAccess } from './guardian-team-access'

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
      const disconnectedUserIds = await tenantContext.run({ clubId, userId: 'system' }, () =>
        this.prisma.$transaction(async (tx) => {
          const expiredPlayerLoans = rows.filter(
            (row) => row.role === 'PLAYER' && row.loanedFromTeamId,
          )
          for (const row of [...expiredPlayerLoans].sort((a, b) =>
            `${a.teamId}:${a.userId}`.localeCompare(`${b.teamId}:${b.userId}`),
          )) {
            await lockPlayerTeamAccess(tx, clubId, row.teamId, row.userId)
          }
          const result = await tx.teamAccess.updateMany({
            where: {
              id: { in: rows.map((row) => row.id) },
              status: TeamAccessStatus.ACTIVE,
              loanEndDate: { lte: now },
            },
            data: { status: TeamAccessStatus.REVOKED },
          })
          const userIds = new Set(
            rows.filter((row) => row.role !== 'PARENT').map((row) => row.userId),
          )
          const targetTeamIds = [...new Set(rows.map((row) => row.teamId).filter(Boolean))].sort()
          for (const teamId of targetTeamIds) {
            const guardianDisconnects = await reconcileGuardianTeamAccess(tx, {
              clubId,
              teamId,
              now,
              affectedPlayerUserIds: expiredPlayerLoans
                .filter((row) => row.teamId === teamId)
                .map((row) => row.userId),
              affectedParentUserIds: rows
                .filter((row) => row.teamId === teamId && row.role === 'PARENT')
                .map((row) => row.userId),
            })
            for (const parentUserId of guardianDisconnects) userIds.add(parentUserId)
          }
          return { userIds, count: result.count }
        }),
      )
      revoked += disconnectedUserIds.count
      for (const userId of disconnectedUserIds.userIds) {
        this.eventEmitter.emit('realtime.access.changed', { userId })
      }
    }

    if (revoked > 0) this.logger.log(`Revoked ${revoked} expired player loan(s).`)
    return revoked
  }
}
