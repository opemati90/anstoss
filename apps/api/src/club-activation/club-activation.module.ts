import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { BillingModule } from '../billing/billing.module'
import { ChannelsModule } from '../channels/channels.module'
import { ClubActivationController } from './club-activation.controller'
import { PlatformClubActivationController } from './platform-club-activation.controller'
import { ClubActivationService } from './club-activation.service'
import { GovernanceRetentionWorker } from './governance-retention.worker'

@Module({
  imports: [AuditModule, BillingModule, ChannelsModule],
  controllers: [ClubActivationController, PlatformClubActivationController],
  providers: [ClubActivationService, GovernanceRetentionWorker],
  exports: [ClubActivationService],
})
export class ClubActivationModule {}
