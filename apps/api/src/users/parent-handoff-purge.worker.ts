import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000
// Keep redeemed rows briefly for a support/audit window, then purge — the
// child's name + DOB have already been carried into the managed sub-profile.
const REDEEMED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Storage-limitation purge for {@link ParentHandoff} (GDPR Art. 5(1)(e)). A
 * handoff holds a minor's first name + DOB + a guardian email, so we don't keep
 * it past its purpose: expired (never-redeemed) rows go immediately; redeemed
 * rows go after a short audit window. The codebase has no ScheduleModule, so we
 * follow the existing setInterval-on-init worker pattern (contributions /
 * event-reminder workers).
 */
@Injectable()
export class ParentHandoffPurgeWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ParentHandoffPurgeWorker.name)
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.PARENT_HANDOFF_PURGE_DISABLED === 'true'
    ) {
      return
    }

    this.timer = setInterval(() => {
      void this.runCycle()
    }, DEFAULT_INTERVAL_MS)
    this.timer.unref?.()

    void this.runCycle()
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer)
    }
  }

  async runCycle() {
    const now = new Date()
    try {
      const { count } = await this.prisma.parentHandoff.deleteMany({
        where: {
          OR: [
            // Expired and never redeemed.
            { status: { not: 'REDEEMED' }, expiresAt: { lt: now } },
            // Redeemed past the audit window.
            {
              status: 'REDEEMED',
              redeemedAt: { lt: new Date(now.getTime() - REDEEMED_RETENTION_MS) },
            },
          ],
        },
      })
      if (count > 0) {
        this.logger.log(`Purged ${count} expired/redeemed parent handoff(s).`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      this.logger.warn(`Parent handoff purge failed: ${message}`)
    }
  }
}
