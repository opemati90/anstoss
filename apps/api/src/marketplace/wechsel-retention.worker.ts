import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { JoinRequestStatus, TeamAccessPhase, TeamRole } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'
import { activeTeamAccessWhere } from '../teams/active-team-access'
import {
  JOIN_REQUEST_PII_ERASURE,
  JOIN_REQUEST_PII_RETENTION_DAYS,
  resolveTrialSessionScope,
  revokeTrialAccess,
} from './trial-access'

const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Wechselbörse retention sweep (review fixes 2026-09-24), hourly:
 *
 *  - H1: TRIAL team access ends TRIAL_ACCESS_GRACE_DAYS after the last trial
 *    session, and once every session is cancelled. The read checks already
 *    close it at read time; this persists the revocation. A TRIAL row of a
 *    non-member with no trial invite behind it is stale and revoked too.
 *    Events are not touched: a cancellation is picked up here and at read time.
 *  - M2: Aufnahmeantrag contact data (address, phone, nationality, last match)
 *    is erased 30 days after a rejection or withdrawal.
 */
@Injectable()
export class WechselRetentionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WechselRetentionWorker.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return
    if (process.env.WECHSEL_RETENTION_SWEEP_DISABLED === 'true') return
    this.timer = setInterval(() => void this.tick(), SWEEP_INTERVAL_MS)
    this.timer.unref?.()
    void this.tick()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const revoked = await this.expireTrialAccess()
      const erased = await this.eraseJoinRequestPii()
      if (revoked || erased) {
        this.logger.log(`Wechsel sweep: ${revoked} trial access revoked, ${erased} applications erased`)
      }
    } catch (error) {
      this.logger.error(
        'Wechsel retention sweep failed; the next cycle retries.',
        error instanceof Error ? error.stack : String(error),
      )
    } finally {
      this.running = false
    }
  }

  async expireTrialAccess(now = new Date()): Promise<number> {
    const rows: Array<{ clubId: string; teamId: string; userId: string }> =
      await tenantContext.exit(() =>
        this.prisma.teamAccess.findMany({
          where: {
            role: TeamRole.PLAYER,
            phase: TeamAccessPhase.TRIAL,
            ...activeTeamAccessWhere(now),
          },
          select: { clubId: true, teamId: true, userId: true },
        }),
      )
    let revoked = 0
    for (const row of rows) {
      const close = await tenantContext.run(
        { clubId: row.clubId, userId: 'system:wechsel-retention' },
        async () => {
          const scope = await resolveTrialSessionScope(this.prisma as any, row.userId, row.teamId, now)
          if (scope.wechsel) return scope.eventIds.length === 0
          const membership = await this.prisma.membership.findUnique({
            where: { userId_clubId: { userId: row.userId, clubId: row.clubId } },
            select: { id: true },
          })
          return !membership
        },
      )
      if (!close) continue
      await tenantContext.run({ clubId: row.clubId, userId: 'system:wechsel-retention' }, () =>
        this.prisma.$transaction(async (tx: any) => {
          await revokeTrialAccess(tx, row.teamId, row.userId)
        }),
      )
      revoked += 1
    }
    return revoked
  }

  async eraseJoinRequestPii(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - JOIN_REQUEST_PII_RETENTION_DAYS * DAY_MS)
    const result = await this.prisma.joinRequest.updateMany({
      where: {
        status: { in: [JoinRequestStatus.REJECTED, JoinRequestStatus.WITHDRAWN] },
        reviewedAt: { lt: cutoff },
        OR: [
          { street: { not: null } },
          { postalCode: { not: null } },
          { city: { not: null } },
          { phone: { not: null } },
          { nationality: { not: null } },
          { lastMatchDate: { not: null } },
        ],
      },
      data: JOIN_REQUEST_PII_ERASURE,
    })
    return result.count
  }
}

