import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { InboxService } from './inbox.service'

const DAY_MS = 24 * 60 * 60 * 1000

/** Daily cleanup of inbox entries past the retention window. */
@Injectable()
export class InboxPruneWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboxPruneWorker.name)
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly inbox: InboxService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.INBOX_PRUNE_WORKER_DISABLED === 'true') {
      return
    }
    this.timer = setInterval(() => void this.runCycle(), DAY_MS)
    this.timer.unref?.()
    void this.runCycle()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async runCycle() {
    try {
      const removed = await this.inbox.pruneOlderThan()
      if (removed > 0) this.logger.log(`Pruned ${removed} inbox notification(s)`)
    } catch (err) {
      this.logger.warn(`Inbox prune failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }
}
