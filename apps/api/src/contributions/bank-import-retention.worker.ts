import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'

const RETENTION_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000

@Injectable()
export class BankImportRetentionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BankImportRetentionWorker.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.tick(), RETENTION_SWEEP_INTERVAL_MS)
    this.timer.unref?.()
    void this.tick()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async purgeExpired(now = new Date()) {
    const clubs = await this.prisma.club.findMany({ select: { id: true } })
    let count = 0
    for (const club of clubs) {
      const result = await tenantContext.run({ clubId: club.id, userId: 'system' }, () =>
        this.prisma.bankImportBatch.updateMany({
          where: {
            clubId: club.id,
            rawExpiresAt: { lte: now },
            rawObjectKey: { not: null },
            rawPurgedAt: null,
          },
          data: { rawObjectKey: null, rawPurgedAt: now },
        }),
      )
      count += result.count
    }
    return { count }
  }

  private async tick() {
    if (this.running) return
    this.running = true
    try {
      const result = await this.purgeExpired()
      if (result.count > 0) this.logger.log(`Purged raw payload metadata for ${result.count} bank imports.`)
    } catch (error) {
      this.logger.error(
        `Bank import retention sweep failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    } finally {
      this.running = false
    }
  }
}
