import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { PushModule } from '../push/push.module'
import { ContributionsModule } from '../contributions/contributions.module'
import { ClubActivationModule } from '../club-activation/club-activation.module'
import { AdminInboxController } from './admin-inbox.controller'
import { AdminInboxService } from './admin-inbox.service'
import { ComplianceService } from './compliance.service'
import { ComplianceRetentionWorker } from './compliance-retention'

@Module({
  imports: [AuditModule, PushModule, ContributionsModule, ClubActivationModule],
  controllers: [AdminInboxController],
  providers: [AdminInboxService, ComplianceService, ComplianceRetentionWorker],
  exports: [AdminInboxService, ComplianceService],
})
export class AdminInboxModule {}
