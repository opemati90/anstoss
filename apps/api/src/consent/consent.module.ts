import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { PushModule } from '../push/push.module'
import { ConsentController } from './consent.controller'
import { ConsentService } from './consent.service'
import { ConsentWithdrawalNotifier } from './consent-withdrawal.notifier'

@Module({
  imports: [AuditModule, PushModule],
  controllers: [ConsentController],
  providers: [ConsentService, ConsentWithdrawalNotifier],
  exports: [ConsentService],
})
export class ConsentModule {}
