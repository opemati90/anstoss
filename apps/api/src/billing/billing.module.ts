import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { BillingController } from './billing.controller'
import { BillingService } from './billing.service'
import { StripeProvider } from './stripe.provider'
import { EntitlementGuard } from './entitlement.guard'

@Module({
  imports: [AuditModule],
  controllers: [BillingController],
  providers: [StripeProvider, BillingService, EntitlementGuard],
  exports: [BillingService, EntitlementGuard],
})
export class BillingModule {}
