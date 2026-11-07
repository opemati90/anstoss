import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ClubActivationService } from './club-activation.service'

@Injectable()
export class ClaimApprovalWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout
  private running = false
  private readonly logger = new Logger(ClaimApprovalWorker.name)
  constructor(private readonly activation: ClubActivationService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.tick(), 60_000)
    this.timer.unref()
    void this.tick()
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer) }
  async tick() {
    if (this.running || process.env.ANSTOSS_MIGRATION_MAINTENANCE === 'true') return
    this.running = true
    try { await this.activation.runAutomaticApprovals() }
    catch { this.logger.error('Automatic claim assessment failed; applications remain in review') }
    finally { this.running = false }
  }
}
