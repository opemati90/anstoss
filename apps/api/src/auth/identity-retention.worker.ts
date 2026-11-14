import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/** The email safety block expires at 30 days; retaining its hash beyond that
 * serves no purpose. Legacy Clerk tokens are no longer accepted by our guard.
 * Only these known marker types are removed, never arbitrary audit records. */
@Injectable()
export class IdentityRetentionWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null
  private readonly logger = new Logger(IdentityRetentionWorker.name)
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.sweep(), 60_000)
    this.timer.unref?.()
    void this.sweep()
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer) }
  async sweep(now = new Date()) {
    try {
      return await this.prisma.authIdentityTombstone.deleteMany({
        where: {
          provider: { in: ['clerk', 'email-underage'] },
          createdAt: { lte: new Date(now.getTime() - 30 * 86_400_000) },
        },
      })
    } catch {
      this.logger.error('Expired identity marker cleanup failed; will retry')
      return null
    }
  }
}
