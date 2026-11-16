import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { storeEnvironmentSchema, storePlatformSchema } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { StoreBillingService } from './store-billing.service'
import { StoreBillingProvider } from './store-billing.provider'

const INTERVAL_MS = 15 * 60 * 1000

/** Recovery for missed webhooks and purchases interrupted before acknowledgement. */
@Injectable()
export class StoreBillingWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StoreBillingWorker.name)
  private timer?: NodeJS.Timeout
  private running = false

  constructor(private readonly prisma: PrismaService, private readonly billing: StoreBillingService, private readonly provider: StoreBillingProvider) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.ANSTOSS_IAP_ENABLED !== 'true') return
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS)
    this.timer.unref()
    void this.tick()
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer) }

  async runCycle() {
    const subscriptions = await this.prisma.storeSubscription.findMany({
      // Apple can reverse a refund. Re-check revoked Apple chains too; Google
      // replacement tombstones remain authoritative in reconcile().
      where: { lastCheckedAt: { lt: new Date(Date.now() - INTERVAL_MS) },
        OR: [{ status: { not: 'REVOKED' } }, { store: 'APPLE' }] },
      orderBy: { lastCheckedAt: 'asc' }, take: 100,
    })
    for (const subscription of subscriptions) {
      try {
        await this.billing.reconcile({
          store: storePlatformSchema.parse(subscription.store),
          environment: storeEnvironmentSchema.parse(subscription.environment),
          reference: this.provider.unseal(subscription.sealedReference),
        })
      } catch {
        // No SDK error, receipt or token in logs. Expiry stays fail-closed even
        // during a store outage. Update attempt time to avoid starving later rows.
        this.logger.warn(`Subscription reconciliation needs retry: ${subscription.id}`)
        await this.prisma.storeSubscription.update({ where: { id: subscription.id }, data: { lastCheckedAt: new Date() } })
      }
    }
  }

  private async tick() {
    if (this.running) return
    this.running = true
    try { await this.runCycle() }
    catch { this.logger.warn('Subscription reconciliation cycle failed') }
    finally { this.running = false }
  }
}
