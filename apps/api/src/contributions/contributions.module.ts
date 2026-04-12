import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { PushModule } from '../push/push.module'
import { ContributionsController } from './contributions.controller'
import { ContributionsReminderWorker } from './contributions-reminder.worker'
import { ContributionsService } from './contributions.service'

@Module({
  imports: [AuditModule, PushModule],
  controllers: [ContributionsController],
  providers: [ContributionsService, ContributionsReminderWorker],
  exports: [ContributionsService],
})
export class ContributionsModule {}
