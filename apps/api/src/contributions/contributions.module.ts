import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { PushModule } from '../push/push.module'
import { ContributionsController } from './contributions.controller'
import { ContributionsReminderWorker } from './contributions-reminder.worker'
import { ContributionsService } from './contributions.service'
import { ContributionImportsController } from './contribution-imports.controller'
import { ContributionImportsService } from './contribution-imports.service'
import { BankImportRetentionWorker } from './bank-import-retention.worker'
import { BillingModule } from '../billing/billing.module'

@Module({
  imports: [AuditModule, PushModule, BillingModule],
  controllers: [ContributionsController, ContributionImportsController],
  providers: [
    ContributionsService,
    ContributionsReminderWorker,
    ContributionImportsService,
    BankImportRetentionWorker,
  ],
  exports: [ContributionsService],
})
export class ContributionsModule {}
